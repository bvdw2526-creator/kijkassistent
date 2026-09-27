import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'

const BOOK_KEYWORD_ID = 818
// TMDB's eigen trefwoord voor "gebaseerd op een waargebeurd verhaal" — in tegenstelling tot een
// "soundtrack"-trefwoord wordt dit wél consequent gebruikt (getest op o.a. Oppenheimer, Catch Me
// If You Can, The Social Network, Schindler's List — allemaal aanwezig; Rocky IV en Guardians of
// the Galaxy terecht niet).
const TRUE_STORY_KEYWORD_ID = 9672
const CACHE_SECONDS = 60 * 60 * 24 * 7

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'title-info', LIMITS.titleInfo)
  if (!guard.ok) return guard.response

  const mediaType = request.nextUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10)
  if (!id) return NextResponse.json({ isBookAdaptation: false, isTrueStory: false })

  try {
    const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}/keywords`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) return NextResponse.json({ isBookAdaptation: false, isTrueStory: false })
    const data = await res.json()
    // Films leveren "keywords", series "results".
    const keywords: { id: number }[] = data.keywords || data.results || []
    return NextResponse.json({
      isBookAdaptation: keywords.some((k) => k.id === BOOK_KEYWORD_ID),
      isTrueStory: keywords.some((k) => k.id === TRUE_STORY_KEYWORD_ID),
    })
  } catch {
    return NextResponse.json({ isBookAdaptation: false, isTrueStory: false })
  }
}
