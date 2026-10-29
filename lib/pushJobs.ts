// De drie soorten pushmeldingen: de weekendtip, een nieuw seizoen van een serie die je leuk vindt, en partnermeldingen
// (uitgenodigd, uitnodiging geaccepteerd). Versturen gaat via lib/push.ts, dat ook bijhoudt wat al verstuurd is.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPushOnce, wantsPush } from './push'
import { serverTranslator, tmdbLanguage } from './serverI18n'
import { localizeTitles } from './localizeTitles'
import { amsterdamToday, findSeriesUpdates } from './seriesUpdatesServer'
import type { Locale } from './locale'
import type { MediaType } from './recommendationEngine'

// Een seizoen dat zoveel dagen geleden of vandaag begon, is een melding waard (zo mist niemand iets als de taak een
// dag niet draait).
const SERIES_STARTED_DAYS = 2
// Hooguit zoveel seriemeldingen per persoon per dag.
const MAX_SERIES_PER_DAY = 2
// Een partneractie van langer geleden dan dit melden we niet meer.
const PARTNER_RECENT_MS = 15 * 60_000

type CachedItem = { id: number; media_type: MediaType; title: string; poster_path: string | null; release_date?: string; watchOn?: string }

async function localeOf(db: SupabaseClient, userId: string): Promise<Locale> {
  const { data } = await db.from('profiles').select('language').eq('id', userId).maybeSingle()
  return data?.language === 'en' ? 'en' : 'nl'
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** De vrijdag van deze week (Amsterdam), "JJJJ-MM-DD": zo krijgt iedereen hooguit één weekendtip per week. */
export function weekendKey(today = amsterdamToday()): string {
  const day = new Date(`${today}T12:00:00Z`)
  const back = (day.getUTCDay() + 2) % 7 // vrijdag = 0, zaterdag = 1, ..., donderdag = 6
  day.setUTCDate(day.getUTCDate() - back)
  return day.toISOString().slice(0, 10)
}

/** Weekendtip: de beste titel uit je lijst die je nog niet kent en die op je eigen diensten staat. */
export async function sendWeeklyPush(db: SupabaseClient, userId: string): Promise<boolean> {
  if (!(await wantsPush(db, userId, 'weekly'))) return false
  const [{ data: cache }, favorites, ratings, watchlist, hidden] = await Promise.all([
    db.from('recommendations_cache').select('focused, balanced').eq('user_id', userId).maybeSingle(),
    db.from('favorite_movies').select('tmdb_id, media_type').eq('user_id', userId),
    db.from('ratings').select('tmdb_id, media_type').eq('user_id', userId),
    db.from('watchlist').select('tmdb_id, media_type').eq('user_id', userId),
    db.from('hidden_titles').select('tmdb_id, media_type').eq('user_id', userId),
  ])
  if (!cache) return false
  const known = new Set([favorites, ratings, watchlist, hidden].flatMap((r) => (r.data ?? []).map((t) => `${t.media_type}-${t.tmdb_id}`)))
  const today = new Date().toISOString().slice(0, 10)
  const tip = [...((cache.focused ?? []) as CachedItem[]), ...((cache.balanced ?? []) as CachedItem[])].find(
    (item) =>
      !known.has(`${item.media_type}-${item.id}`) &&
      !!item.watchOn &&
      !/ · (huren|kopen)/.test(item.watchOn) &&
      !(item.release_date && item.release_date > today)
  )
  if (!tip) return false

  const locale = await localeOf(db, userId)
  const [localized] = await localizeTitles(db, [tip], locale).catch(() => [tip])
  const t = serverTranslator(locale, 'push')
  const delivered = await sendPushOnce(
    db,
    userId,
    { kind: 'weekly', ref: weekendKey() },
    { title: t('weeklyTitle'), body: t('weeklyBody', { title: localized.title, service: tip.watchOn! }), url: '/' }
  )
  return delivered > 0
}

/** Nieuw seizoen van een serie die je "zeker leuk" vond of als favoriet hebt, op de dag dat het begint. */
export async function sendSeriesPushes(db: SupabaseClient, userId: string): Promise<number> {
  if (!(await wantsPush(db, userId, 'series'))) return 0
  const locale = await localeOf(db, userId)
  const today = amsterdamToday()
  const updates = (await findSeriesUpdates(db, userId, tmdbLanguage(locale), today)).filter(
    (u) => u.kind === 'started' && daysBetween(u.date, today) <= SERIES_STARTED_DAYS
  )
  const t = serverTranslator(locale, 'push')
  let sent = 0
  for (const u of updates) {
    if (sent >= MAX_SERIES_PER_DAY) break
    const delivered = await sendPushOnce(
      db,
      userId,
      { kind: 'series', ref: `${u.id}-s${u.season}` },
      {
        title: t('seriesTitle', { title: u.title }),
        body: u.watchOn ? t('seriesBodyOn', { season: u.season, service: u.watchOn }) : t('seriesBody', { season: u.season }),
        url: '/',
      }
    )
    if (delivered > 0) sent++
  }
  return sent
}

/**
 * Na een partneractie van `actorId` (uitnodigen of accepteren): meld het aan de ander. Wat er gemeld wordt, volgt uit
 * de koppelingen zelf, niet uit wat de app meestuurt; en elke koppeling wordt per soort hooguit één keer gemeld.
 */
export async function sendPartnerPushes(db: SupabaseClient, actorId: string): Promise<number> {
  const { data: connections } = await db
    .from('partner_connections')
    .select('id, requester_id, partner_id, status, created_at, responded_at')
    .or(`requester_id.eq.${actorId},partner_id.eq.${actorId}`)
  if (!connections || connections.length === 0) return 0

  const recent = (iso: string | null) => !!iso && Date.now() - Date.parse(iso) < PARTNER_RECENT_MS
  const { data: actor } = await db.auth.admin.getUserById(actorId)
  const actorName = actor?.user?.email ?? ''

  let sent = 0
  for (const c of connections) {
    let to: string | null = null
    let kind: 'partner-invited' | 'partner-accepted' | null = null
    if (c.status === 'pending' && c.requester_id === actorId && recent(c.created_at)) {
      to = c.partner_id
      kind = 'partner-invited'
    } else if (c.status === 'accepted' && recent(c.responded_at)) {
      to = c.requester_id === actorId ? c.partner_id : c.requester_id
      kind = 'partner-accepted'
    }
    if (!to || !kind) continue
    if (!(await wantsPush(db, to, 'partner'))) continue
    const t = serverTranslator(await localeOf(db, to), 'push')
    const delivered = await sendPushOnce(
      db,
      to,
      { kind, ref: c.id },
      kind === 'partner-invited'
        ? { title: t('partnerInvitedTitle'), body: t('partnerInvitedBody', { name: actorName }), url: '/settings' }
        : { title: t('partnerAcceptedTitle'), body: t('partnerAcceptedBody', { name: actorName }), url: '/' }
    )
    if (delivered > 0) sent++
  }
  return sent
}
