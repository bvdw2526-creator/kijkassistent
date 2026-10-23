import { NextRequest, NextResponse, after } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import {
  MODES,
  SOURCE_IDS,
  fetchProfileInputs,
  buildProfileSignature,
  MATCH_PERCENT_METHOD,
  computeTasteProfile,
  resolveWatchInfo,
  StaleCacheRefresher,
  type RecommendationMode,
  type RankedCandidate,
  type RecommendationItem,
} from '@/lib/recommendationEngine'
import { upcomingForModes, type UpcomingTaste } from '@/lib/upcomingTitles'
import { withLatinTitles } from '@/lib/titleFallback'
import { localeFromRequest } from '@/lib/serverI18n'
import { localizeModes } from '@/lib/localizeTitles'
import { withLiveDeadline, LIVE_DEADLINE_MS } from '@/lib/liveDeadline'

// Standaard-timeout van Vercel's serverless functions (10s op Hobby) is te kort voor
// deze route bij een koude cache: veel losse TMDB-calls (aanbevelingen/cast/details per
// favoriet/rating) plus embeddings. 60s is het maximum dat zowel op Hobby als Pro werkt.
export const maxDuration = 60

// Hoelang een compleet berekend resultaat (alle 3 modi, inclusief kijkproviders)
// hergebruikt wordt zolang favorieten/ratings/watchlist/streamingdiensten niet zijn
// gewijzigd. Dit is de belangrijkste knop voor "voelt de app-start lokaal aan": een
// cache-hit slaat de hele scoring-pijplijn over en kost maar één Supabase-rondje.
// Was 6 uur; op 13 okt 2026 had maar 4 van de 26 gebruikers een lijst die jonger was, dus vrijwel elk bezoek wachtte op een
// nieuwe berekening. Wie iets nieuws wil, drukt op Vernieuwen: die vraagt met ?vers=1 altijd een verse berekening.
const RECOMMENDATIONS_RESULT_CACHE_MAX_AGE_HOURS = 24

