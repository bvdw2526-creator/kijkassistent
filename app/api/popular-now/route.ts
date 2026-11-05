import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { localeFromRequest, tmdbLanguage } from '@/lib/serverI18n'
import { SOURCE_IDS, RENT_ONLY_SOURCE_IDS, resolveWatchInfo } from '@/lib/recommendationEngine'

// "Nu populair" op de pagina Ontdek: de 10 populairste films of series van dit moment op jouw diensten (abonnement, gratis
// of met reclame; niet huren of kopen). Populariteit is die van TMDB: een wereldwijde maat, beperkt tot wat in Nederland op
// jouw diensten staat. Wat je al zag of op je kijklijst hebt, blijft staan met een label; wat je verborg, valt weg. Ook je
// uitgesloten genres vallen weg. TMDB-antwoorden worden 6 uur bewaard (fetch-cache).

export const maxDuration = 30

const TOP = 10
const PAGES = [1, 2]
// Genoeg stemmen om rommel of onbekende titels te weren.
const MIN_VOTES = 50
const REVALIDATE_SECONDS = 6 * 60 * 60
// TMDB-genres Reality, Talk, News en Soap: zelden wat iemand bedoelt met "populair".
const SKIP_GENRES = new Set([10764, 10767, 10763, 10766])
// Zonder vertaling in de app-taal geeft TMDB het oorspronkelijke schrift; die titels slaan we over (zoals bij Nieuw).
const READABLE_TITLE = /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u

export type PopularTitle = {
  id: number
  media_type: 'movie' | 'tv'
  title: string
  poster_path: string | null
  release_date: string
  rank: number
  watchOn: string | null
  status: 'gezien' | 'kijklijst' | null
  matchPercent?: number
}

type TmdbResult = {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  release_date?: string
  first_air_date?: string
  genre_ids?: number[]
}

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'popular-now', LIMITS.titleInfo)
  if (!guard.ok) return guard.response
  const { supabase, user } = guard
  const language = tmdbLanguage(localeFromRequest(request))
  const type = request.nextUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie'

  try {
    const [{ data: profile }, { data: cached }, ratingRows, favoriteRows, hiddenRows, watchlistRows] = await Promise.all([
      supabase.from('profiles').select('streaming_services, excluded_genres').eq('id', user.id).single(),
      supabase.from('recommendations_cache').select('focused, balanced').eq('user_id', user.id).maybeSingle(),
      supabase.from('ratings').select('tmdb_id').eq('user_id', user.id).eq('media_type', type),
      supabase.from('favorite_movies').select('tmdb_id').eq('user_id', user.id).eq('media_type', type),
      supabase.from('hidden_titles').select('tmdb_id').eq('user_id', user.id).eq('media_type', type),
      supabase.from('watchlist').select('tmdb_id').eq('user_id', user.id).eq('media_type', type),
    ])

    const providerIds = Array.from(
      new Set(((profile?.streaming_services || []) as string[]).map((s) => SOURCE_IDS[s]).filter((id) => id && !RENT_ONLY_SOURCE_IDS.has(id)))
    )
    if (providerIds.length === 0) return NextResponse.json({ items: [], hasServices: false })

    const excludedGenres = new Set<number>(Array.isArray(profile?.excluded_genres) ? profile.excluded_genres : [])
    const query = new URLSearchParams({
      language,
      include_adult: 'false',
      sort_by: 'popularity.desc',
      'vote_count.gte': String(MIN_VOTES),
      watch_region: 'NL',
      with_watch_providers: providerIds.join('|'),
      with_watch_monetization_types: 'flatrate|free|ads',
    })
    if (excludedGenres.size > 0) query.set('without_genres', [...excludedGenres].join(','))

    const pages = await Promise.all(
      PAGES.map(async (page) => {
        try {
          const res = await fetch(`https://api.themoviedb.org/3/discover/${type}?${query}&page=${page}`, {
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
            next: { revalidate: REVALIDATE_SECONDS },
          })
          if (!res.ok) return [] as TmdbResult[]
          return ((await res.json()).results || []) as TmdbResult[]
        } catch {
          return [] as TmdbResult[]
        }
      })
    )

    const hidden = new Set((hiddenRows.data || []).map((r) => r.tmdb_id))
    const seen = new Set([...(ratingRows.data || []), ...(favoriteRows.data || [])].map((r) => r.tmdb_id))
    const onList = new Set((watchlistRows.data || []).map((r) => r.tmdb_id))

    const unique = new Map<number, TmdbResult>()
    for (const r of pages.flat()) {
      if (unique.has(r.id) || hidden.has(r.id) || !r.poster_path) continue
      if ((r.genre_ids || []).some((g) => SKIP_GENRES.has(g) || excludedGenres.has(g))) continue
      if (!READABLE_TITLE.test((type === 'movie' ? r.title : r.name) ?? '')) continue
      unique.set(r.id, r)
    }
    // Een paar extra: de controle op de diensten hieronder kan er nog een paar laten afvallen.
    const candidates = [...unique.values()].slice(0, TOP + 8)
    const watchInfo = await resolveWatchInfo(supabase, candidates.map((c) => ({ media_type: type, id: c.id })), new Set(providerIds))
    const available = candidates.filter((c) => watchInfo.get(`${type}-${c.id}`)).slice(0, TOP)

    // Het percentage uit je eigen tips (Puur en Breder), als de titel daar ook in staat (zoals bij Nieuw).
    const matchByKey = new Map<number, number>()
    for (const list of [cached?.focused, cached?.balanced]) {
      for (const m of (list ?? []) as { id: number; media_type: string; matchPercent?: number; basedOn?: string[] }[]) {
        if (m.media_type !== type || typeof m.matchPercent !== 'number' || m.basedOn?.includes('verrassing')) continue
        matchByKey.set(m.id, Math.max(matchByKey.get(m.id) ?? 0, m.matchPercent))
      }
    }

    const items: PopularTitle[] = available.map((c, i) => {
      const match = matchByKey.get(c.id)
      return {
        id: c.id,
        media_type: type,
        title: (type === 'movie' ? c.title : c.name) ?? '',
        poster_path: c.poster_path,
        release_date: (type === 'movie' ? c.release_date : c.first_air_date) ?? '',
        rank: i + 1,
        watchOn: watchInfo.get(`${type}-${c.id}`)?.watchOn ?? null,
        status: seen.has(c.id) ? 'gezien' : onList.has(c.id) ? 'kijklijst' : null,
        ...(match !== undefined ? { matchPercent: match } : {}),
      }
    })

    return NextResponse.json({ items, hasServices: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
