import { NextRequest, NextResponse, after } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import {
  fetchProfileInputs,
  getRecommendationPagesBulk,
  getCachedDetailsBulk,
  getEmbeddingsForItems,
  computeEmbeddingSimilarities,
  resolveWatchInfo,
  isOlderThan,
  RECOMMENDATION_PAGES,
  SOURCE_IDS,
  StaleCacheRefresher,
  type MediaType,
} from '@/lib/recommendationEngine'
import { findDislikedGenres } from '@/lib/dislikedGenres'

export const maxDuration = 30

// "Meer zoals deze": titels die sterk lijken op één titel, alleen op je eigen diensten en nog niet door jou gezien.
// Kandidaten komen uit TMDB's "lijkt hierop"-lijst; daarvan blijft alleen over wat ook qua verhaal echt lijkt (de
// Engelse verhaal-vingerafdruk). Alleen op verhaal zoeken bleek in de proef van 16 okt 2026 te grof (Ted -> kinderfilms,
// Predestination zonder tijdreizen); alleen de TMDB-lijst haalt er losse uitschieters in.
const MIN_STORY_SIMILARITY = 0.45
// Weegt mee hoe hoog TMDB een titel in de lijst zet, bovenop de verhaal-overeenkomst.
const LIST_POSITION_WEIGHT = 0.1
const MAX_ITEMS = 10
// Minder sterke tips dan dit: dan liever eerlijk melden dat je de beste al gezien hebt dan een matig lijstje.
const MIN_ITEMS = 4

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'more-like-this', LIMITS.moreLikeThis)
  if (!guard.ok) return guard.response
  const { supabase, user } = guard

  const mediaType: MediaType = request.nextUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10)
  if (!id) return NextResponse.json({ error: 'Ongeldig id' }, { status: 400 })
  const seedKey = `${mediaType}-${id}`

  try {
    const stale = new StaleCacheRefresher()
    const [inputs, pages, seedVectors] = await Promise.all([
      fetchProfileInputs(supabase, user.id, { includeHidden: true }),
      getRecommendationPagesBulk(
        supabase,
        RECOMMENDATION_PAGES.map((page) => ({ mediaType, tmdbId: id, page })),
        { onStale: stale.onRecommendationPages }
      ),
      // De tekst is alleen een teken dat er iets te vergelijken is; de Engelse vingerafdruk wordt zo nodig uit TMDB gemaakt.
      getEmbeddingsForItems(supabase, [{ media_type: mediaType, tmdb_id: id, text: '-' }]),
    ])
    const seedVector = seedVectors.get(seedKey)

    // Alles wat je al kent of niet wilt zien valt af: gezien (favoriet of beoordeeld), op je kijklijst of verborgen.
    const known = new Set<string>([seedKey])
    for (const t of [...inputs.favorites, ...inputs.ratings, ...inputs.watchlist, ...(inputs.hidden ?? [])]) {
      known.add(`${t.media_type}-${t.tmdb_id}`)
    }
    const dislikedKeys = new Set(inputs.ratings.filter((r) => r.rating === 'dislike').map((r) => `${r.media_type}-${r.tmdb_id}`))
    const watchedKeys = Array.from(
      new Set([...inputs.favorites, ...inputs.ratings].map((t) => `${t.media_type}-${t.tmdb_id}`))
    )

    const candidates = new Map<string, { item: NonNullable<ReturnType<typeof pages.get>>[number]; position: number }>()
    RECOMMENDATION_PAGES.forEach((page, pageIndex) => {
      ;(pages.get(`${seedKey}-${page}`) || []).forEach((item, i) => {
        const key = `${item.media_type}-${item.id}`
        if (!candidates.has(key)) candidates.set(key, { item, position: pageIndex * 20 + i })
      })
    })

    const filtered = Array.from(candidates.entries()).filter(([key, { item }]) =>
      !known.has(key) &&
      !item.genre_ids.some((g) => inputs.excludedGenreIds.has(g)) &&
      !isOlderThan(item.release_date, inputs.minYear)
    )

    // De drie opzoekingen hangen niet van elkaar af, dus tegelijk; "niet jouw ding" filtert pas daarna.
    const userSourceIds = new Set(inputs.streamingServices.map((s) => SOURCE_IDS[s]).filter((s): s is number => !!s))
    const [detailsByKey, watchInfo, similarities] = await Promise.all([
      // Genres van de titel zelf en van alles wat je zag: voor "niet jouw ding" (zie lib/dislikedGenres.ts).
      getCachedDetailsBulk(
        supabase,
        [{ mediaType, tmdbId: id }, ...watchedKeys.map((key) => {
          const [mt, tmdbId] = key.split('-')
          return { mediaType: mt as MediaType, tmdbId: Number(tmdbId) }
        })],
        { onStale: stale.onDetails }
      ),
      resolveWatchInfo(supabase, filtered.map(([, { item }]) => item), userSourceIds, { onStale: stale.onWatchProviders }),
      seedVector
        ? computeEmbeddingSimilarities(
            supabase,
            [seedVector],
            filtered
              .filter(([, { item }]) => item.overview)
              .map(([, { item }]) => ({ media_type: item.media_type, tmdb_id: item.id, text: `${item.title}. ${item.overview}` }))
          )
        : Promise.resolve(new Map<string, number[]>()),
    ])

    const seedGenreIds = new Set((detailsByKey.get(seedKey)?.genres ?? []).map((g) => g.id))
    // Een genre dat je vaak afkeurt telt niet als de titel zelf dat genre heeft: wie "meer zoals" een komedie vraagt,
    // wil komedies.
    const notYourThing = new Set(
      findDislikedGenres(watchedKeys, dislikedKeys, detailsByKey).map((g) => g.id).filter((g) => !seedGenreIds.has(g))
    )

    const total = Math.max(1, candidates.size)
    const items = filtered
      .filter(([, { item }]) => !item.genre_ids.some((g) => notYourThing.has(g)))
      .flatMap(([key, { item, position }]) => {
        const watch = watchInfo.get(key)
        const similarity = similarities.get(key)?.[0]
        if (!watch || similarity === undefined || similarity < MIN_STORY_SIMILARITY) return []
        return [{
          id: item.id,
          media_type: item.media_type,
          title: item.title,
          poster_path: item.poster_path,
          year: (item.release_date || '').slice(0, 4),
          watchOn: watch.watchOn,
          watchUrl: watch.watchUrl,
          similarity: Math.round(similarity * 100) / 100,
          score: similarity + LIST_POSITION_WEIGHT * (1 - position / total),
        }]
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_ITEMS)

    if (stale.size > 0) {
      after(async () => {
        try {
          console.log('Meer zoals deze: verlopen gegevens ververst', await stale.refresh(supabase))
        } catch (err) {
          console.error('Meer zoals deze: verlopen gegevens verversen mislukt:', err)
        }
      })
    }

    return NextResponse.json({ items: items.length >= MIN_ITEMS ? items : [], found: items.length })
  } catch (err) {
    console.error('Meer zoals deze mislukt:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Onbekende fout bij het zoeken naar vergelijkbare titels' },
      { status: 500 }
    )
  }
}
