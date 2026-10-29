// Pushmeldingen versturen naar de Android-app (Firebase Cloud Messaging) en de iPhone-app (Apple Push Notification
// service). De sleutels staan als geheime instellingen in Vercel, nooit in de code:
//
//   FCM_SERVICE_ACCOUNT  de hele JSON van een Firebase-serviceaccount (Projectinstellingen > Serviceaccounts)
//   APNS_KEY_ID          ID van de pushsleutel (.p8) uit het Apple Developer-account
//   APNS_TEAM_ID         Team-ID van het Apple Developer-account
//   APNS_PRIVATE_KEY     inhoud van het .p8-bestand
//
// Ontbreekt een sleutel, dan slaan we dat platform stil over. Adressen die niet meer bestaan (app verwijderd), halen
// we meteen uit push_tokens.
import 'server-only'
import { createSign, createPrivateKey, sign as cryptoSign } from 'node:crypto'
import http2 from 'node:http2'
import type { SupabaseClient } from '@supabase/supabase-js'

export type PushMessage = {
  title: string
  body: string
  // Pad in de app dat opent als je op de melding tikt, bijv. "/" of "/settings".
  url: string
}

export type PushKind = 'weekly' | 'partner' | 'series'

// Uitkomst per telefoon. 'gone' = het adres bestaat niet meer (app verwijderd); detail = antwoord van Google of Apple.
type Outcome = { status: 'ok' | 'gone' | 'failed'; detail?: string }

const APNS_HOST = 'https://api.push.apple.com'
const BUNDLE_ID = 'nl.kijkassistent.app'

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url')
}

// ---- Firebase (Android) ----

type ServiceAccount = { client_email: string; private_key: string; project_id: string }

let fcmToken: { value: string; expires: number } | null = null

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ServiceAccount
    return parsed.client_email && parsed.private_key && parsed.project_id ? parsed : null
  } catch {
    return null
  }
}

async function fcmAccessToken(account: ServiceAccount): Promise<string> {
  if (fcmToken && fcmToken.expires > Date.now() + 60_000) return fcmToken.value
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  )
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const jwt = `${header}.${claims}.${base64url(signer.sign(account.private_key))}`
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  })
  if (!res.ok) throw new Error(`Google-sleutel geweigerd (${res.status})`)
  const data = (await res.json()) as { access_token: string; expires_in: number }
  fcmToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 }
  return data.access_token
}

// Geeft 'gone' als het adres niet meer bestaat.
async function sendFcm(token: string, message: PushMessage): Promise<Outcome> {
  const account = serviceAccount()
  if (!account) return { status: 'failed', detail: 'FCM_SERVICE_ACCOUNT ontbreekt of is geen geldige JSON' }
  const accessToken = await fcmAccessToken(account)
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: message.title, body: message.body },
        data: { url: message.url },
        android: { priority: 'high', notification: { color: '#E8A33D' } },
      },
    }),
  })
  if (res.ok) return { status: 'ok' }
  const text = (await res.text()).slice(0, 300)
  if ((res.status === 404 || res.status === 400) && /UNREGISTERED|INVALID_ARGUMENT.*token|registration token/i.test(text)) {
    return { status: 'gone', detail: `${res.status} ${text}` }
  }
  console.error('FCM-melding mislukt:', res.status, text)
  return { status: 'failed', detail: `${res.status} ${text}` }
}

// ---- Apple (iPhone) ----

let apnsJwt: { value: string; created: number } | null = null

function apnsConfig() {
  const keyId = process.env.APNS_KEY_ID
  const teamId = process.env.APNS_TEAM_ID
  const privateKey = process.env.APNS_PRIVATE_KEY
  return keyId && teamId && privateKey ? { keyId, teamId, privateKey: privateKey.replace(/\\n/g, '\n') } : null
}

// Apple wil een nieuwe sleutel hooguit eens per 20 minuten en accepteert hem een uur.
function apnsToken(config: NonNullable<ReturnType<typeof apnsConfig>>): string {
  if (apnsJwt && Date.now() - apnsJwt.created < 40 * 60_000) return apnsJwt.value
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId }))
  const claims = base64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(Date.now() / 1000) }))
  const signature = cryptoSign('sha256', Buffer.from(`${header}.${claims}`), {
    key: createPrivateKey(config.privateKey),
    dsaEncoding: 'ieee-p1363',
  })
  apnsJwt = { value: `${header}.${claims}.${base64url(signature)}`, created: Date.now() }
  return apnsJwt.value
}

