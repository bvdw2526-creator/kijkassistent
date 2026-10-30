import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { localeFromRequest, tmdbLanguage } from '@/lib/serverI18n'
import { SOURCE_IDS, RENT_ONLY_SOURCE_IDS } from '@/lib/recommendationEngine'

// De pagina "Nieuw": wat er nieuw is, los van je smaak. Nu en binnenkort in de bioscoop, en nieuwe titels op jouw diensten.
// TMDB weet niet wanneer een titel aan een dienst is toegevoegd; "nieuw op je diensten" = recent verschenen en nu op die
// dienst te zien (films komen vaak een paar maanden na de bioscoop op streaming, vandaar de ruimere termijn).
// TMDB-antwoorden worden 12 uur bewaard (fetch-cache), dus de pagina is snel en vraagt TMDB weinig.

const CINEMA_PAST_DAYS = 30
const CINEMA_AHEAD_DAYS = 14
const SERVICE_MOVIE_DAYS = 90
const SERVICE_TV_DAYS = 45
const MAX_PER_ROW = 20
const MAX_SERVICES_ROW = 40
const REVALIDATE_SECONDS = 12 * 60 * 60

// Namen zoals in Instellingen.
const SERVICE_LABELS: Record<string, string> = {
  netflix: 'Netflix',
  videoland: 'Videoland',
  disney_plus: 'Disney+',
  amazon_prime: 'Prime Video',
  hbo_max: 'HBO Max',
  apple_tv: 'Apple TV',
  skyshowtime: 'SkyShowtime',
  viaplay: 'Viaplay',
  npo_start: 'NPO Start',
  npo_plus: 'NPO Plus',
  nlziet: 'NLZIET',
}

export type NewTitle = {
  id: number
  media_type: 'movie' | 'tv'
  title: string
  poster_path: string | null
  release_date: string
  popularity: number
  services?: string[]
  matchPercent?: number
}

type TmdbResult = {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  release_date?: string
  first_air_date?: string
  popularity: number
  genre_ids?: number[]
}

// TMDB-genres Reality, Talk, News en Soap: zelden wat iemand zoekt bij "nieuw".
const SKIP_GENRES = new Set([10764, 10767, 10763, 10766])

function amsterdamDate(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
}

// Een titel zonder vertaling in de app-taal komt van TMDB in het oorspronkelijke schrift (Japans, Koreaans, Hindi...).
// Die slaan we over: zonder leesbare titel zegt de poster de meeste mensen niets.
const READABLE_TITLE = /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u

// De Nederlandse bioscoopdatum. Discover filtert met region=NL op die datum, maar geeft de eerste datum ter wereld terug.
async function dutchCinemaDate(id: number): Promise<string | null> {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/movie/${id}/release_dates`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!res.ok) return null
    const data = await res.json()
    const nl = (data.results || []).find((r: { iso_3166_1: string }) => r.iso_3166_1 === 'NL')
    const dates = ((nl?.release_dates || []) as { type: number; release_date: string }[])
      .filter((d) => d.type === 2 || d.type === 3)
      .map((d) => d.release_date.slice(0, 10))
      .sort()
    return dates[0] ?? null
  } catch {
    return null
  }
}

async function discover(mediaType: 'movie' | 'tv', params: Record<string, string>, language: string): Promise<NewTitle[]> {
  const query = new URLSearchParams({ language, include_adult: 'false', ...params })
  try {
    const res = await fetch(`https://api.themoviedb.org/3/discover/${mediaType}?${query}`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!res.ok) return []
    const data = await res.json()
    return ((data.results || []) as TmdbResult[])
      .filter((r) => r.poster_path && !(r.genre_ids ?? []).some((g) => SKIP_GENRES.has(g)))
      .filter((r) => READABLE_TITLE.test((mediaType === 'movie' ? r.title : r.name) ?? ''))
      .map((r) => ({
        id: r.id,
        media_type: mediaType,
        title: (mediaType === 'movie' ? r.title : r.name) ?? '',
        poster_path: r.poster_path,
        release_date: (mediaType === 'movie' ? r.release_date : r.first_air_date) ?? '',
        popularity: r.popularity,
      }))
  } catch {
    return []
  }
}

