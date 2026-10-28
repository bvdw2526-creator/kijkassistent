import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { localeFromRequest, serverTranslator } from '@/lib/serverI18n'
import { serviceClient } from '@/lib/serviceClient'
import { mailTransport, mailFrom } from '@/lib/mailer'

export const maxDuration = 30

const KINDS = ['idea', 'bug', 'compliment'] as const
type Kind = (typeof KINDS)[number]
const KIND_LABEL: Record<Kind, string> = { idea: 'Idee', bug: 'Iets werkt niet', compliment: 'Compliment' }
const MAX_LENGTH = 1000

// Feedback uit Instellingen (zie app/components/FeedbackSheet.tsx): bewaren in public.feedback (migratie
// 20261028_feedback) en meteen een mailtje naar de beheerder. Lukt de mail niet, dan staat het bericht toch in /beheer.
export async function POST(request: NextRequest) {
  const guard = await guardRequest(request, 'feedback', LIMITS.feedback)
  if (!guard.ok) return guard.response
  const t = serverTranslator(localeFromRequest(request), 'api')

  let body: { kind?: unknown; message?: unknown; mayContact?: unknown; platform?: unknown; appVersion?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: t('saveFailed') }, { status: 400 })
  }
  const kind = KINDS.includes(body.kind as Kind) ? (body.kind as Kind) : null
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_LENGTH) : ''
  if (!kind || !message) return NextResponse.json({ error: t('saveFailed') }, { status: 400 })
  const mayContact = body.mayContact !== false
  const platform = typeof body.platform === 'string' ? body.platform.slice(0, 20) : null
  const appVersion = typeof body.appVersion === 'string' ? body.appVersion.slice(0, 20) : null
  const locale = localeFromRequest(request)
  const email = guard.user.email ?? null

  const { error } = await serviceClient().from('feedback').insert({
    user_id: guard.user.id,
    email,
    kind,
    message,
    may_contact: mayContact,
    locale,
    platform,
    app_version: appVersion,
  })
  if (error) {
    console.error('Feedback opslaan mislukt:', error.message)
    return NextResponse.json({ error: t('saveFailed') }, { status: 500 })
  }

  const transporter = mailTransport()
  if (!transporter) {
    console.error('Feedback-mail niet verstuurd: SMTP-gegevens ontbreken in de omgeving')
  } else {
    try {
      await transporter.sendMail({
        from: mailFrom(),
        to: process.env.NOTIFY_TO || 'info@kijkassistent.nl',
        ...(mayContact && email ? { replyTo: email } : {}),
        subject: `Feedback (${KIND_LABEL[kind]}) van ${email ?? 'onbekend'}`,
        text: [
          `Soort: ${KIND_LABEL[kind]}`,
          `Van: ${email ?? 'onbekend'}${mayContact ? ' (mag gemaild worden: antwoorden kan direct)' : ' (wil niet gemaild worden)'}`,
          `Taal: ${locale} · ${platform ?? 'onbekend'}${appVersion ? ` ${appVersion}` : ''}`,
          '',
          message,
          '',
          'Alle feedback staat ook in /beheer.',
        ].join('\n'),
      })
    } catch (err) {
      console.error('Feedback-mail versturen mislukt:', err)
    }
  }

  return NextResponse.json({ ok: true })
}
