import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query')

  if (!query) {
    return NextResponse.json({ results: [] })
  }

  const response = await fetch(
    `https://api.themoviedb.org/3/search/person?query=${encodeURIComponent(query)}&language=nl-NL`,
    {
      headers: {
        Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  )

  const data = await response.json()

  // TMDB sorteert search/person al op populariteit; alleen acteurs/actrices (department
  // "Acting") zijn relevant voor "favoriete acteurs" — regisseurs/crew dus niet.
  const results = (data.results || [])
    .filter((item: { known_for_department?: string }) => item.known_for_department === 'Acting')
    .map((item: { id: number; name: string; profile_path: string | null }) => ({
      id: item.id,
      name: item.name,
      profile_path: item.profile_path,
    }))

  return NextResponse.json({ results })
}
