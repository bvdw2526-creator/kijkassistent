// "De beste films en series" per streamingdienst, op basis van TMDB-cijfers. Alleen op de server gebruikt
// (app/top-100/...). We maken bewust een eigen lijst: de Top 250 van IMDb mag niet worden overgenomen.

export type TopType = 'movie' | 'tv'

// URL-delen en het bijbehorende type ("films" -> movie).
export const TOP_TYPES: Record<string, { type: TopType; label: string; labelSingular: string }> = {
  films: { type: 'movie', label: 'films', labelSingular: 'film' },
  series: { type: 'tv', label: 'series', labelSingular: 'serie' },
}

// Streamingdiensten waarvoor we een lijst maken: URL-deel, TMDB-aanbieder (zie SOURCE_IDS in
// lib/recommendationEngine.ts) en de naam zoals die in de tekst staat.
export const TOP_SERVICES: Record<string, { providerId: number; label: string }> = {
  netflix: { providerId: 8, label: 'Netflix' },
  videoland: { providerId: 72, label: 'Videoland' },
  'disney-plus': { providerId: 337, label: 'Disney+' },
  'amazon-prime': { providerId: 119, label: 'Amazon Prime Video' },
  'hbo-max': { providerId: 1899, label: 'HBO Max' },
}

export interface TopItem {
  id: number
  media_type: TopType
  title: string
  poster_path: string | null
  year: string
  voteAverage: number
  voteCount: number
}

// Hoeveel titels de lijst maximaal telt.
export const TOP_SIZE = 100
// Een titel telt pas mee met zoveel stemmen; films hebben er veel meer dan series.
const MIN_VOTES: Record<TopType, number> = { movie: 2000, tv: 500 }
// Gewicht van het "gemiddelde" in de weging (zie weightedRating): hoe meer stemmen een titel nodig heeft om zijn eigen
// cijfer te mogen houden. Zonder dit staan net uitgekomen en door fans omhoog gestemde titels bovenaan.
const SHRINK_VOTES: Record<TopType, number> = { movie: 8000, tv: 2500 }
// Het gemiddelde cijfer van alle titels die genoeg stemmen hebben (gemeten op de 500 populairste titels per soort). Een
// titel met weinig stemmen schuift naar dit cijfer toe. Bewust niet het gemiddelde van de kandidaten zelf: die zijn
// gesorteerd op hoog cijfer en liggen dus veel hoger.
const PRIOR_MEAN: Record<TopType, number> = { movie: 7.4, tv: 8.0 }
// Zoveel pagina's (20 per pagina) van TMDB halen we op, gesorteerd op gemiddeld cijfer; de beste titels na weging
// zitten daar vrijwel altijd in.
const PAGES = 12
const CACHE_SECONDS = 60 * 60 * 24
// Genres die we uitsluiten: documentaire, talkshow, nieuws en reality.
const EXCLUDED_GENRES = '99,10767,10763,10764'

interface RawItem {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  release_date?: string
  first_air_date?: string
  vote_average: number
  vote_count: number
}

// IMDb's gewogen cijfer: v / (v + m) * R + m / (v + m) * C, met R het cijfer van de titel, v het aantal stemmen, m
// SHRINK_VOTES en C het gemiddelde cijfer van alle titels (PRIOR_MEAN).
export function weightedRating(voteAverage: number, voteCount: number, mean: number, shrink: number): number {
  return (voteCount / (voteCount + shrink)) * voteAverage + (shrink / (voteCount + shrink)) * mean
}

// providerId null = alle titels, ongeacht de dienst.
export async function getTopList(type: TopType, providerId: number | null): Promise<TopItem[]> {
  const base =
    `https://api.themoviedb.org/3/discover/${type}?language=nl-NL&sort_by=vote_average.desc` +
    `&vote_count.gte=${MIN_VOTES[type]}&without_genres=${EXCLUDED_GENRES}` +
    (providerId ? `&watch_region=NL&with_watch_monetization_types=flatrate&with_watch_providers=${providerId}` : '')

  const pages = await Promise.all(
    Array.from({ length: PAGES }, (_, i) =>
      fetch(`${base}&page=${i + 1}`, {
        headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
        next: { revalidate: CACHE_SECONDS },
      })
        .then((res) => (res.ok ? res.json() : { results: [] }))
        .then((data) => (data.results || []) as RawItem[])
        .catch(() => [] as RawItem[])
    )
  )

  const unique = new Map<number, RawItem>()
  for (const item of pages.flat()) if (item.poster_path && !unique.has(item.id)) unique.set(item.id, item)
  const raw = Array.from(unique.values())
  if (raw.length === 0) return []

  return raw
    .map((i) => ({ i, score: weightedRating(i.vote_average, i.vote_count, PRIOR_MEAN[type], SHRINK_VOTES[type]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_SIZE)
    .map(({ i }) => ({
      id: i.id,
      media_type: type,
      title: i.title || i.name || '',
      poster_path: i.poster_path,
      year: (i.release_date || i.first_air_date || '').slice(0, 4),
      voteAverage: i.vote_average,
      voteCount: i.vote_count,
    }))
}
