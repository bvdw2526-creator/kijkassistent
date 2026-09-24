import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { matchFilm, type MatchInput } from '@/lib/letterboxdMatch'

export const maxDuration = 60

const MAX_PER_CALL = 25

// Zoekt bij een portie Letterboxd-films (naam + jaar) de bijbehorende TMDB-titels.
export async function POST(request: NextRequest) {
  const guard = await guardRequest(request, 'import-match', LIMITS.importMatch)
  if (!guard.ok) return guard.response

  let body: { films?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }
  if (!Array.isArray(body.films) || body.films.length === 0 || body.films.length > MAX_PER_CALL) {
    return NextResponse.json({ error: `Stuur 1 tot ${MAX_PER_CALL} films tegelijk` }, { status: 400 })
  }

  const films: MatchInput[] = body.films.map((f) => {
    const { name, year } = (f ?? {}) as { name?: unknown; year?: unknown }
    return {
      name: typeof name === 'string' ? name.slice(0, 200) : '',
      year: typeof year === 'number' && Number.isFinite(year) ? year : null,
    }
  })

  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'TMDB niet geconfigureerd' }, { status: 500 })

  const matches = await Promise.all(films.map((f) => (f.name ? matchFilm(f, apiKey) : Promise.resolve(null))))
  return NextResponse.json({ matches })
}
