// Halloween-titels voor wie de Halloween-skin aan heeft (zie isHalloweenSeason in lib/skins.ts): een eigen rij op Voor
// jou, los van de gewone aanbevelingen. Die blijven dus precies zoals ze waren, en de rij telt niet mee in de meting van
// hoe raak de aanbevelingen zijn. Twee smaken: "griezelig" (horror) en "gezellig eng" (Halloween voor het hele gezin).
// Alleen op de server gebruikt.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  FAVORITE_SOURCE_WEIGHT,
  LOVE_SOURCE_WEIGHT,
  MAX_DISLIKE_SOURCES,
  MAX_FAVORITE_SOURCES,
  MAX_LOVE_SOURCES,
  STORY_DISLIKE_MIN,
  getCachedDetailsBulk,
  getEmbeddingsForItems,
  monetizationTypesFor,
  type GenreAffinity,
  type MediaType,
  type ProfileInputs,
} from '@/lib/recommendationEngine'
import type { UpcomingCandidate, UpcomingTaste } from '@/lib/upcomingTitles'

export type HalloweenFlavour = 'scary' | 'cozy'
export type HalloweenCandidate = UpcomingCandidate & { flavour: HalloweenFlavour }

// TMDB-genre Horror. Bestaat alleen bij films; griezelige series vinden we via trefwoorden.
export const HORROR_GENRE = 27

// TMDB-trefwoorden (op te zoeken via /3/search/keyword).
const KW = {
  halloween: 3335,
  halloweenParty: 9694,
  trickOrTreating: 180193,
  witch: 616,
  ghost: 162846,
  vampire: 3133,
  hauntedHouse: 3358,
  werewolf: 12564,
  zombie: 12377,
  dayOfTheDead: 209789,
  horror: 315058,
  slasher: 12339,
  christmas: 207317,
}

// Per smaak en soort: wat we TMDB vragen, de bekendste titels eerst. De ondergrens aan stemmen houdt onbekende en
// rommelige titels weg. Uitgeprobeerd op 12 okt 2026; "gezellig eng" geeft dan onder meer Coco, Hocus Pocus, Beetlejuice
// en The Addams Family, "griezelig" onder meer The Conjuring, Get Out en Scream.
const QUERIES: { flavour: HalloweenFlavour; mediaType: MediaType; pages: number[]; params: Record<string, string> }[] = [
  {
    flavour: 'scary',
    mediaType: 'movie',
    pages: [1, 2, 3],
    params: { with_genres: String(HORROR_GENRE), 'vote_count.gte': '500', 'vote_average.gte': '6' },
  },
  {
    flavour: 'scary',
    mediaType: 'tv',
    pages: [1, 2],
    params: {
      with_keywords: [KW.horror, KW.halloween, KW.hauntedHouse, KW.zombie, KW.vampire, KW.ghost, KW.slasher].join('|'),
      // Zonder komedie, familie, animatie en kinderseries: die horen bij "gezellig eng".
      without_genres: '35,10751,16,10762',
      'vote_count.gte': '150',
    },
  },
  {
    flavour: 'cozy',
    mediaType: 'movie',
    pages: [1, 2],
    params: {
      with_keywords: [KW.halloween, KW.halloweenParty, KW.trickOrTreating, KW.ghost, KW.vampire, KW.hauntedHouse, KW.werewolf, KW.dayOfTheDead].join('|'),
      // Familie, komedie of animatie, en geen horror. "Kerst" eruit: spoken brengen anders elke Christmas Carol mee.
      with_genres: '10751|35|16',
      without_genres: String(HORROR_GENRE),
      without_keywords: [KW.christmas, KW.horror, KW.slasher].join(','),
      'vote_count.gte': '300',
      'vote_average.gte': '5.5',
    },
  },
  {
    flavour: 'cozy',
    mediaType: 'tv',
    pages: [1],
    params: {
      with_keywords: [KW.halloween, KW.witch, KW.ghost, KW.vampire, KW.hauntedHouse, KW.werewolf, KW.zombie].join('|'),
      with_genres: '35|10751|10762',
      without_keywords: [KW.horror, KW.slasher].join(','),
      // Zonder dit bestaat de lijst vooral uit anime met geesten en demonen.
      with_original_language: 'en|nl',
      'vote_count.gte': '100',
    },
  },
]

interface RawItem {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  overview?: string
  genre_ids?: number[]
  release_date?: string
  first_air_date?: string
  vote_average?: number
  popularity?: number
}

