import { NextRequest, NextResponse } from 'next/server'

// TMDB's "known_for_department" is de afdeling waar iemand het bekendst om is — niet
// waterdicht (een acteur-regisseur zoals Ben Affleck staat bv. onder "Acting"), maar
// wel genoeg om het gewenste type (acteur vs. regisseur) in de zoekresultaten flink te
// verschralen tot relevante treffers.
const DEPARTMENT_BY_TYPE = {
  actor: 'Acting',
  director: 'Directing',
} as const

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('query')
  const type = request.nextUrl.searchParams.get('type') === 'director' ? 'director' : 'actor'

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

  // TMDB sorteert search/person al op populariteit.
  const results = (data.results || [])
    .filter((item: { known_for_department?: string }) => item.known_for_department === DEPARTMENT_BY_TYPE[type])
    .map((item: { id: number; name: string; profile_path: string | null }) => ({
      id: item.id,
      name: item.name,
      profile_path: item.profile_path,
    }))

  return NextResponse.json({ results })
}
