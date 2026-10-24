import { NextRequest, NextResponse } from 'next/server'
import { guardPublicRequest, LIMITS } from '@/lib/apiGuard'
import { localeFromRequest } from '@/lib/serverI18n'
import { searchTitles } from '@/lib/titleSearch'

// Zoeken naar films en series voor de openbare tip-pagina (/tip): zoals /api/search-movies, maar zonder account
// (ratelimiet per IP-adres).
export async function GET(request: NextRequest) {
  const guard = await guardPublicRequest(request, 'public-search', LIMITS.publicSearch)
  if (!guard.ok) return guard.response

  const query = request.nextUrl.searchParams.get('query')?.slice(0, 200)
  if (!query) return NextResponse.json({ results: [], note: null })

  const { results, note } = await searchTitles(query, localeFromRequest(request))
  return NextResponse.json({ results: results.slice(0, 8), note })
}
