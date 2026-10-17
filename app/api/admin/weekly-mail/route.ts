import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { serviceClient } from '@/lib/serviceClient'
import { buildWeeklyMail } from '@/lib/weeklyMail'
import { mailTransport, mailFrom } from '@/lib/mailer'

// De wekelijkse tipsmail proberen, alleen voor de beheerder en alleen met de eigen mail: GET geeft hem terug om te
// bekijken, POST verstuurt hem naar het eigen adres. De links wijzen naar de omgeving waar je dit opent (lokaal naar
// localhost), zodat je de knoppen ook lokaal kunt uitproberen. De wekelijkse verzending aan iedereen staat hier los van.
export const maxDuration = 30

async function ownMail(request: NextRequest) {
  const guard = await guardRequest(request, 'admin-weekly-mail', LIMITS.adminBackfill)
  if (!guard.ok) return { response: guard.response }
  const { data: isAdmin } = await guard.supabase.rpc('is_app_admin')
  if (isAdmin !== true) return { response: NextResponse.json({ error: 'Geen toegang' }, { status: 403 }) }
  return { result: await buildWeeklyMail(serviceClient(), guard.user.id, request.nextUrl.origin) }
}

export async function GET(request: NextRequest) {
  try {
    const own = await ownMail(request)
    if ('response' in own) return own.response
    if ('skipped' in own.result) return NextResponse.json({ skipped: own.result.skipped })
    const { to, subject, html, tips } = own.result.mail
    return NextResponse.json({ to, subject, html, tips })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const own = await ownMail(request)
    if ('response' in own) return own.response
    if ('skipped' in own.result) return NextResponse.json({ skipped: own.result.skipped })
    const transporter = mailTransport()
    if (!transporter) return NextResponse.json({ error: 'SMTP-gegevens ontbreken (SMTP_HOST, SMTP_USER, SMTP_PASS)' }, { status: 500 })
    const { to, subject, html, text, headers } = own.result.mail
    await transporter.sendMail({ from: mailFrom(), to, subject, html, text, headers })
    return NextResponse.json({ sent: to })
  } catch (err) {
    console.error('Voorbeeld-tipsmail versturen mislukt:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
