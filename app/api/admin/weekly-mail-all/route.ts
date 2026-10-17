import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { serviceClient } from '@/lib/serviceClient'
import { sendWeeklyMails } from '@/lib/weeklyMailSend'

// De wekelijkse tipsmail nu naar iedereen sturen, met de hand vanuit /beheer (alleen de beheerder). Zelfde verzending als
// de automatische op vrijdag: wie er deze week al een kreeg, slaat hij over, dus twee keer drukken stuurt niet dubbel.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const guard = await guardRequest(request, 'admin-weekly-mail-all', LIMITS.adminBackfill)
  if (!guard.ok) return guard.response
  const { data: isAdmin } = await guard.supabase.rpc('is_app_admin')
  if (isAdmin !== true) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  try {
    const summary = await sendWeeklyMails(serviceClient(), 45_000)
    console.log('Tipsmail met de hand verstuurd:', summary)
    return NextResponse.json(summary)
  } catch (err) {
    console.error('Tipsmail naar iedereen mislukt:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
