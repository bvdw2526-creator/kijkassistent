import { NextRequest, NextResponse } from 'next/server'

const BOOK_KEYWORD_ID = 818
const CACHE_SECONDS = 60 * 60 * 24 * 7

export async function GET(request: NextRequest) {
  const mediaType = request.nextUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10)
  if (!id) return NextResponse.json({ isBookAdaptation: false })

  try {
    const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}/keywords`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) return NextResponse.json({ isBookAdaptation: false })
    const data = await res.json()
    // Films leveren "keywords", series "results".
    const keywords: { id: number }[] = data.keywords || data.results || []
    return NextResponse.json({ isBookAdaptation: keywords.some((k) => k.id === BOOK_KEYWORD_ID) })
  } catch {
    return NextResponse.json({ isBookAdaptation: false })
  }
}
