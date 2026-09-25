import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import {
  MODES,
  SOURCE_IDS,
  fetchProfileInputs,
  buildProfileSignature,
  computeTasteProfile,
  resolveWatchInfo,
  type RecommendationMode,
  type RankedCandidate,
  type RecommendationItem,
} from '@/lib/recommendationEngine'
import { upcomingForModes } from '@/lib/upcomingTitles'

// Standaard-timeout van Vercel's serverless functions (10s op Hobby) is te kort voor
// deze route bij een koude cache: veel losse TMDB-calls (aanbevelingen/cast/details per
// favoriet/rating) plus embeddings. 60s is het maximum dat zowel op Hobby als Pro werkt.
export const maxDuration = 60

// Hoelang een compleet berekend resultaat (alle 3 modi, inclusief kijkproviders)
// hergebruikt wordt zolang favorieten/ratings/watchlist/streamingdiensten niet zijn
// gewijzigd. Dit is de belangrijkste knop voor "voelt de app-start lokaal aan": een
// cache-hit slaat de hele scoring-pijplijn over en kost maar één Supabase-rondje.
const RECOMMENDATIONS_RESULT_CACHE_MAX_AGE_HOURS = 6

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

  const inputs = await fetchProfileInputs(supabase, user.id)

  const emptyResponse = { focused: [], balanced: [], explore: [] }
  if (inputs.favorites.length === 0 && inputs.ratings.length === 0) {
    return NextResponse.json(emptyResponse)
  }

  // Het voorvoegsel maakt eerder bewaarde resultaten (zonder binnenkort-titels) ongeldig.
  const profileSignature = 'u1|' + buildProfileSignature(inputs)

  const { data: cachedResult } = await supabase
    .from('recommendations_cache')
    .select('signature, focused, balanced, explore, fetched_at')
    .eq('user_id', user.id)
    .single()

  if (cachedResult && cachedResult.signature === profileSignature) {
    const ageHours = (Date.now() - new Date(cachedResult.fetched_at).getTime()) / (1000 * 60 * 60)
    if (ageHours < RECOMMENDATIONS_RESULT_CACHE_MAX_AGE_HOURS) {
      return NextResponse.json({
        focused: cachedResult.focused,
        balanced: cachedResult.balanced,
        explore: cachedResult.explore,
      })
    }
  }

  const taste = await computeTasteProfile(supabase, inputs)
  const { sortedByMode } = taste

  // Films en series die binnenkort uitkomen en bij dit tabblad passen (zie lib/upcomingTitles.ts).
  const upcoming = await upcomingForModes(
    supabase,
    process.env.TMDB_API_KEY,
    taste,
    {
      excludedGenreIds: inputs.excludedGenreIds,
      seenKeys: new Set(
        [...inputs.favorites, ...inputs.ratings, ...inputs.watchlist].map((x) => `${x.media_type}-${x.tmdb_id}`)
      ),
    }
  )

  const userSourceIds = new Set(inputs.streamingServices.map((s) => SOURCE_IDS[s]).filter(Boolean))

  if (userSourceIds.size === 0) {
    const plain = {
      focused: [...sortedByMode.focused, ...upcoming.focused],
      balanced: [...sortedByMode.balanced, ...upcoming.balanced],
      explore: [...sortedByMode.explore, ...upcoming.explore],
    }
    await cacheRecommendationsResult(supabase, user.id, profileSignature, plain)
    return NextResponse.json(plain)
  }

  // Eén candidate kan in meerdere modi voorkomen; beschikbaarheid per streamingdienst
  // hoeft dan ook maar één keer per titel opgehaald te worden, niet drie keer.
  const allCandidateItems = new Map<string, RankedCandidate>()
  for (const mode of MODES) {
    for (const item of sortedByMode[mode]) {
      allCandidateItems.set(`${item.media_type}-${item.id}`, item)
    }
  }

  const watchInfoMap = await resolveWatchInfo(supabase, Array.from(allCandidateItems.values()), userSourceIds)

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

  await cacheRecommendationsResult(supabase, user.id, profileSignature, result)
  return NextResponse.json(result)
}
