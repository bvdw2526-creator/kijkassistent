// De wekelijkse tipsmail: een paar persoonlijke tips uit de laatst berekende lijst van iemand (recommendations_cache,
// "Puur mijn smaak" eerst), alleen wat op de eigen diensten staat en nog niet gezien, op de kijklijst of verborgen is.
// Per tip twee knoppen ("Op mijn kijklijst", "Al gezien?") naar de pagina /mail, via ondertekende links (lib/mailLinks.ts).
// Zijn er te weinig goede tips, dan gaat er die week geen mail: een matige mail kost meer vertrouwen dan hij oplevert.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { makeMailToken, TITLE_LINK_DAYS, UNSUBSCRIBE_LINK_DAYS } from './mailLinks'
import { NEW_RELEASE_LABEL, type MediaType } from './recommendationEngine'

export const MAX_TIPS = 4
export const MIN_TIPS = 3

type CachedItem = {
  id: number
  media_type: MediaType
  title: string
  poster_path: string | null
  release_date?: string
  watchOn?: string
  basedOn?: string[]
  matchPercent?: number
}

export type WeeklyMail = {
  to: string
  subject: string
  html: string
  text: string
  headers: Record<string, string>
  tips: { title: string; media_type: MediaType; id: number }[]
}

export type WeeklyMailResult = { mail: WeeklyMail } | { skipped: string }

// Redenen in basedOn die geen titel zijn (zie ook de uitleg in app/page.tsx).
const NON_TITLE = new Set(['vergelijkbare verhaallijn', 'verrassing', NEW_RELEASE_LABEL])
const isTitleReason = (b: string) => !NON_TITLE.has(b) && !b.startsWith('regisseur ') && !b.startsWith('thema ')

