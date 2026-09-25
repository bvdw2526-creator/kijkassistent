import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { SOURCE_IDS, monetizationTypesFor, resolveWatchInfo } from '@/lib/recommendationEngine'

export const maxDuration = 60

const PAGES = [1, 2, 3]
const MAX_ITEMS = 12
// Genoeg stemmen om te voorkomen dat er onbekende of rommelige titels tussen komen.
const MIN_VOTES = { movie: 300, tv: 200 } as const

interface TmdbItem {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  genre_ids?: number[]
}

async function seenKeys(
  supabase: unknown,
  userId: string,
  type: 'movie' | 'tv'
): Promise<Set<number>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any
  const ids = new Set<number>()
  for (const table of ['favorite_movies', 'ratings', 'watchlist']) {
    for (let from = 0; ; from += 1000) {
      const { data } = await client
        .from(table)
        .select('tmdb_id')
        .eq('user_id', userId)
        .eq('media_type', type)
        .range(from, from + 999)
      for (const row of (data || []) as { tmdb_id: number }[]) ids.add(row.tmdb_id)
      if (!data || data.length < 1000) break
    }
  }
  return ids
}

// Populaire titels van dit moment op de streamingdiensten van de gebruiker, zonder uitgesloten
// genres en zonder iets wat hij al beoordeeld, als favoriet of op zijn watchlist heeft staan.
// Dit is de bron voor de "tip van de week"; los van de persoonlijke aanbevelingen.
export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'popular-tip', LIMITS.search)
  if (!guard.ok) return guard.response
  const { supabase, user } = guard

  const type = request.nextUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) return NextResponse.json({ items: [] })

  const { data: profile } = await supabase.from('profiles').select('streaming_services, excluded_genres').eq('id', user.id).single()
  const services: string[] = profile?.streaming_services || []
  const excludedGenres: number[] = profile?.excluded_genres || []
  const providerIds = Array.from(new Set(services.map((s) => SOURCE_IDS[s]).filter(Boolean)))

  const query = new URLSearchParams({
    language: 'nl-NL',
    sort_by: 'popularity.desc',
    include_adult: 'false',
    'vote_count.gte': String(MIN_VOTES[type]),
  })
  if (providerIds.length > 0) {
    query.set('watch_region', 'NL')
    query.set('with_watch_providers', providerIds.join('|'))
    query.set('with_watch_monetization_types', monetizationTypesFor(providerIds))
  }
  if (excludedGenres.length > 0) query.set('without_genres', excludedGenres.join(','))

  const pages = await Promise.all(
    PAGES.map(async (page) => {
      try {
        const res = await fetch(`https://api.themoviedb.org/3/discover/${type}?${query}&page=${page}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          // Populariteit verandert langzaam: een paar uur hergebruiken.
          next: { revalidate: 60 * 60 * 6 },
        })
        if (!res.ok) return [] as TmdbItem[]
        const data = await res.json()
        return (data.results || []) as TmdbItem[]
      } catch {
        return [] as TmdbItem[]
      }
    })
  )

  const seen = await seenKeys(supabase, user.id, type)
  const excluded = new Set(excludedGenres)
  const unique = new Map<number, TmdbItem>()
  for (const item of pages.flat()) {
    if (unique.has(item.id) || seen.has(item.id)) continue
    // Nogmaals zelf controleren: TMDB's "zonder genres" is niet altijd streng genoeg.
    if ((item.genre_ids || []).some((g) => excluded.has(g))) continue
    if (!item.poster_path) continue
    unique.set(item.id, item)
  }
  const candidates = Array.from(unique.values()).slice(0, MAX_ITEMS * 2)

  // Waar te kijken (en een dubbele controle dat het echt op jouw diensten staat).
  const watchInfo =
    providerIds.length > 0
      ? await resolveWatchInfo(supabase, candidates.map((c) => ({ media_type: type, id: c.id })), new Set(providerIds))
      : new Map<string, { watchOn: string; watchUrl: string } | null>()

  const items = candidates
    .filter((c) => providerIds.length === 0 || watchInfo.get(`${type}-${c.id}`))
    .slice(0, MAX_ITEMS)
    .map((c) => ({
      id: c.id,
      title: c.title || c.name || '',
      poster_path: c.poster_path,
      media_type: type,
      watchOn: watchInfo.get(`${type}-${c.id}`)?.watchOn ?? null,
      explanation: providerIds.length > 0 ? 'Populair op jouw streamingdiensten.' : 'Populair op dit moment.',
    }))

  return NextResponse.json({ items })
}
