import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

// Limieten staan bewust ruim boven wat een mens doet — ze zijn een vangnet tegen misbruik
// of een lus in de client, geen rem op gewoon gebruik. Alle getallen op één plek.
export const LIMITS = {
  recommendations: { max: 20, windowSeconds: 3600 },
  recommendationsTogether: { max: 60, windowSeconds: 3600 },
  profileStats: { max: 30, windowSeconds: 3600 },
  search: { max: 60, windowSeconds: 60 },
  titleInfo: { max: 90, windowSeconds: 60 },
  // De import van een Letterboxd-export gaat in porties van 25; duizenden films zijn honderd aanroepen.
  importMatch: { max: 400, windowSeconds: 3600 },
  importWarmup: { max: 150, windowSeconds: 3600 },
} as const

type Limit = { max: number; windowSeconds: number }

export type Guarded =
  | { ok: true; supabase: SupabaseClient; user: User }
  | { ok: false; response: NextResponse }

// Vereist een ingelogde gebruiker én telt de aanroep mee voor de ratelimiet van deze
// "bucket". Geeft bij een fout direct het antwoord terug dat de route moet retourneren.
export async function guardRequest(request: NextRequest, bucket: string, limit: Limit): Promise<Guarded> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) {
    return { ok: false, response: NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 }) }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 }) }
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
        { error: 'Je doet dit wat vaak achter elkaar. Probeer het over een paar minuten opnieuw.' },
        { status: 429, headers: { 'Retry-After': String(Math.min(limit.windowSeconds, 300)) } }
      ),
    }
  }

  return { ok: true, supabase, user }
}
