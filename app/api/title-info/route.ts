import { NextRequest, NextResponse } from 'next/server'

const BOOK_KEYWORD_ID = 818
const CACHE_SECONDS = 60 * 60 * 24

type ProviderEntry = { provider_name: string }

export async function GET(request: NextRequest) {
  const mediaType = request.nextUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10)
  if (!id) return NextResponse.json({ error: 'Ongeldig id' }, { status: 400 })

  try {
    // Eén aanroep voor alles wat de infopopup nodig heeft (details + trefwoorden +
    // kijkaanbod); TMDB's append_to_response voorkomt drie losse round trips.
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${id}?language=nl-NL&append_to_response=keywords,watch/providers`,
      { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }, next: { revalidate: CACHE_SECONDS } }
    )
    if (!res.ok) return NextResponse.json({ error: `TMDB gaf status ${res.status}` }, { status: 502 })
    const data = await res.json()

    const keywords: { id: number }[] = data.keywords?.keywords || data.keywords?.results || []
    const nl = data['watch/providers']?.results?.NL
    const date: string = data.release_date || data.first_air_date || ''

    return NextResponse.json({
      overview: data.overview || '',
      voteAverage: data.vote_average || 0,
      genres: ((data.genres || []) as { name: string }[]).map((g) => g.name),
      year: date.slice(0, 4),
      posterPath: data.poster_path || null,
      isBookAdaptation: keywords.some((k) => k.id === BOOK_KEYWORD_ID),
      streaming: ((nl?.flatrate || []) as ProviderEntry[]).map((p) => p.provider_name),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
