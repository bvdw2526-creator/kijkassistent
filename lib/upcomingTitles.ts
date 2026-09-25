// Films en series die binnenkort uitkomen, gekozen op smaak: ze komen tussen de gewone aanbevelingen,
// met een label "Binnenkort". Alleen op de server gebruikt.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  cosineSimilarity,
  getEmbeddingsForItems,
  type GenreAffinity,
  type MediaType,
  type RecommendationItem,
} from '@/lib/recommendationEngine'

export interface UpcomingCandidate {
  id: number
  media_type: MediaType
  title: string
  poster_path: string
  release_date: string
  overview: string
  genre_ids: number[]
  vote_average: number
  popularity: number
}

// Wat we van iemands smaak nodig hebben (een deel van TasteProfile).
export interface UpcomingTaste {
  userVector: number[]
  movieGenres: GenreAffinity[]
  tvGenres: GenreAffinity[]
}

export interface UpcomingFilter {
  excludedGenreIds: Set<number>
  // Sleutels "movie-123": alles wat al beoordeeld, favoriet of op een watchlist staat.
  seenKeys: Set<string>
}

export type UpcomingItem = RecommendationItem & { upcoming: true; release_date: string }

const MONTHS_AHEAD = 6
const MOVIE_PAGES = [1, 2, 3]
const TV_PAGES = [1, 2]
// Welke titels (op volgorde van pasvorm, per soort) elk tabblad krijgt. De tabbladen delen bewust geen
// titels: Puur mijn smaak de allerbeste, Mijn smaak breder de volgende, Verras me een stapje verder.
const SLICES = {
  focused: { start: 0, count: 2 },
  balanced: { start: 2, count: 3 },
  explore: { start: 5, count: 3 },
  samen: { start: 0, count: 3 },
} as const

function amsterdamDate(offsetMonths = 0): string {
  const d = new Date()
  d.setMonth(d.getMonth() + offsetMonths)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
}

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
  original_language?: string
}

// Talen die je hier vaak tegenkomt. Zonder dit staan er veel titels tussen die alleen in hun eigen
// land uitkomen (bijvoorbeeld Indiase of Chinese bioscoopfilms) en in Nederland niemand kent.
const ALLOWED_LANGUAGES = new Set(['en', 'nl', 'fr', 'de', 'es', 'it', 'da', 'sv', 'no', 'nb', 'ja', 'ko'])

// Gedeeld tussen alle gebruikers en dus een halve dag hergebruikt door Next.
export async function fetchUpcomingCandidates(apiKey: string): Promise<UpcomingCandidate[]> {
  const from = amsterdamDate()
  const until = amsterdamDate(MONTHS_AHEAD)
  const get = async (url: string): Promise<RawItem[]> => {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, next: { revalidate: 60 * 60 * 12 } })
      if (!res.ok) return []
      return ((await res.json()).results || []) as RawItem[]
    } catch {
      return []
    }
  }
  // primary_release_date / first_air_date: alleen de echte datum van de titel zelf (geen heruitgaven).
  const [movies, shows] = await Promise.all([
    Promise.all(
      MOVIE_PAGES.map((page) =>
        get(
          `https://api.themoviedb.org/3/discover/movie?language=nl-NL&region=NL&sort_by=popularity.desc&with_release_type=2|3` +
            `&primary_release_date.gte=${from}&primary_release_date.lte=${until}&page=${page}`
        )
      )
    ),
    Promise.all(
      TV_PAGES.map((page) =>
        get(
          `https://api.themoviedb.org/3/discover/tv?language=nl-NL&sort_by=popularity.desc` +
            `&first_air_date.gte=${from}&first_air_date.lte=${until}&page=${page}`
        )
      )
    ),
  ])

  const out = new Map<string, UpcomingCandidate>()
  const add = (items: RawItem[], media_type: MediaType) => {
    for (const item of items) {
      const release = media_type === 'movie' ? item.release_date : item.first_air_date
      // Nogmaals op de eigen datum controleren (zie primary_release_date hierboven) en een poster eisen.
      if (!release || release < from || !item.poster_path) continue
      if (item.original_language && !ALLOWED_LANGUAGES.has(item.original_language)) continue
      out.set(`${media_type}-${item.id}`, {
        id: item.id,
        media_type,
        title: item.title || item.name || '',
        poster_path: item.poster_path,
        release_date: release,
        overview: item.overview || '',
        genre_ids: item.genre_ids || [],
        vote_average: item.vote_average ?? 0,
        popularity: item.popularity ?? 0,
      })
    }
  }
  add(movies.flat(), 'movie')
  add(shows.flat(), 'tv')
  return Array.from(out.values())
}

function percentiles(values: (number | null)[]): number[] {
  const known = values.filter((v): v is number => v !== null).sort((a, b) => a - b)
  return values.map((v) => {
    if (v === null || known.length < 2) return 0.5
    // Aandeel titels dat lager scoort: 0 (laagste) tot 1 (hoogste); gelijke waarden krijgen dezelfde score.
    return known.filter((k) => k < v).length / (known.length - 1)
  })
}

