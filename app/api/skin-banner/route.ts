import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { localeFromRequest, tmdbLanguage } from '@/lib/serverI18n'
import { SKINS } from '@/lib/skins'

const CACHE_SECONDS = 60 * 60 * 6
// TMDB's soorten release: 2 = beperkte bioscooprelease, 3 = bioscooprelease.
const THEATRICAL_TYPES = [2, 3]

type ReleaseDates = { results?: { iso_3166_1: string; release_dates: { release_date: string; type: number }[] }[] }

// De Nederlandse bioscoopdatum als TMDB die kent, anders de eerste releasedatum van de titel.
function dutchReleaseDate(dates: ReleaseDates | undefined, fallback: string): string {
  const nl = dates?.results?.find((r) => r.iso_3166_1 === 'NL')?.release_dates ?? []
  const theatrical = nl.filter((d) => THEATRICAL_TYPES.includes(d.type)).map((d) => d.release_date.slice(0, 10)).sort()
  return theatrical[0] || fallback
}

// Gegevens voor de titel die bij een skin wordt uitgelicht (zie lib/skins.ts): naam, officieel beeld en wanneer hij
// uitkomt. Alleen titels die bij een skin horen, zodat dit geen algemene doorgeefluik naar TMDB is.
export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'title-info', LIMITS.titleInfo)
  if (!guard.ok) return guard.response
  // Taal van de app (cookie of browser): titels, samenvattingen en genres van TMDB in die taal.
  const language = tmdbLanguage(localeFromRequest(request))

  const banner = SKINS.find((s) => s.id === request.nextUrl.searchParams.get('skin'))?.banner
  if (!banner) return NextResponse.json({ error: 'Deze skin heeft geen uitgelichte titel' }, { status: 404 })

  try {
    const extra = banner.mediaType === 'movie' ? '&append_to_response=release_dates' : ''
    const res = await fetch(`https://api.themoviedb.org/3/${banner.mediaType}/${banner.tmdbId}?language=${language}${extra}`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) return NextResponse.json({ error: `TMDB gaf status ${res.status}` }, { status: 502 })
    const data = await res.json()

    return NextResponse.json({
      id: banner.tmdbId,
      mediaType: banner.mediaType,
      title: data.title || data.name || '',
      posterPath: data.poster_path || null,
      backdropPath: data.backdrop_path || null,
      releaseDate: dutchReleaseDate(data.release_dates, data.release_date || data.first_air_date || ''),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
