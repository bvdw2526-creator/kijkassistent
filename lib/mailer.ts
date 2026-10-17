// Mail versturen via de eigen mailserver (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS en eventueel MAIL_FROM; op Vercel en
// zo nodig in .env.local). Gedeeld door de melding van nieuwe accounts en de wekelijkse tipsmail.
import 'server-only'
import nodemailer from 'nodemailer'

export function mailTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null
  const port = Number(SMTP_PORT) || 465
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    // Poort 465 is een versleutelde verbinding vanaf het begin; 587 start eerst gewoon en schakelt dan over.
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
}

export function mailFrom(): string {
  return process.env.MAIL_FROM || `Kijkassistent <${process.env.SMTP_USER}>`
}