function reasonFor(item: CachedItem): string {
  const liked = (item.basedOn ?? []).filter(isTitleReason)
  if (liked.length > 0) return `Omdat je ${liked.slice(0, 2).join(' en ')} leuk vond`
  if (item.basedOn?.includes(NEW_RELEASE_LABEL)) return 'Nieuw op je diensten'
  return 'Past bij je smaak'
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export async function buildWeeklyMail(db: SupabaseClient, userId: string, origin: string): Promise<WeeklyMailResult> {
  const [{ data: profile }, { data: cache }, { data: auth }, favorites, ratings, watchlist, hidden] = await Promise.all([
    db.from('profiles').select('weekly_mail').eq('id', userId).single(),
    db.from('recommendations_cache').select('focused, balanced').eq('user_id', userId).maybeSingle(),
    db.auth.admin.getUserById(userId),
    db.from('favorite_movies').select('tmdb_id, media_type').eq('user_id', userId),
    db.from('ratings').select('tmdb_id, media_type').eq('user_id', userId),
    db.from('watchlist').select('tmdb_id, media_type').eq('user_id', userId),
    db.from('hidden_titles').select('tmdb_id, media_type').eq('user_id', userId),
  ])
  if (!profile?.weekly_mail) return { skipped: 'tipsmail staat uit' }
  const email = auth?.user?.email
  if (!email) return { skipped: 'geen e-mailadres' }
  if (!cache) return { skipped: 'nog geen berekende lijst' }

  const known = new Set(
    [favorites, ratings, watchlist, hidden].flatMap((r) => (r.data ?? []).map((t) => `${t.media_type}-${t.tmdb_id}`))
  )
  const today = new Date().toISOString().slice(0, 10)
  const seen = new Set<string>()
  const tips: CachedItem[] = []
  for (const item of [...((cache.focused ?? []) as CachedItem[]), ...((cache.balanced ?? []) as CachedItem[])]) {
    const key = `${item.media_type}-${item.id}`
    if (seen.has(key) || known.has(key) || !item.watchOn) continue
    // Alleen wat in je abonnement zit: "huren" of "kopen" (bv. Pathé Thuis) past niet bij "op jouw diensten".
    if (/ · (huren|kopen)/.test(item.watchOn)) continue
    // Titels die nog moeten uitkomen kun je deze week niet kijken.
    if (item.release_date && item.release_date > today) continue
    seen.add(key)
    tips.push(item)
    if (tips.length === MAX_TIPS) break
  }
  if (tips.length < MIN_TIPS) return { skipped: `te weinig tips (${tips.length})` }

  const link = (token: string) => `${origin}/mail?t=${encodeURIComponent(token)}`
  const unsubscribeToken = makeMailToken({ u: userId, a: 'afmelden' }, UNSUBSCRIBE_LINK_DAYS)
  const rendered = tips.map((item) => {
    const year = parseInt((item.release_date ?? '').slice(0, 4), 10)
    const t = {
      id: item.id,
      mt: item.media_type,
      title: item.title,
      poster: item.poster_path,
      year: Number.isFinite(year) ? year : null,
      watchOn: item.watchOn ?? null,
    }
    return {
      item,
      year: t.year,
      reason: reasonFor(item),
      watchlistUrl: link(makeMailToken({ u: userId, a: 'kijklijst', t }, TITLE_LINK_DAYS)),
      rateUrl: link(makeMailToken({ u: userId, a: 'beoordeel', t }, TITLE_LINK_DAYS)),
    }
  })

  const subject = `Je kijktips voor dit weekend: ${tips[0].title} en meer`
  const unsubscribeUrl = link(unsubscribeToken)
  const settingsUrl = `${origin}/settings`

  const C = { bg: '#12161d', card: '#1c222c', line: '#2a313d', orange: '#e9a23b', white: '#ffffff', soft: '#b7bcc6', dim: '#7d8592' }
  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;padding:10px 16px;margin:4px 6px 0 0;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;${
      primary ? `background:${C.orange};color:#1a1208;` : `border:1px solid ${C.line};color:${C.white};`
    }">${label}</a>`

  const tipHtml = rendered
    .map(({ item, year, reason, watchlistUrl, rateUrl }) => {
      const poster = item.poster_path
        ? `<img src="https://image.tmdb.org/t/p/w185${escapeHtml(item.poster_path)}" width="92" alt="" style="display:block;border-radius:10px;width:92px;height:auto;">`
        : `<div style="width:92px;height:138px;border-radius:10px;background:${C.line};"></div>`
      const meta = [item.media_type === 'tv' ? 'Serie' : 'Film', year, item.watchOn].filter(Boolean).join(' · ')
      return `
      <tr><td style="padding:0 0 14px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border-radius:16px;">
          <tr>
            <td width="92" valign="top" style="padding:14px 0 14px 14px;">${poster}</td>
            <td valign="top" style="padding:14px 14px 14px 14px;">
              <div style="font-size:18px;font-weight:700;color:${C.white};line-height:1.25;">${escapeHtml(item.title)}</div>
              <div style="font-size:13px;color:${C.soft};margin-top:4px;">${escapeHtml(meta)}</div>
              <div style="font-size:13px;color:${C.orange};margin-top:6px;">${escapeHtml(reason)}</div>
              <div style="margin-top:8px;">${button(watchlistUrl, 'Op mijn kijklijst', true)}${button(rateUrl, 'Al gezien?', false)}</div>
            </td>
          </tr>
        </table>
      </td></tr>`
    })
    .join('')

  const html = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 18px 4px;">
          <div style="font-size:12px;letter-spacing:3px;text-transform:uppercase;color:${C.orange};font-weight:700;">Kijkassistent</div>
          <div style="font-size:24px;font-weight:700;color:${C.white};margin-top:6px;">Je kijktips voor dit weekend</div>
          <div style="font-size:14px;color:${C.soft};margin-top:6px;line-height:1.5;">Gekozen op jouw smaak, en te zien op jouw streamingdiensten.</div>
        </td></tr>
        ${tipHtml}
        <tr><td align="center" style="padding:6px 0 22px 0;">${button(`${origin}/`, 'Meer tips in Kijkassistent', true)}</td></tr>
        <tr><td style="padding:0 4px;font-size:12px;line-height:1.6;color:${C.dim};">
          Je krijgt deze mail één keer per week omdat je een account hebt bij Kijkassistent.
          <a href="${escapeHtml(unsubscribeUrl)}" style="color:${C.soft};">Afmelden</a> kan met één klik, of zet het uit bij
          <a href="${escapeHtml(settingsUrl)}" style="color:${C.soft};">Instellingen</a>.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`

  const text = [
    'Je kijktips voor dit weekend',
    'Gekozen op jouw smaak, en te zien op jouw streamingdiensten.',
    '',
    ...rendered.flatMap(({ item, year, reason, watchlistUrl, rateUrl }) => [
      `${item.title} (${[item.media_type === 'tv' ? 'serie' : 'film', year, item.watchOn].filter(Boolean).join(', ')})`,
      reason,
      `Op mijn kijklijst: ${watchlistUrl}`,
      `Al gezien? ${rateUrl}`,
      '',
    ]),
    `Meer tips: ${origin}/`,
    '',
    `Afmelden (één klik): ${unsubscribeUrl}`,
  ].join('\n')

  return {
    mail: {
      to: email,
      subject,
      html,
      text,
      // Afmelden vanuit het mailprogramma zelf (Gmail, Apple Mail): één klik, zonder de mail te openen.
      headers: {
        'List-Unsubscribe': `<${origin}/api/mail-action?t=${encodeURIComponent(unsubscribeToken)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tips: tips.map((t) => ({ title: t.title, media_type: t.media_type, id: t.id })),
    },
  }
}
