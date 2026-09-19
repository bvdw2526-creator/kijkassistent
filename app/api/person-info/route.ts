import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'

const CACHE_SECONDS = 60 * 60 * 24
// Talkshows en nieuws zeggen niets over het werk van iemand — die laten we bij "bekend van" weg.
const EXCLUDED_GENRE_IDS = new Set([10767, 10763])
const KNOWN_FOR_LIMIT = 6

type CreditEntry = {
  id: number
  media_type: 'movie' | 'tv' | 'person'
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  popularity?: number
  vote_count?: number
  genre_ids?: number[]
  job?: string
}

const headers = () => ({ Authorization: `Bearer ${process.env.TMDB_API_KEY}` })

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'title-info', LIMITS.titleInfo)
  if (!guard.ok) return guard.response

  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10)
  if (!id) return NextResponse.json({ error: 'Ongeldig id' }, { status: 400 })

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/person/${id}?language=nl-NL&append_to_response=combined_credits`,
      { headers: headers(), next: { revalidate: CACHE_SECONDS } }
    )
    if (!res.ok) return NextResponse.json({ error: `TMDB gaf status ${res.status}` }, { status: 502 })
    const data = await res.json()

    // Veel biografieën bestaan alleen in het Engels; liever dat dan niets.
    let biography: string = data.biography || ''
    if (!biography) {
      const en = await fetch(`https://api.themoviedb.org/3/person/${id}?language=en-US`, {
        headers: headers(),
        next: { revalidate: CACHE_SECONDS },
      })
      if (en.ok) biography = (await en.json()).biography || ''
    }

    const isDirector = data.known_for_department === 'Directing'
    const credits: CreditEntry[] = isDirector
      ? (data.combined_credits?.crew || []).filter((c: CreditEntry) => c.job === 'Director')
      : data.combined_credits?.cast || []

    const seen = new Set<string>()
    const knownFor = credits
      .filter((c) => (c.media_type === 'movie' || c.media_type === 'tv') && (c.vote_count || 0) >= 50)
      .filter((c) => !(c.genre_ids || []).some((g) => EXCLUDED_GENRE_IDS.has(g)))
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .filter((c) => {
        const key = `${c.media_type}-${c.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .slice(0, KNOWN_FOR_LIMIT)
      .map((c) => ({
        id: c.id,
        media_type: c.media_type,
        title: c.title || c.name || '',
        year: (c.release_date || c.first_air_date || '').slice(0, 4),
      }))

    return NextResponse.json({
      name: data.name,
      profilePath: data.profile_path || null,
      department: data.known_for_department || '',
      birthday: data.birthday || null,
      deathday: data.deathday || null,
      placeOfBirth: data.place_of_birth || null,
      biography,
      knownFor,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
