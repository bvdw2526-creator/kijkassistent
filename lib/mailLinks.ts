// Ondertekende links in de wekelijkse tipsmail: daarmee kun je zonder in te loggen een titel beoordelen, op je kijklijst
// zetten of je afmelden. Elke link geldt voor één gebruiker (en één titel) en verloopt; zonder geldige handtekening doet
// app/api/mail-action niets. De inhoud is leesbaar (titel, poster), maar niet te veranderen zonder de sleutel.
import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { MediaType } from './recommendationEngine'

export type MailAction = 'beoordeel' | 'kijklijst' | 'afmelden'

export type MailLinkPayload = {
  u: string // gebruiker
  a: MailAction
  e: number // verloopt (ms sinds 1970)
  // De titel, bij beoordelen en kijklijst.
  t?: { id: number; mt: MediaType; title: string; poster: string | null; year: number | null; watchOn: string | null }
}

// Een tip blijft een maand bruikbaar; de afmeldlink een jaar (oude mails moeten nog werken).
export const TITLE_LINK_DAYS = 30
export const UNSUBSCRIBE_LINK_DAYS = 365

// Eigen sleutel als MAIL_LINK_SECRET bestaat, anders afgeleid van de service role-sleutel (die staat al op de server en
// verlaat hem nooit), zodat er voor de links geen extra instelling nodig is.
function key(): Buffer {
  const secret = process.env.MAIL_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error('Geen sleutel voor maillinks (MAIL_LINK_SECRET of SUPABASE_SERVICE_ROLE_KEY)')
  return createHash('sha256').update(`kijkassistent-maillinks:${secret}`).digest()
}

const sign = (data: string) => createHmac('sha256', key()).update(data).digest('base64url')

export function makeMailToken(payload: Omit<MailLinkPayload, 'e'>, days: number): string {
  const data = Buffer.from(JSON.stringify({ ...payload, e: Date.now() + days * 86_400_000 })).toString('base64url')
  return `${data}.${sign(data)}`
}

// Geeft de inhoud terug als de handtekening klopt en de link niet verlopen is, anders null.
export function readMailToken(token: string | null | undefined): MailLinkPayload | null {
  if (!token) return null
  const [data, signature] = token.split('.')
  if (!data || !signature) return null
  const expected = Buffer.from(sign(data))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as MailLinkPayload
    return payload.e > Date.now() ? payload : null
  } catch {
    return null
  }
}