// Geeft per titel een score van 0 tot 1 voor hoe goed hij bij iemands smaak past: de helft genres
// (overlap met de favoriete genres) en de helft verhaal (lijkt de samenvatting op wat je leuk vindt).
// Relatief binnen de kandidaten, want een absolute drempel zegt bij zulke cijfers weinig.
export async function scoreUpcoming(
  supabase: SupabaseClient,
  candidates: UpcomingCandidate[],
  taste: UpcomingTaste,
  filter: UpcomingFilter
): Promise<Map<string, number>> {
  const usable = candidates.filter(
    (c) => !filter.seenKeys.has(`${c.media_type}-${c.id}`) && !c.genre_ids.some((g) => filter.excludedGenreIds.has(g))
  )
  const fits = new Map<string, number>()
  if (usable.length === 0) return fits

  const embeddings = taste.userVector.length
    ? await getEmbeddingsForItems(
        supabase,
        usable.filter((c) => c.overview).map((c) => ({ media_type: c.media_type, tmdb_id: c.id, text: `${c.title}. ${c.overview}` }))
      )
    : new Map<string, number[]>()

  for (const type of ['movie', 'tv'] as const) {
    const ofType = usable.filter((c) => c.media_type === type)
    if (ofType.length === 0) continue
    const affinities = type === 'movie' ? taste.movieGenres : taste.tvGenres
    const max = Math.max(1, ...affinities.map((g) => g.count))
    const byGenre = new Map(affinities.map((g) => [g.id, g.count / max]))

    const genreFit = ofType.map((c) =>
      c.genre_ids.length ? c.genre_ids.reduce((sum, g) => sum + (byGenre.get(g) ?? 0), 0) / c.genre_ids.length : 0
    )
    const storyFit = ofType.map((c) => {
      const vec = embeddings.get(`${c.media_type}-${c.id}`)
      return vec && vec.length ? cosineSimilarity(taste.userVector, vec) : null
    })
    const genrePct = percentiles(genreFit)
    const storyPct = percentiles(storyFit)
    ofType.forEach((c, i) => fits.set(`${c.media_type}-${c.id}`, 0.5 * genrePct[i] + 0.5 * storyPct[i]))
  }
  return fits
}

function toItem(c: UpcomingCandidate, fit: number): UpcomingItem {
  return {
    id: c.id,
    title: c.title,
    poster_path: c.poster_path,
    vote_average: c.vote_average,
    overview: c.overview,
    media_type: c.media_type,
    genre_ids: c.genre_ids,
    score: fit,
    // Bewust geen echt matchpercentage: de kaart toont "Binnenkort" in plaats daarvan.
    matchPercent: Math.round(fit * 100),
    basedOn: [],
    coreScore: 0,
    okScore: 0,
    discoverScore: 0,
    collectionScore: 0,
    embeddingBonus: 0,
    actorScore: 0,
    directorScore: 0,
    upcoming: true,
    release_date: c.release_date,
  }
}

// Kiest per soort de titels voor één tabblad uit de gescoorde kandidaten.
export function pickForMode(
  candidates: UpcomingCandidate[],
  fits: Map<string, number>,
  mode: keyof typeof SLICES
): UpcomingItem[] {
  const out: UpcomingItem[] = []
  for (const type of ['movie', 'tv'] as const) {
    const ranked = candidates
      .filter((c) => c.media_type === type && fits.has(`${c.media_type}-${c.id}`))
      .sort((a, b) => fits.get(`${b.media_type}-${b.id}`)! - fits.get(`${a.media_type}-${a.id}`)!)
    const { start, count } = SLICES[mode]
    let chosen = ranked.slice(start, start + count)
    // Verras me: uit een bredere groep die verder van je gewone smaak ligt, de bekendste eerst.
    if (mode === 'explore') {
      chosen = ranked
        .slice(start, start + 9)
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, count)
    }
    // Weinig kandidaten (bijvoorbeeld een kleine smaak): liever dezelfde als niets tonen.
    if (chosen.length === 0) chosen = ranked.slice(0, count)
    for (const c of chosen) out.push(toItem(c, fits.get(`${c.media_type}-${c.id}`)!))
  }
  return out
}

// Voor de persoonlijke tabbladen. Faalt nooit hard: zonder binnenkort-titels blijft alles gewoon werken.
export async function upcomingForModes(
  supabase: SupabaseClient,
  apiKey: string | undefined,
  taste: UpcomingTaste,
  filter: UpcomingFilter
): Promise<Record<'focused' | 'balanced' | 'explore', UpcomingItem[]>> {
  const empty = { focused: [], balanced: [], explore: [] }
  if (!apiKey) return empty
  try {
    const candidates = await fetchUpcomingCandidates(apiKey)
    const fits = await scoreUpcoming(supabase, candidates, taste, filter)
    return {
      focused: pickForMode(candidates, fits, 'focused'),
      balanced: pickForMode(candidates, fits, 'balanced'),
      explore: pickForMode(candidates, fits, 'explore'),
    }
  } catch (err) {
    console.error('Binnenkort-titels ophalen mislukt:', err)
    return empty
  }
}

// Voor Samen: de zwakste van de twee scores telt, zodat het bij jullie allebei past.
export async function upcomingForCouple(
  supabase: SupabaseClient,
  apiKey: string | undefined,
  tasteA: UpcomingTaste,
  tasteB: UpcomingTaste,
  filter: UpcomingFilter
): Promise<UpcomingItem[]> {
  if (!apiKey) return []
  try {
    const candidates = await fetchUpcomingCandidates(apiKey)
    const [fitsA, fitsB] = await Promise.all([
      scoreUpcoming(supabase, candidates, tasteA, filter),
      scoreUpcoming(supabase, candidates, tasteB, filter),
    ])
    const joint = new Map<string, number>()
    for (const [key, a] of fitsA) {
      const b = fitsB.get(key)
      if (b !== undefined) joint.set(key, Math.min(a, b))
    }
    return pickForMode(candidates, joint, 'samen')
  } catch (err) {
    console.error('Binnenkort-titels voor Samen ophalen mislukt:', err)
    return []
  }
}
