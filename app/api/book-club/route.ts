import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { SOURCE_IDS, fetchProfileInputs, isOlderThan, resolveWatchInfo, type RecommendationItem } from '@/lib/recommendationEngine'
import { halloweenTaste } from '@/lib/halloween'
import { scoreUpcoming, type UpcomingCandidate } from '@/lib/upcomingTitles'
import { fetchBookCandidates } from '@/lib/bookClub'
import { withLatinTitles } from '@/lib/titleFallback'
import { localeFromRequest } from '@/lib/serverI18n'
import { localizeTitles } from '@/lib/localizeTitles'

// Bij een koude cache: vingerafdrukken maken voor boekverfilmingen die nog nergens zijn aanbevolen.
export const maxDuration = 60

// Zoveel titels in de rij, waarvan hooguit zoveel series.
const MAX_ITEMS = 15
const MAX_SERIES = 5
// Van zoveel best passende titels controleren we nog eens of ze echt op de diensten staan.
const AVAILABILITY_POOL = 40
const AVAILABILITY_LIVE_LIMIT = 40

// Titel uit de Boekenclub-rij: geen gewone aanbeveling, dus de app toont geen percentage en telt hem apart in de meting.
type BookClubItem = RecommendationItem & { bookClub: true }

function toItem(c: UpcomingCandidate, fit: number): BookClubItem {
  return {
    id: c.id,
    title: c.title,
    poster_path: c.poster_path,
    vote_average: c.vote_average,
    overview: c.overview,
    media_type: c.media_type,
    genre_ids: c.genre_ids,
    release_date: c.release_date,
    score: fit,
    matchPercent: Math.round(fit * 100),
    basedOn: [],
    coreScore: 0,
    okScore: 0,
    discoverScore: 0,
    collectionScore: 0,
    embeddingBonus: 0,
    actorScore: 0,
    directorScore: 0,
    bookClub: true,
  }
}

// De Boekenclub-rij (alleen met de Boekenclub-skin aan, zie lib/bookClub.ts): boekverfilmingen op je eigen diensten, de
// best passende eerst, zonder wat je al kent, zonder uitgesloten genres en niet ouder dan je eigen grens.
export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'book-club', LIMITS.bookClub)
  if (!guard.ok) return guard.response
  const { supabase, user } = guard
  const locale = localeFromRequest(request)
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) return NextResponse.json({ items: [] })

  try {
    const inputs = await fetchProfileInputs(supabase, user.id, { includeHidden: true })
    const seenKeys = new Set(
      [...inputs.favorites, ...inputs.ratings, ...inputs.watchlist, ...(inputs.hidden ?? [])].map((x) => `${x.media_type}-${x.tmdb_id}`)
    )
    const providerIds = Array.from(new Set(inputs.streamingServices.map((s) => SOURCE_IDS[s]).filter(Boolean)))
    const candidates = (await fetchBookCandidates(apiKey, providerIds)).filter((c) => !isOlderThan(c.release_date, inputs.minYear))

    const taste = await halloweenTaste(supabase, inputs)
    const fits = await scoreUpcoming(supabase, candidates, taste, { excludedGenreIds: inputs.excludedGenreIds, seenKeys })
    const fitOf = (c: UpcomingCandidate) => fits.get(`${c.media_type}-${c.id}`)
    const pool = candidates
      .filter((c) => fitOf(c) !== undefined)
      .sort((a, b) => fitOf(b)! - fitOf(a)!)
      .slice(0, AVAILABILITY_POOL)

    const sourceIds = new Set(providerIds)
    const watchInfo = sourceIds.size > 0 ? await resolveWatchInfo(supabase, pool, sourceIds, { maxLive: AVAILABILITY_LIVE_LIMIT }) : null

    const items: BookClubItem[] = []
    let series = 0
    for (const c of pool) {
      if (items.length >= MAX_ITEMS) break
      const info = watchInfo?.get(`${c.media_type}-${c.id}`)
      if (watchInfo && !info) continue
      if (c.media_type === 'tv' && series >= MAX_SERIES) continue
      if (c.media_type === 'tv') series++
      items.push({ ...toItem(c, fitOf(c)!), ...(info ?? {}) })
    }

    return NextResponse.json({ items: await localizeTitles(supabase, await withLatinTitles(items), locale) })
  } catch (err) {
    console.error('Boekverfilmingen ophalen mislukt:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout bij het ophalen van boekverfilmingen' }, { status: 500 })
  }
}