const cinemaParams = (from: string, to: string) => ({
  region: 'NL',
  with_release_type: '2|3',
  'release_date.gte': from,
  'release_date.lte': to,
  sort_by: 'popularity.desc',
})

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'new-titles', LIMITS.titleInfo)
  if (!guard.ok) return guard.response
  const { supabase, user } = guard
  const language = tmdbLanguage(localeFromRequest(request))

  try {
    const [{ data: profile }, { data: cached }] = await Promise.all([
      supabase.from('profiles').select('streaming_services').eq('id', user.id).single(),
      supabase.from('recommendations_cache').select('focused, balanced').eq('user_id', user.id).maybeSingle(),
    ])
    // Wat je al zag (beoordeeld of favoriet) of verborg, laten we weg.
    const [ratingRows, favoriteRows, hiddenRows] = await Promise.all([
      supabase.from('ratings').select('tmdb_id, media_type').eq('user_id', user.id),
      supabase.from('favorite_movies').select('tmdb_id, media_type').eq('user_id', user.id),
      supabase.from('hidden_titles').select('tmdb_id, media_type').eq('user_id', user.id),
    ])
    const doneKeys = new Set(
      [...(ratingRows.data ?? []), ...(favoriteRows.data ?? []), ...(hiddenRows.data ?? [])].map((r) => `${r.media_type}-${r.tmdb_id}`)
    )
    const services = ((profile?.streaming_services || []) as string[]).filter(
      (s) => SOURCE_IDS[s] && !RENT_ONLY_SOURCE_IDS.has(SOURCE_IDS[s]) && SERVICE_LABELS[s]
    )

    const today = amsterdamDate(0)
    const [cinemaNow, cinemaSoonRaw, ...perService] = await Promise.all([
      discover('movie', cinemaParams(amsterdamDate(-CINEMA_PAST_DAYS), today), language),
      discover('movie', cinemaParams(amsterdamDate(1), amsterdamDate(CINEMA_AHEAD_DAYS)), language),
      ...services.flatMap((s) => {
        // vote_count: zonder een paar stemmen is het meestal een titel die bijna niemand kent.
        const provider = { watch_region: 'NL', with_watch_providers: String(SOURCE_IDS[s]), with_watch_monetization_types: 'flatrate|free|ads', sort_by: 'popularity.desc', 'vote_count.gte': '5' }
        return [
          discover('movie', { ...provider, 'primary_release_date.gte': amsterdamDate(-SERVICE_MOVIE_DAYS), 'primary_release_date.lte': today }, language),
          discover('tv', { ...provider, 'first_air_date.gte': amsterdamDate(-SERVICE_TV_DAYS), 'first_air_date.lte': today }, language),
        ]
      }),
    ])

    // Binnenkort: met de Nederlandse datum (en wat toch al uit is, valt af).
    const cinemaSoon = (
      await Promise.all(
        cinemaSoonRaw.filter((item) => !doneKeys.has(`movie-${item.id}`)).slice(0, MAX_PER_ROW).map(async (item) => {
          const date = await dutchCinemaDate(item.id)
          return date && date > today ? { ...item, release_date: date } : null
        })
      )
    ).filter((item): item is NewTitle => item !== null)

    // Per titel alle diensten waar hij op staat.
    const byKey = new Map<string, NewTitle>()
    perService.forEach((items, i) => {
      const label = SERVICE_LABELS[services[Math.floor(i / 2)]]
      for (const item of items) {
        const key = `${item.media_type}-${item.id}`
        const known = byKey.get(key)
        if (known) known.services = [...(known.services ?? []), label]
        else byKey.set(key, { ...item, services: [label] })
      }
    })

    // Het percentage uit je eigen tips (Puur en Breder), als de titel daar toevallig ook in staat.
    const matchByKey = new Map<string, number>()
    for (const list of [cached?.focused, cached?.balanced]) {
      for (const m of (list ?? []) as { id: number; media_type: string; matchPercent?: number; basedOn?: string[] }[]) {
        if (typeof m.matchPercent !== 'number' || m.basedOn?.includes('verrassing')) continue
        const key = `${m.media_type}-${m.id}`
        matchByKey.set(key, Math.max(matchByKey.get(key) ?? 0, m.matchPercent))
      }
    }
    const withMatch = (items: NewTitle[], max = MAX_PER_ROW) =>
      items.filter((item) => !doneKeys.has(`${item.media_type}-${item.id}`)).slice(0, max).map((item) => {
        const match = matchByKey.get(`${item.media_type}-${item.id}`)
        return match !== undefined ? { ...item, matchPercent: match } : item
      })

    return NextResponse.json({
      cinemaNow: withMatch(cinemaNow),
      cinemaSoon: withMatch([...cinemaSoon].sort((a, b) => a.release_date.localeCompare(b.release_date))),
      // Meer plek dan de andere rijen: meerdere diensten, films én series.
      onServices: withMatch([...byKey.values()].sort((a, b) => b.popularity - a.popularity), MAX_SERVICES_ROW),
      hasServices: services.length > 0,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