async function cacheRecommendationsResult(
  supabase: SupabaseClient,
  userId: string,
  signature: string,
  result: Record<RecommendationMode, unknown[]>
): Promise<void> {
  await supabase.from('recommendations_cache').upsert(
    {
      user_id: userId,
      signature,
      focused: result.focused,
      balanced: result.balanced,
      explore: result.explore,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
}

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'recommendations', LIMITS.recommendations)
  if (!guard.ok) return guard.response
  const { supabase, user } = guard
  // Engelse app: titels en samenvattingen bij het versturen omzetten (zie lib/localizeTitles.ts).
  const locale = localeFromRequest(request)

  const inputs = await fetchProfileInputs(supabase, user.id, { includeHidden: true })

  const emptyResponse = { focused: [], balanced: [], explore: [] }
  if (inputs.favorites.length === 0 && inputs.ratings.length === 0) {
    return NextResponse.json(emptyResponse)
  }

  // Het voorvoegsel maakt eerder bewaarde resultaten (zonder binnenkort-titels) ongeldig.
  // De methode zit in de handtekening: wisselen van berekening maakt opgeslagen lijsten vanzelf ongeldig.
  const hiddenKeys = (inputs.hidden ?? []).map((h) => `${h.media_type}-${h.tmdb_id}`).sort()
  // ?boeken=1: de Boekenclub-skin staat aan op dit apparaat; boekverfilmingen krijgen extra punten. Een eigen handtekening,
  // zodat wisselen van skin een nieuwe berekening geeft in plaats van de bewaarde lijst van de andere skin.
  const bookBonus = request.nextUrl.searchParams.get('boeken') === '1'
  const profileSignature =
    `u20|${MATCH_PERCENT_METHOD}|` + buildProfileSignature(inputs) + '|hid:' + hiddenKeys.join(',') + (bookBonus ? '|boek' : '')

  const { data: cachedResult } = await supabase
    .from('recommendations_cache')
    .select('signature, focused, balanced, explore, fetched_at')
    .eq('user_id', user.id)
    .single()

  // ?vers=1 (de knop Vernieuwen): de opgeslagen lijst overslaan, ook als hij nog geldig is.
  const wantsFresh = request.nextUrl.searchParams.get('vers') === '1'
  if (!wantsFresh && cachedResult && cachedResult.signature === profileSignature) {
    const ageHours = (Date.now() - new Date(cachedResult.fetched_at).getTime()) / (1000 * 60 * 60)
    if (ageHours < RECOMMENDATIONS_RESULT_CACHE_MAX_AGE_HOURS) {
      return NextResponse.json(
        await localizeModes(
          supabase,
          { focused: cachedResult.focused, balanced: cachedResult.balanced, explore: cachedResult.explore } as Record<
            RecommendationMode,
            RecommendationItem[]
          >,
          locale
        )
      )
    }
  }

  const computeStartedAt = Date.now()
  const userSourceIds = new Set(inputs.streamingServices.map((s) => SOURCE_IDS[s]).filter(Boolean))

  // Verlopen kijkinformatie, "lijkt hierop"-lijsten, rolverdelingen en details gebruiken we zoals ze zijn, in plaats van de
  // gebruiker te laten wachten tot ze live bij TMDB zijn opgehaald; dat gebeurt na het antwoord (zie refreshAfterResponse).
  // Wat er niet verandert: wat nog helemaal ontbreekt, wordt meteen opgehaald. Gemeten: het live verversen kostte 2 tot 6,5
  // seconden (13 okt 2026), en een golf verlopen "lijkt hierop"-lijsten liet de berekening vastlopen (15 okt 2026).
  const stale = new StaleCacheRefresher()
  const refreshAfterResponse = () => {
    console.log('Voor jou berekend', { seconden: Math.round((Date.now() - computeStartedAt) / 100) / 10, verlopen: stale.counts })
    if (stale.size === 0) return
    // Het opgeslagen resultaat van nu blijft zoals het is; een volgende berekening (van wie dan ook, de cache is gedeeld)
    // heeft weer verse gegevens.
    after(async () => {
      const startedAt = Date.now()
      try {
        const ververst = await stale.refresh(supabase)
        console.log('Verlopen gegevens op de achtergrond ververst', { ververst, seconden: Math.round((Date.now() - startedAt) / 100) / 10 })
      } catch (err) {
        console.error('Verlopen gegevens verversen op de achtergrond mislukt:', err)
      }
    })
  }

  // Films en series die binnenkort uitkomen en bij dit tabblad passen (zie lib/upcomingTitles.ts). Dit start al zodra de
  // motor de smaak kent (onTasteReady), en loopt dan tegelijk met het lezen van rolverdelingen en kijkinformatie.
  // Gemeten 22 okt 2026: na elkaar kostte Binnenkort ~1,2 s extra wachttijd. upcomingForModes faalt nooit hard.
  const upcomingFilter = {
    excludedGenreIds: inputs.excludedGenreIds,
    seenKeys: new Set(
      [...inputs.favorites, ...inputs.ratings, ...inputs.watchlist, ...(inputs.hidden ?? [])].map((x) => `${x.media_type}-${x.tmdb_id}`)
    ),
  }
  let upcomingPromise: ReturnType<typeof upcomingForModes> | undefined
  const startUpcoming = (t: UpcomingTaste) =>
    (upcomingPromise ??= upcomingForModes(supabase, process.env.TMDB_API_KEY, t, upcomingFilter))

  // Met de diensten van de gebruiker: de motor controleert eerst wat te zien is en kiest daar pas uit.
  // Met een gezamenlijke deadline voor al het live ophalen (zie lib/liveDeadline.ts).
  const taste = await withLiveDeadline(computeStartedAt + LIVE_DEADLINE_MS, () =>
    computeTasteProfile(supabase, inputs, {
      availableOnSourceIds: userSourceIds,
      staleRefresher: stale,
      bookBonus,
      onTasteReady: startUpcoming,
    })
  )
  const { sortedByMode } = taste

  // Al gestart via onTasteReady; zo niet (de motor stopte eerder, bijvoorbeeld bij een leeg profiel), dan nu.
  const upcoming = await startUpcoming(taste)

  if (userSourceIds.size === 0) {
    const plain = {
      focused: [...sortedByMode.focused, ...upcoming.focused],
      balanced: [...sortedByMode.balanced, ...upcoming.balanced],
      explore: [...sortedByMode.explore, ...upcoming.explore],
    }
    const plainFixed = {
      focused: await withLatinTitles(plain.focused),
      balanced: await withLatinTitles(plain.balanced),
      explore: await withLatinTitles(plain.explore),
    }
    await cacheRecommendationsResult(supabase, user.id, profileSignature, plainFixed)
    refreshAfterResponse()
    return NextResponse.json(await localizeModes(supabase, plainFixed, locale))
  }

  // Eén candidate kan in meerdere modi voorkomen; beschikbaarheid per streamingdienst
  // hoeft dan ook maar één keer per titel opgehaald te worden, niet drie keer.
  const allCandidateItems = new Map<string, RankedCandidate>()
  for (const mode of MODES) {
    for (const item of sortedByMode[mode]) {
      allCandidateItems.set(`${item.media_type}-${item.id}`, item)
    }
  }

  const watchInfoMap = await resolveWatchInfo(supabase, Array.from(allCandidateItems.values()), userSourceIds, {
    onStale: stale.onWatchProviders,
  })

  const result: Record<RecommendationMode, RecommendationItem[]> = { focused: [], balanced: [], explore: [] }
  for (const mode of MODES) {
    result[mode] = sortedByMode[mode]
      .map((item): RecommendationItem | null => {
        const info = watchInfoMap.get(`${item.media_type}-${item.id}`)
        if (!info) return null
        return { ...item, ...info }
      })
      .filter((m): m is RecommendationItem => m !== null)
    // Titels die nog niet uit zijn hebben nog geen kijkinfo; ze komen er los bij.
    result[mode] = [...result[mode], ...upcoming[mode]]
  }

  // Titels in Koreaans, Japans enzovoort vervangen door de Engelse titel.
  for (const mode of MODES) result[mode] = await withLatinTitles(result[mode])

  await cacheRecommendationsResult(supabase, user.id, profileSignature, result)
  refreshAfterResponse()
  return NextResponse.json(await localizeModes(supabase, result, locale))
}
