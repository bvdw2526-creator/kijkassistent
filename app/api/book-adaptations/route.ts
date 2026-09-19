import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SOURCE_IDS } from '@/lib/recommendationEngine'

// TMDB-trefwoord "based on novel or book". Door de community getagd, dus niet volledig:
// bekende verfilmingen zitten er vrijwel altijd in, obscure titels soms niet.
const BOOK_KEYWORD_ID = 818
const CACHE_SECONDS = 60 * 60 * 12

type TmdbResult = {
  id: number
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path: string | null
}

async function searchBookAdaptations(mediaType: 'movie' | 'tv', query: string) {
  const headers = { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/search/${mediaType}?query=${encodeURIComponent(query)}&language=nl-NL`,
      { headers, next: { revalidate: CACHE_SECONDS } }
    )
    if (!res.ok) return NextResponse.json({ error: `TMDB gaf status ${res.status}` }, { status: 502 })
    const data = await res.json()
    const found = ((data.results || []) as TmdbResult[]).slice(0, 20)

    const checked = await Promise.all(
      found.map(async (item) => {
        try {
          const kwRes = await fetch(`https://api.themoviedb.org/3/${mediaType}/${item.id}/keywords`, {
            headers,
            next: { revalidate: 60 * 60 * 24 * 7 },
          })
          if (!kwRes.ok) return false
          const kw = await kwRes.json()
          const keywords: { id: number }[] = kw.keywords || kw.results || []
          return keywords.some((k) => k.id === BOOK_KEYWORD_ID)
        } catch {
          return false
        }
      })
    )

    const results = found
      .filter((_, i) => checked[i])
      .map((item) => ({
        id: item.id,
        title: item.title || item.name || '',
        release_date: item.release_date || item.first_air_date,
        poster_path: item.poster_path,
        media_type: mediaType,
      }))
    return NextResponse.json({ results, page: 1, totalPages: 1 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const mediaType = params.get('type') === 'tv' ? 'tv' : 'movie'
  const page = Math.min(Math.max(parseInt(params.get('page') || '1', 10) || 1, 1), 20)
  const mineOnly = params.get('mine') === '1'

  const query = (params.get('q') || '').trim()
  if (query) {
    // TMDB kan niet tegelijk op titel én trefwoord zoeken: daarom zoeken we op titel en
    // houden we alleen de resultaten over die het boek-trefwoord hebben. Het
    // "alleen op mijn diensten"-filter geldt hier niet.
    return searchBookAdaptations(mediaType, query)
  }

  let providerFilter = ''
  if (mineOnly) {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('streaming_services').eq('id', user.id).single()
    const providerIds = ((profile?.streaming_services || []) as string[])
      .map((s) => SOURCE_IDS[s])
      .filter((id): id is number => typeof id === 'number')
    // Geen diensten ingesteld: dan valt er niets te filteren, toon gewoon alles.
    if (providerIds.length > 0) {
      providerFilter = `&watch_region=NL&with_watch_monetization_types=flatrate&with_watch_providers=${providerIds.join('|')}`
    }
  }

  const url =
    `https://api.themoviedb.org/3/discover/${mediaType}?with_keywords=${BOOK_KEYWORD_ID}` +
    `&language=nl-NL&sort_by=popularity.desc&vote_count.gte=100&page=${page}${providerFilter}`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) return NextResponse.json({ error: `TMDB gaf status ${res.status}` }, { status: 502 })
    const data = await res.json()
    const results = ((data.results || []) as TmdbResult[]).map((item) => ({
      id: item.id,
      title: item.title || item.name || '',
      release_date: item.release_date || item.first_air_date,
      poster_path: item.poster_path,
      media_type: mediaType,
    }))
    return NextResponse.json({ results, page, totalPages: Math.min(data.total_pages || 1, 20) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
