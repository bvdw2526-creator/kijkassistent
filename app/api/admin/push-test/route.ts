import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { serviceClient } from '@/lib/serviceClient'
import { sendTestPush } from '@/lib/push'

// Beheer: een testmelding naar je eigen telefoons, met per telefoon wat Google of Apple antwoordde. Zo is te zien of
// de sleutels in Vercel kloppen. Alleen voor de beheerder; telt niet als echte melding (niets in push_sent).
export const maxDuration = 20

export async function POST(request: NextRequest) {
  const guard = await guardRequest(request, 'admin-push-test', LIMITS.adminBackfill)
  if (!guard.ok) return guard.response
  const { data: isAdmin } = await guard.supabase.rpc('is_app_admin')
  if (isAdmin !== true) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  try {
    const results = await sendTestPush(serviceClient(), guard.user.id, {
      title: 'Testmelding Kijkassistent',
      body: 'Werkt! Tik om de app te openen.',
      url: '/',
    })
    return NextResponse.json({ results })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