function sendApnsOne(session: http2.ClientHttp2Session, jwt: string, token: string, message: PushMessage) {
  return new Promise<Outcome>((resolve) => {
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    })
    let status = 0
    let body = ''
    req.setEncoding('utf8')
    req.on('response', (headers) => {
      status = Number(headers[':status'])
    })
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      if (status === 200) return resolve({ status: 'ok' })
      const detail = `${status} ${body.slice(0, 300)}`
      if (status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(body)) return resolve({ status: 'gone', detail })
      console.error('APNs-melding mislukt:', detail)
      resolve({ status: 'failed', detail })
    })
    req.on('error', (err) => {
      console.error('APNs-verbinding mislukt:', err)
      resolve({ status: 'failed', detail: err instanceof Error ? err.message : 'verbinding mislukt' })
    })
    req.end(JSON.stringify({ aps: { alert: { title: message.title, body: message.body }, sound: 'default' }, url: message.url }))
  })
}

async function sendApns(tokens: string[], message: PushMessage): Promise<Map<string, Outcome>> {
  const results = new Map<string, Outcome>()
  if (tokens.length === 0) return results
  const config = apnsConfig()
  if (!config) {
    for (const t of tokens) results.set(t, { status: 'failed', detail: 'APNS_KEY_ID, APNS_TEAM_ID of APNS_PRIVATE_KEY ontbreekt' })
    return results
  }
  const jwt = apnsToken(config)
  const session = http2.connect(APNS_HOST)
  session.on('error', (err) => console.error('APNs-sessie mislukt:', err))
  try {
    for (const token of tokens) results.set(token, await sendApnsOne(session, jwt, token, message))
  } finally {
    session.close()
  }
  return results
}

// ---- Voor de rest van de site ----

/** Zijn er sleutels voor minstens één platform? */
export function pushConfigured(): boolean {
  return !!serviceAccount() || !!apnsConfig()
}

/** Wil deze gebruiker dit soort melding? Geen rij in push_settings = alles aan. */
export async function wantsPush(db: SupabaseClient, userId: string, kind: PushKind): Promise<boolean> {
  const { data } = await db.from('push_settings').select('weekly, partner, series').eq('user_id', userId).maybeSingle()
  return data ? data[kind] !== false : true
}

type DeviceResult = { platform: string; status: Outcome['status']; detail?: string }

// Stuurt naar de gegeven telefoons en geeft per telefoon de uitkomst.
async function deliver(tokens: { token: string; platform: string }[], message: PushMessage): Promise<(DeviceResult & { token: string })[]> {
  const results: (DeviceResult & { token: string })[] = []
  for (const t of tokens.filter((t) => t.platform === 'android')) {
    try {
      results.push({ token: t.token, platform: 'android', ...(await sendFcm(t.token, message)) })
    } catch (err) {
      console.error('FCM-melding mislukt:', err)
      results.push({ token: t.token, platform: 'android', status: 'failed', detail: err instanceof Error ? err.message : 'onbekende fout' })
    }
  }
  const iosTokens = tokens.filter((t) => t.platform === 'ios').map((t) => t.token)
  const ios = await sendApns(iosTokens, message).catch((err) => {
    console.error('APNs-meldingen mislukt:', err)
    const detail = err instanceof Error ? err.message : 'onbekende fout'
    return new Map<string, Outcome>(iosTokens.map((t) => [t, { status: 'failed', detail }]))
  })
  for (const [token, outcome] of ios) results.push({ token, platform: 'ios', ...outcome })
  return results
}

/**
 * Stuurt een melding naar alle telefoons van een gebruiker, hooguit één keer per (kind, ref): staat die combinatie al
 * in push_sent, dan gebeurt er niets. Geeft het aantal telefoons dat de melding kreeg.
 */
export async function sendPushOnce(
  db: SupabaseClient,
  userId: string,
  sent: { kind: string; ref: string },
  message: PushMessage
): Promise<number> {
  const { data: tokens } = await db.from('push_tokens').select('token, platform').eq('user_id', userId)
  if (!tokens || tokens.length === 0) return 0

  // Eerst vastleggen: lukt dat niet omdat de rij er al is, dan is deze melding al eerder verstuurd.
  const { error: claimError } = await db.from('push_sent').insert({ user_id: userId, kind: sent.kind, ref: sent.ref })
  if (claimError) return 0

  const results = await deliver(tokens, message)
  const delivered = results.filter((r) => r.status === 'ok').length
  const gone = results.filter((r) => r.status === 'gone').map((r) => r.token)
  if (gone.length > 0) await db.from('push_tokens').delete().in('token', gone)
  // Kwam hij nergens aan, haal de vastlegging dan weg zodat een volgende ronde het opnieuw probeert.
  if (delivered === 0) await db.from('push_sent').delete().eq('user_id', userId).eq('kind', sent.kind).eq('ref', sent.ref)
  return delivered
}

/** Beheer: een testmelding naar alle telefoons van deze gebruiker, met per telefoon het antwoord. Ruimt niets op. */
export async function sendTestPush(db: SupabaseClient, userId: string, message: PushMessage): Promise<DeviceResult[]> {
  const { data: tokens } = await db.from('push_tokens').select('token, platform').eq('user_id', userId)
  if (!tokens || tokens.length === 0) return []
  return (await deliver(tokens, message)).map(({ platform, status, detail }) => ({ platform, status, detail }))
}
