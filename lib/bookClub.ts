// Boekverfilmingen voor wie de Boekenclub-skin aan heeft: een eigen rij op Voor jou, los van de gewone aanbevelingen
// (die krijgen met dezelfde skin een bonus voor boekverfilmingen, zie BOOK_ADAPTATION_BONUS in lib/recommendationEngine.ts).
// Zelfde opzet als de Halloween-rij (lib/halloween.ts): titels op je eigen diensten uit TMDB, gesorteerd op je smaak.
// Alleen op de server gebruikt.
import { BOOK_KEYWORD_ID, monetizationTypesFor, type MediaType } from '@/lib/recommendationEngine'
import type { UpcomingCandidate } from '@/lib/upcomingTitles'

// Per soort: wat we TMDB vragen, de bekendste titels eerst. De ondergrens aan stemmen houdt onbekende en rommelige titels
// weg; het gaat om verfilmingen die mensen herkennen.
const QUERIES: { mediaType: MediaType; pages: number[]; params: Record<string, string> }[] = [
  { mediaType: 'movie', pages: [1, 2, 3, 4], params: { 'vote_count.gte': '300', 'vote_average.gte': '6' } },
  // Series: zonder kinderseries, en de stemmen liggen bij series lager.
  { mediaType: 'tv', pages: [1, 2], params: { without_genres: '10762', 'vote_count.gte': '100', 'vote_average.gte': '6.5' } },
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

// De boekverfilmingen op de gegeven diensten (zonder diensten: overal). Gedeeld tussen alle gebruikers met dezelfde
// diensten en een halve dag hergebruikt door Next.
export async function fetchBookCandidates(apiKey: string, providerIds: number[]): Promise<UpcomingCandidate[]> {
  const sortedProviders = [...providerIds].sort((a, b) => a - b)
  const out = new Map<string, UpcomingCandidate>()
  const perQuery = await Promise.all(
    QUERIES.map(async (query) => {
      const params = new URLSearchParams({
        language: 'nl-NL',
        include_adult: 'false',
        sort_by: 'vote_count.desc',
        with_keywords: String(BOOK_KEYWORD_ID),
        ...query.params,
      })
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
      })
    }
  }
  return Array.from(out.values())
}
