import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'

const CACHE_SECONDS = 60 * 60 * 12

type TmdbResult = {
  id: number
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path: string | null
}

function todayNL(): string {
  // Datum in Nederlandse tijd, niet UTC: rond middernacht anders soms een dag verschoven.
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
}

function monthsAhead(months: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
}

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'upcoming', LIMITS.search)
  if (!guard.ok) return guard.response

  const type = request.nextUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  const page = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('page') || '1', 10) || 1, 1), 20)
  const today = todayNL()
  const until = monthsAhead(6)

  // Bij films kijken we naar "primary_release_date" (i.p.v. het gewone "release_date"): dat is
  // de eigenlijke releasedatum van de titel zelf, anders komen er ook oude films tussen door een
  // losse heruitgave-datum die toevallig in de periode valt. Bij series is "first_air_date" de
  // datum van de allereerste aflevering ooit — dit vindt dus nieuwe series, geen nieuw seizoen
  // van een serie die al langer loopt.
  const url =
    type === 'movie'
      ? `https://api.themoviedb.org/3/discover/movie?language=nl-NL&region=NL&sort_by=popularity.desc` +
        `&with_release_type=2|3&primary_release_date.gte=${today}&primary_release_date.lte=${until}&page=${page}`
      : `https://api.themoviedb.org/3/discover/tv?language=nl-NL&sort_by=popularity.desc` +
        `&first_air_date.gte=${today}&first_air_date.lte=${until}&page=${page}`

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) return NextResponse.json({ error: `TMDB gaf status ${res.status}` }, { status: 502 })
    const data = await res.json()
    const results = ((data.results || []) as TmdbResult[])
      // Nogmaals filteren op de datum die TMDB zelf teruggeeft: dekt de zeldzame gevallen af
      // waarbij het discover-filter toch een titel buiten de periode meegeeft.
      .filter((item) => ((type === 'movie' ? item.release_date : item.first_air_date) ?? '') >= today)
      .map((item) => ({
        id: item.id,
        title: item.title || item.name || '',
        release_date: type === 'movie' ? item.release_date : item.first_air_date,
        poster_path: item.poster_path,
        media_type: type,
      }))
    return NextResponse.json({ results, page, totalPages: Math.min(data.total_pages || 1, 20) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
