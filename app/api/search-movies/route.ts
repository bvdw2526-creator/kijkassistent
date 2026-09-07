import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query')

  if (!query) {
    return NextResponse.json({ results: [] })
  }

  const response = await fetch(
    `https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&language=nl-NL`,
    {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  )

  const data = await response.json()

  // Alleen films en series overhouden (multi search geeft ook acteurs/mensen terug)
  const results = (data.results || [])
    .filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv')
    .map((item: any) => ({
      id: item.id,
      title: item.title || item.name,
      release_date: item.release_date || item.first_air_date,
      poster_path: item.poster_path,
      media_type: item.media_type,
    }))

  return NextResponse.json({ results })
}