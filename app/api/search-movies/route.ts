import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { searchTitles } from '@/lib/titleSearch'

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'search', LIMITS.search)
  if (!guard.ok) return guard.response

  const query = request.nextUrl.searchParams.get('query')?.slice(0, 200)

  if (!query) {
    return NextResponse.json({ results: [], note: null })
  }

  // Films en series (multi search geeft ook acteurs terug, die laten we weg); bij geen goede treffer de beste gelijkenissen,
  // met een korte uitleg in `note`. Zie lib/titleSearch.ts.
  const { results, note } = await searchTitles(query)
  return NextResponse.json({ results, note })
}