// De Halloween-titels op de gegeven diensten (zonder diensten: overal). Gedeeld tussen alle gebruikers met dezelfde
// diensten en een halve dag hergebruikt door Next.
export async function fetchHalloweenCandidates(apiKey: string, providerIds: number[]): Promise<HalloweenCandidate[]> {
  const sortedProviders = [...providerIds].sort((a, b) => a - b)
  const out = new Map<string, HalloweenCandidate>()
  const perQuery = await Promise.all(
    QUERIES.map(async (query) => {
      const params = new URLSearchParams({ language: 'nl-NL', include_adult: 'false', sort_by: 'vote_count.desc', ...query.params })
      if (sortedProviders.length > 0) {
        params.set('watch_region', 'NL')
        params.set('with_watch_providers', sortedProviders.join('|'))
        params.set('with_watch_monetization_types', monetizationTypesFor(sortedProviders))
      }
      const pages = await Promise.all(
        query.pages.map(async (page) => {
          try {
            const res = await fetch(`https://api.themoviedb.org/3/discover/${query.mediaType}?${params}&page=${page}`, {
              headers: { Authorization: `Bearer ${apiKey}` },
              next: { revalidate: 60 * 60 * 12 },
            })
            if (!res.ok) return [] as RawItem[]
            return ((await res.json()).results || []) as RawItem[]
          } catch {
            return [] as RawItem[]
          }
        })
      )
      return { query, items: pages.flat() }
    })
  )
  // De volgorde van QUERIES bepaalt wie wint als een titel in beide smaken voorkomt: griezelig gaat voor.
  for (const { query, items } of perQuery) {
    for (const item of items) {
      const key = `${query.mediaType}-${item.id}`
      if (out.has(key) || !item.poster_path) continue
      out.set(key, {
        id: item.id,
        media_type: query.mediaType,
        title: item.title || item.name || '',
        poster_path: item.poster_path,
        release_date: (query.mediaType === 'movie' ? item.release_date : item.first_air_date) || '',
        overview: item.overview || '',
        genre_ids: item.genre_ids || [],
        vote_average: item.vote_average ?? 0,
        popularity: item.popularity ?? 0,
        flavour: query.flavour,
      })
    }
  }
  return Array.from(out.values())
}

// Iemands smaak in het klein: de genres en de gemiddelde verhaal-vingerafdruk van wat diegene leuk vond, en van wat
// diegene afkeurde. Zelfde bronnen en gewichten als de motor (favoriet zwaarder dan "zeker leuk", de recentste eerst),
// maar zonder de rest van de berekening: voor het sorteren van een paar honderd Halloween-titels is dit genoeg, en het
// leest vrijwel alles uit de caches die de gewone aanbevelingen al vulden.
export async function halloweenTaste(supabase: SupabaseClient, inputs: ProfileInputs): Promise<UpcomingTaste> {
  const newestFirst = (a: { added_at?: string; rated_at?: string }, b: { added_at?: string; rated_at?: string }) =>
    (b.rated_at ?? b.added_at ?? '').localeCompare(a.rated_at ?? a.added_at ?? '')
  const favoriteKeys = new Set(inputs.favorites.map((f) => `${f.media_type}-${f.tmdb_id}`))
  const liked = [
    ...[...inputs.favorites].sort(newestFirst).slice(0, MAX_FAVORITE_SOURCES).map((f) => ({ ...f, weight: FAVORITE_SOURCE_WEIGHT })),
    ...inputs.ratings
      .filter((r) => r.rating === 'love' && !favoriteKeys.has(`${r.media_type}-${r.tmdb_id}`))
      .sort(newestFirst)
      .slice(0, MAX_LOVE_SOURCES)
      .map((r) => ({ ...r, weight: LOVE_SOURCE_WEIGHT })),
  ]
  const disliked = inputs.ratings.filter((r) => r.rating === 'dislike').sort(newestFirst).slice(0, MAX_DISLIKE_SOURCES)
  const empty: UpcomingTaste = { userVector: [], dislikeVector: [], movieGenres: [], tvGenres: [] }
  if (liked.length === 0) return empty

  const details = await getCachedDetailsBulk(
    supabase,
    [...liked, ...disliked].map((s) => ({ mediaType: s.media_type, tmdbId: s.tmdb_id }))
  )
  const keyOf = (s: { media_type: MediaType; tmdb_id: number }) => `${s.media_type}-${s.tmdb_id}`

  const genreCounts: Record<MediaType, Map<number, GenreAffinity>> = { movie: new Map(), tv: new Map() }
  for (const source of liked) {
    for (const genre of details.get(keyOf(source))?.genres ?? []) {
      if (inputs.excludedGenreIds.has(genre.id)) continue
      const existing = genreCounts[source.media_type].get(genre.id)
      if (existing) existing.count += source.weight
      else genreCounts[source.media_type].set(genre.id, { id: genre.id, name: genre.name, count: source.weight })
    }
  }
  const genresOf = (mediaType: MediaType) => Array.from(genreCounts[mediaType].values()).sort((a, b) => b.count - a.count)

  const withText = (sources: { media_type: MediaType; tmdb_id: number; title: string }[]) =>
    sources.flatMap((s) => {
      const overview = details.get(keyOf(s))?.overview
      return overview ? [{ media_type: s.media_type, tmdb_id: s.tmdb_id, text: `${s.title}. ${overview}` }] : []
    })
  const embeddings = await getEmbeddingsForItems(supabase, [...withText(liked), ...withText(disliked)])
  const average = (sources: { media_type: MediaType; tmdb_id: number; weight: number }[]) => {
    let sum: number[] = []
    let total = 0
    let count = 0
    for (const source of sources) {
      const vec = embeddings.get(keyOf(source))
      if (!vec || vec.length === 0) continue
      sum = sum.length === 0 ? vec.map((v) => v * source.weight) : sum.map((v, i) => v + vec[i] * source.weight)
      total += source.weight
      count++
    }
    return { vector: total > 0 ? sum.map((v) => v / total) : [], count }
  }
  const dislikedAverage = average(disliked.map((d) => ({ ...d, weight: 1 })))

  return {
    userVector: average(liked).vector,
    dislikeVector: dislikedAverage.count >= STORY_DISLIKE_MIN ? dislikedAverage.vector : [],
    movieGenres: genresOf('movie'),
    tvGenres: genresOf('tv'),
  }
}
