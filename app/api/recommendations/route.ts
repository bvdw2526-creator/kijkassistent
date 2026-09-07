import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SOURCE_IDS: Record<string, number> = {
  netflix: 203,
  videoland: 465,
  disney_plus: 372,
  amazon_prime: 68,
  hbo_max: 454,
}

const CACHE_MAX_AGE_HOURS = 24

async function getWatchmodeSources(supabase: any, mediaType: string, tmdbId: number) {
  const { data: cached } = await supabase
    .from('watchmode_cache')
    .select('sources, fetched_at')
    .eq('media_type', mediaType)
    .eq('tmdb_id', tmdbId)
    .single()

  if (cached) {
    const ageHours = (Date.now() - new Date(cached.fetched_at).getTime()) / (1000 * 60 * 60)
    if (ageHours < CACHE_MAX_AGE_HOURS) {
      return cached.sources
    }
  }

  try {
    const res = await fetch(
      `https://api.watchmode.com/v1/title/${mediaType}-${tmdbId}/sources/?apiKey=${process.env.WATCHMODE_API_KEY}&regions=NL`
    )
    if (!res.ok) return []

    const sources = await res.json()
    const sourcesArray = Array.isArray(sources) ? sources : []

    await supabase.from('watchmode_cache').upsert(
      {
        media_type: mediaType,
        tmdb_id: tmdbId,
        sources: sourcesArray,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: 'media_type,tmdb_id' }
    )

    return sourcesArray
  } catch {
    return []
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data: favorites } = await supabase
    .from('favorite_movies')
    .select('tmdb_id, title, media_type')
    .eq('user_id', user.id)

  const { data: ratings } = await supabase
    .from('ratings')
    .select('tmdb_id, title, rating, media_type')
    .eq('user_id', user.id)

  const { data: watchlist } = await supabase
    .from('watchlist')
    .select('tmdb_id, media_type')
    .eq('user_id', user.id)

  if (!favorites || favorites.length === 0) {
    return NextResponse.json({ results: [] })
  }

  const excludeIds = new Set([
    ...favorites.map((f) => `${f.media_type}-${f.tmdb_id}`),
    ...(ratings?.map((r) => `${r.media_type}-${r.tmdb_id}`) || []),
    ...(watchlist?.map((w) => `${w.media_type}-${w.tmdb_id}`) || []),
  ])

  const lovedItems = ratings?.filter((r) => r.rating === 'love') || []
  const okItems = ratings?.filter((r) => r.rating === 'ok') || []

  // "Niet voor mij" draagt bewust niet bij als bron — die titels sluiten we alleen uit (via excludeIds hierboven)
  const sources = [
    ...favorites.map((f) => ({ tmdb_id: f.tmdb_id, title: f.title, media_type: f.media_type, weight: 1 })),
    ...lovedItems.map((r) => ({ tmdb_id: r.tmdb_id, title: r.title, media_type: r.media_type, weight: 2 })),
    ...okItems.map((r) => ({ tmdb_id: r.tmdb_id, title: r.title, media_type: r.media_type, weight: 0.5 })),
  ]

  const recommendationLists = await Promise.all(
    sources.flatMap((source) =>
      [1, 2].map(async (page) => {
        const endpoint = source.media_type === 'tv' ? 'tv' : 'movie'
        const res = await fetch(
          `https://api.themoviedb.org/3/${endpoint}/${source.tmdb_id}/recommendations?language=nl-NL&page=${page}`,
          { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
        )
        const data = await res.json()
        const results = (data.results || []).map((item: any) => ({
          id: item.id,
          title: item.title || item.name,
          poster_path: item.poster_path,
          vote_average: item.vote_average,
          overview: item.overview || '',
          media_type: source.media_type,
        }))
        return { results, weight: source.weight, sourceTitle: source.title }
      })
    )
  )

  const scoreMap = new Map<string, any>()
  for (const list of recommendationLists) {
    for (const item of list.results) {
      const key = `${item.media_type}-${item.id}`
      if (excludeIds.has(key)) continue
      if (!scoreMap.has(key)) {
        scoreMap.set(key, { ...item, score: 0, basedOn: new Set<string>() })
      }
      const entry = scoreMap.get(key)
      entry.score += list.weight
      entry.basedOn.add(list.sourceTitle)
    }
  }

  const allScored = Array.from(scoreMap.values()).map((item) => ({
    ...item,
    basedOn: Array.from(item.basedOn).slice(0, 3),
  }))

  const sortedMovies = allScored
    .filter((m) => m.media_type === 'movie')
    .sort((a, b) => b.score - a.score || b.vote_average - a.vote_average)
    .slice(0, 40)

  const sortedTv = allScored
    .filter((m) => m.media_type === 'tv')
    .sort((a, b) => b.score - a.score || b.vote_average - a.vote_average)
    .slice(0, 25)

  const sorted = [...sortedMovies, ...sortedTv]

  const { data: profile } = await supabase
    .from('profiles')
    .select('streaming_services')
    .eq('id', user.id)
    .single()

  const userServices: string[] = profile?.streaming_services || []
  const userSourceIds = new Set(userServices.map((s) => SOURCE_IDS[s]).filter(Boolean))

  if (userSourceIds.size === 0) {
    return NextResponse.json({ results: sorted })
  }

  const filtered = await Promise.all(
    sorted.map(async (item) => {
      const itemSources = await getWatchmodeSources(supabase, item.media_type, item.id)

      const matchingSource = itemSources.find(
        (s: any) => userSourceIds.has(s.source_id) && s.type === 'sub'
      )

      if (matchingSource) {
        return { ...item, watchOn: matchingSource.name, watchUrl: matchingSource.web_url }
      }
      return null
    })
  )

  const available = filtered.filter((m) => m !== null)

  return NextResponse.json({ results: available })
}