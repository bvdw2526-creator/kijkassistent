import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { serviceClient } from '@/lib/serviceClient'
import { pushConfigured } from '@/lib/push'
import { sendSeriesPushes, sendWeeklyPush } from '@/lib/pushJobs'
import { amsterdamToday } from '@/lib/seriesUpdatesServer'

// Dagelijkse pushmeldingen (zie vercel.json): elke dag nieuwe seizoenen, en op vrijdag, zaterdag en zondag de
// weekendtip (hooguit één per week; wat vrijdag niet lukte, gaat zaterdag of zondag mee). Alleen voor wie de app met
// meldingen heeft (push_tokens). Vercel stuurt CRON_SECRET mee; zonder dat geheim doet deze route niets.
export const maxDuration = 60

const BUDGET_MS = 50_000

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
  if (!pushConfigured()) return NextResponse.json({ skipped: 'geen pushsleutels' })

  const deadline = Date.now() + BUDGET_MS
  const db = serviceClient()
  const weekday = new Date(`${amsterdamToday()}T12:00:00Z`).getUTCDay() // 0 = zondag, 5 = vrijdag, 6 = zaterdag
  const weekend = weekday === 5 || weekday === 6 || weekday === 0

  const { data: rows, error } = await db.from('push_tokens').select('user_id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const users = Array.from(new Set((rows ?? []).map((r) => r.user_id as string)))

  const summary = { users: users.length, weekly: 0, series: 0, failed: 0, leftForNextRun: 0 }
  for (let i = 0; i < users.length; i++) {
    if (Date.now() > deadline) {
      summary.leftForNextRun = users.length - i
      break
    }
    try {
      if (weekend && (await sendWeeklyPush(db, users[i]))) summary.weekly++
      summary.series += await sendSeriesPushes(db, users[i])
    } catch (err) {
      console.error('Pushmelding mislukt voor', users[i], err)
      summary.failed++
    }
  }
  console.log('Pushmeldingen:', summary)
  return NextResponse.json(summary)
}
