import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import nodemailer from 'nodemailer'

export const maxDuration = 30

// Wordt aangeroepen door de database (zie migratie 20260926_notify_new_user): bij elk nieuw account gaat er een
// mailtje naar de beheerder. Alleen de database kent het gedeelde geheim; zonder dat geheim doet deze route niets,
// zodat niemand er mails mee kan laten versturen.
function secretMatches(given: string | null): boolean {
  const expected = process.env.NOTIFY_SECRET
  if (!expected || !given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get('x-notify-secret'))) {
    return NextResponse.json({ error: 'Niet toegestaan' }, { status: 401 })
  }

  let body: { email?: unknown; created_at?: unknown; total?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }
  const email = typeof body.email === 'string' ? body.email.slice(0, 200) : ''
  if (!email) return NextResponse.json({ error: 'Geen e-mailadres' }, { status: 400 })
  const createdAt = typeof body.created_at === 'string' ? new Date(body.created_at) : new Date()
  const total = typeof body.total === 'number' ? body.total : null

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, NOTIFY_TO } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error('Melding nieuw account niet verstuurd: SMTP-gegevens ontbreken in de omgeving')
    return NextResponse.json({ error: 'Mail niet geconfigureerd' }, { status: 500 })
  }

  const port = Number(SMTP_PORT) || 465
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    // Poort 465 is een versleutelde verbinding vanaf het begin; 587 start eerst gewoon en schakelt dan over.
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })

  const when = createdAt.toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'long', timeStyle: 'short' })
  try {
    await transporter.sendMail({
      from: MAIL_FROM || `Kijkassistent <${SMTP_USER}>`,
      to: NOTIFY_TO || 'info@kijkassistent.nl',
      subject: `Nieuw account: ${email}`,
      text: [
        'Er is een nieuw account aangemaakt bij Kijkassistent.',
        '',
        `E-mailadres: ${email}`,
        `Tijdstip: ${when}`,
        total !== null ? `Aantal accounts nu: ${total}` : '',
      ]
        .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== ''))
        .join('\n'),
    })
  } catch (err) {
    console.error('Melding nieuw account versturen mislukt:', err)
    return NextResponse.json({ error: 'Versturen mislukt' }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
