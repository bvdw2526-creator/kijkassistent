import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { serviceClient } from '@/lib/serviceClient'
import { sendWeeklyMails } from '@/lib/weeklyMailSend'

// Automatische verzending van de wekelijkse tipsmail (zie vercel.json: vrijdag-, zaterdag- en zondagmiddag). Vrijdag
// gaat hij naar iedereen; zaterdag en zondag alleen naar wie vrijdag niet meer binnen de tijd paste of toen nog geen
// lijst had (zie lib/weeklyMailSend.ts). Vercel stuurt CRON_SECRET mee; zonder dat geheim doet deze route niets.
export const maxDuration = 60

function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(request: NextRequest) {
  if (!authorized(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Niet toegestaan' }, { status: 401 })
  }
  try {
    const summary = await sendWeeklyMails(serviceClient(), 45_000)
    console.log('Wekelijkse tipsmail:', summary)
    return NextResponse.json(summary)
  } catch (err) {
    console.error('Wekelijkse tipsmail mislukt:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
