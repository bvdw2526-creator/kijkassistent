import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { getTitleFacts } from '@/lib/titleFacts'

export const maxDuration = 60

// Weetjes bij één titel (zie lib/titleFacts.ts); leeg als er niets zeker te melden is.
export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'title-facts', LIMITS.titleInfo)
  if (!guard.ok) return guard.response

  const type = request.nextUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  const id = Number(request.nextUrl.searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Ongeldige titel' }, { status: 400 })

  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) return NextResponse.json({ facts: [] })

  try {
    const facts = await getTitleFacts(guard.supabase, guard.user.id, type, id, apiKey)
    return NextResponse.json({ facts })
  } catch (err) {
    console.error('Weetjes ophalen mislukt:', err)
    return NextResponse.json({ facts: [] })
  }
}
