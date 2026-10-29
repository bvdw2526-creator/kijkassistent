import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { serviceClient } from '@/lib/serviceClient'

// Welke pushmeldingen iemand wil (Instellingen > Meldingen). Geen rij in push_settings = alles aan.
const KINDS = ['weekly', 'partner', 'series'] as const
type Settings = Record<(typeof KINDS)[number], boolean>

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'push', LIMITS.push)
  if (!guard.ok) return guard.response
  const db = serviceClient()
  const [{ data }, { count }] = await Promise.all([
    db.from('push_settings').select('weekly, partner, series').eq('user_id', guard.user.id).maybeSingle(),
    db.from('push_tokens').select('token', { count: 'exact', head: true }).eq('user_id', guard.user.id),
  ])
  const settings: Settings = { weekly: data?.weekly ?? true, partner: data?.partner ?? true, series: data?.series ?? true }
  return NextResponse.json({ settings, devices: count ?? 0 })
}

export async function POST(request: NextRequest) {
  const guard = await guardRequest(request, 'push', LIMITS.push)
  if (!guard.ok) return guard.response
  let body: Partial<Record<string, unknown>>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldige invoer' }, { status: 400 })
  }
  const update: Partial<Settings> = {}
  for (const kind of KINDS) if (typeof body[kind] === 'boolean') update[kind] = body[kind] as boolean
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Ongeldige invoer' }, { status: 400 })

  const { error } = await serviceClient()
    .from('push_settings')
    .upsert({ user_id: guard.user.id, ...update, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) {
    console.error('Meldingsinstelling opslaan mislukt:', error)
    return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
