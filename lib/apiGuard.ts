import { NextRequest, NextResponse } from 'next/server'
import { localeFromRequest, serverTranslator } from './serverI18n'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

// Limieten staan bewust ruim boven wat een mens doet — ze zijn een vangnet tegen misbruik
// of een lus in de client, geen rem op gewoon gebruik. Alle getallen op één plek.
export const LIMITS = {
  recommendations: { max: 20, windowSeconds: 3600 },
  recommendationsTogether: { max: 60, windowSeconds: 3600 },
  profileStats: { max: 30, windowSeconds: 3600 },
  search: { max: 60, windowSeconds: 60 },
  titleInfo: { max: 90, windowSeconds: 60 },
  halloween: { max: 60, windowSeconds: 3600 },
  bookClub: { max: 60, windowSeconds: 3600 },
  // Wordt al opgehaald zodra een popup opent, dus ruimer dan wat iemand echt aantikt.
  moreLikeThis: { max: 300, windowSeconds: 3600 },
  hasSoundtrack: { max: 90, windowSeconds: 60 },
  // De import van een Letterboxd-export gaat in porties van 25; duizenden films zijn honderd aanroepen.
  importMatch: { max: 400, windowSeconds: 3600 },
  importWarmup: { max: 150, windowSeconds: 3600 },
  // Alleen voor de beheerder: het opvullen van de Engelse vingerafdrukken gaat in porties (zie app/api/admin).
  adminBackfill: { max: 200, windowSeconds: 3600 },
  // Openbare tip-pagina (/tip), zonder account, per IP-adres: zoeken tijdens het typen, en het advies zelf.
  publicSearch: { max: 60, windowSeconds: 60 },
  publicTip: { max: 15, windowSeconds: 3600 },
  // Openbare videotheek (/videotheek): een nieuwe lijst bij elke andere dienst of bij wisselen tussen films en series.
  publicVideotheek: { max: 60, windowSeconds: 3600 },
  // "Meer zoals deze" op de openbare videotheek: bij elk doosje dat je omdraait.
  publicVideotheekSimilar: { max: 150, windowSeconds: 3600 },
  // Openbare videotheek: één gangpad op Nieuw binnen of Top 10 zetten (tien gangpaden, films en series).
  publicVideotheekAisle: { max: 200, windowSeconds: 3600 },
} as const

type Limit = { max: number; windowSeconds: number }

export type Guarded =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; response: NextResponse }

// Vereist een ingelogde gebruiker én telt de aanroep mee voor de ratelimiet van deze
// "bucket". Geeft bij een fout direct het antwoord terug dat de route moet retourneren.
export async function guardRequest(request: NextRequest, bucket: string, limit: Limit): Promise<Guarded> {
  const t = serverTranslator(localeFromRequest(request), 'api')
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return { ok: false, response: NextResponse.json({ error: t('notLoggedIn') }, { status: 401 }) }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: t('notLoggedIn') }, { status: 401 }) }
  }

  const { data: allowed, error } = await supabase.rpc('check_rate_limit', {
    p_bucket: bucket,
    p_max_calls: limit.max,
    p_window_seconds: limit.windowSeconds,
  })
  if (error) {
    // Liever geen limiet dan een kapotte app als de teller even niet werkt — wel zichtbaar in de logs.
    console.error('Ratelimit-controle mislukt:', error)
  } else if (allowed === false) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: t('tooOften') },
        { status: 429, headers: { 'Retry-After': String(Math.min(limit.windowSeconds, 300)) } }
      ),
    }
  }

  return { ok: true, supabase, user }
}

export type PublicGuarded = { ok: true; supabase: SupabaseClient } | { ok: false; response: NextResponse }

let rateLimitAdmin: SupabaseClient | null | undefined

// Voor openbare routes zonder account (de tip-pagina): telt per IP-adres in plaats van per gebruiker, via
// check_rate_limit_public (migratie 20261016_public_tip). Het IP-adres wordt gehasht voordat het de database in gaat.
// Die functie mag alleen de server aanroepen (service role), anders kan een bezoeker andermans teller opmaken.
// Ontbreekt de sleutel of de functie, dan gaat de aanroep door (zelfde keuze als hierboven), met een melding in het log.
export async function guardPublicRequest(request: NextRequest, bucket: string, limit: Limit): Promise<PublicGuarded> {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  if (rateLimitAdmin === undefined) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    rateLimitAdmin = key
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : null
    if (!key) console.warn('SUPABASE_SERVICE_ROLE_KEY ontbreekt: openbare routes draaien zonder ratelimiet.')
  }
  if (!rateLimitAdmin) return { ok: true, supabase }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim() || 'onbekend'
  const hashed = await sha256(`kijkassistent-tip:${ip}`)
  const { data: allowed, error } = await rateLimitAdmin.rpc('check_rate_limit_public', {
    p_key: hashed,
    p_bucket: bucket,
    p_max_calls: limit.max,
    p_window_seconds: limit.windowSeconds,
  })
  if (error) {
    console.error('Ratelimit-controle (openbaar) mislukt:', error.message)
  } else if (allowed === false) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: serverTranslator(localeFromRequest(request), 'publicTip')('errTooMany') },
        { status: 429, headers: { 'Retry-After': String(Math.min(limit.windowSeconds, 300)) } }
      ),
    }
  }
  return { ok: true, supabase }
}

async function sha256(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}
