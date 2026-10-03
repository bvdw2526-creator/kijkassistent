import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'

const CACHE_SECONDS = 60 * 60 * 24 * 7

type TmdbVideo = { key: string; site: string; type: string; official: boolean; iso_639_1: string; published_at: string }

// Zoekt bij een titel de beste trailer op YouTube (TMDB's /videos). Geeft alleen de YouTube-sleutel
// terug; de app maakt er zelf een gewone link van. Geen trailer gevonden of TMDB onbereikbaar: gewoon
// { key: null }, zodat de knop in de app simpelweg niet verschijnt.
export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'title-info', LIMITS.titleInfo)
  if (!guard.ok) return guard.response

  const mediaType = request.nextUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10)
  if (!id) return NextResponse.json({ key: null })

  try {
    // Nederlandse en Engelse video's in één aanroep; Nederlands krijgt voorrang. Bij gelijke score de oudste,
    // dat is meestal de originele trailer (en niet die van een heruitgave of een later seizoen).
    const res = await fetch(
      `https://api.themoviedb.org/3/${mediaType}/${id}/videos?language=nl-NL&include_video_language=nl,en`,
      { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` }, next: { revalidate: CACHE_SECONDS } }
    )
    if (!res.ok) return NextResponse.json({ key: null })
    const data = await res.json()
    const videos = ((data.results || []) as TmdbVideo[]).filter((v) => v.site === 'YouTube' && v.key)
    const rank = (v: TmdbVideo) =>
      (v.type === 'Trailer' ? 4 : v.type === 'Teaser' ? 0 : -10) + (v.iso_639_1 === 'nl' ? 2 : 0) + (v.official ? 1 : 0)
    const best = videos
      .filter((v) => v.type === 'Trailer' || v.type === 'Teaser')
      .sort((a, b) => rank(b) - rank(a) || (a.published_at || '').localeCompare(b.published_at || ''))[0]
    return NextResponse.json({ key: best?.key ?? null })
  } catch {
    return NextResponse.json({ key: null })
  }
}
