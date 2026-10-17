// De wekelijkse tipsmail naar iedereen die hem aan heeft staan. Wie er de afgelopen WEEK_GAP_DAYS dagen al een kreeg,
// slaat hij over (profiles.weekly_mail_sent_at), dus nog eens draaien stuurt nooit dubbel: wat de vorige keer niet meer
// binnen de tijd paste, gaat de volgende keer mee. Gebruikt door de automatische verzending (app/api/cron/weekly-mail)
// en de knop in /beheer.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildWeeklyMail, MAIL_SITE_URL } from './weeklyMail'
import { mailTransport, mailFrom } from './mailer'

const WEEK_GAP_DAYS = 6
// Even wachten tussen twee mails, zodat de mailserver ze niet als een golf ziet.
const PAUSE_MS = 400

export type SendSummary = { sent: number; skipped: Record<string, number>; failed: number; leftForNextRun: number }

export async function sendWeeklyMails(db: SupabaseClient, budgetMs: number): Promise<SendSummary> {
  const deadline = Date.now() + budgetMs
  const transporter = mailTransport()
  if (!transporter) throw new Error('SMTP-gegevens ontbreken (SMTP_HOST, SMTP_USER, SMTP_PASS)')

  const since = new Date(Date.now() - WEEK_GAP_DAYS * 86_400_000).toISOString()
  const { data: profiles, error } = await db
    .from('profiles')
    .select('id')
    .eq('weekly_mail', true)
    .or(`weekly_mail_sent_at.is.null,weekly_mail_sent_at.lt.${since}`)
  if (error) throw error

  const summary: SendSummary = { sent: 0, skipped: {}, failed: 0, leftForNextRun: 0 }
  const queue = profiles ?? []
  for (let i = 0; i < queue.length; i++) {
    if (Date.now() > deadline) {
      summary.leftForNextRun = queue.length - i
      break
    }
    const userId = queue[i].id as string
    try {
      const result = await buildWeeklyMail(db, userId, MAIL_SITE_URL)
      if ('skipped' in result) {
        summary.skipped[result.skipped] = (summary.skipped[result.skipped] ?? 0) + 1
        continue
      }
      const { to, subject, html, text, headers } = result.mail
      await transporter.sendMail({ from: mailFrom(), to, subject, html, text, headers })
      await db.from('profiles').update({ weekly_mail_sent_at: new Date().toISOString() }).eq('id', userId)
      summary.sent++
      await new Promise((r) => setTimeout(r, PAUSE_MS))
    } catch (err) {
      console.error('Tipsmail versturen mislukt voor', userId, err)
      summary.failed++
    }
  }
  return summary
}
