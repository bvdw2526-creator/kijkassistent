import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { warmTitleCaches } from '@/lib/recommendationEngine'

export const maxDuration = 60

const MAX_PER_CALL = 25

// Bereidt na een import de gedeelde caches voor een portie films voor (zie warmTitleCaches), zodat
// de eerste keer aanbevelingen berekenen daarna snel gaat. Doet niets met de gegevens van de gebruiker.
export async function POST(request: NextRequest) {
  const guard = await guardRequest(request, 'import-warmup', LIMITS.importWarmup)
  if (!guard.ok) return guard.response

  let body: { items?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }
  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > MAX_PER_CALL) {
    return NextResponse.json({ error: `Stuur 1 tot ${MAX_PER_CALL} titels tegelijk` }, { status: 400 })
  }

  const items = body.items.flatMap((i) => {
    const { id, title } = (i ?? {}) as { id?: unknown; title?: unknown }
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) return []
    return [{ mediaType: 'movie' as const, tmdbId: id, title: typeof title === 'string' ? title.slice(0, 200) : '' }]
  })

  try {
    await warmTitleCaches(guard.supabase, items)
  } catch (err) {
    console.error('Cache voorbereiden mislukt:', err)
    return NextResponse.json({ error: 'Voorbereiden mislukt' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, count: items.length })
}
