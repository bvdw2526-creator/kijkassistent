import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { serviceClient } from '@/lib/serviceClient'

// De app meldt hier het adres van de telefoon voor pushmeldingen aan (bij elke start, zie app/components/PushSetup.tsx)
// en af bij uitloggen. Een adres hoort bij één account: logt iemand anders in op dezelfde telefoon, dan verhuist het.
const PLATFORMS = ['android', 'ios'] as const

async function readToken(request: NextRequest): Promise<{ token: string; platform: string | null } | null> {
  try {
    const body = (await request.json()) as { token?: unknown; platform?: unknown }
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!token || token.length > 4096) return null
    return { token, platform: typeof body.platform === 'string' ? body.platform : null }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  const guard = await guardRequest(request, 'push', LIMITS.push)
  if (!guard.ok) return guard.response
  const input = await readToken(request)
  if (!input || !PLATFORMS.includes(input.platform as (typeof PLATFORMS)[number])) {
    return NextResponse.json({ error: 'Ongeldig adres' }, { status: 400 })
  }
  const { error } = await serviceClient()
    .from('push_tokens')
    .upsert(
      { token: input.token, user_id: guard.user.id, platform: input.platform, last_seen_at: new Date().toISOString() },
      { onConflict: 'token' }
    )
  if (error) {
    console.error('Pushadres opslaan mislukt:', error)
    return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const guard = await guardRequest(request, 'push', LIMITS.push)
  if (!guard.ok) return guard.response
  const input = await readToken(request)
  if (!input) return NextResponse.json({ error: 'Ongeldig adres' }, { status: 400 })
  await serviceClient().from('push_tokens').delete().eq('token', input.token).eq('user_id', guard.user.id)
  return NextResponse.json({ ok: true })
}
