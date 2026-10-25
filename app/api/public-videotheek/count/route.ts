import { NextRequest, NextResponse } from 'next/server'
import { guardPublicRequest, LIMITS } from '@/lib/apiGuard'
import { cacheWriter } from '@/lib/supabaseAdmin'
import { VIDEOTHEEK_STEPS, type VideotheekStep } from '@/lib/videotheek'

// Telt één stap van de trechter van de openbare videotheek (bezoek, doosje omgedraaid, klik op account maken), per dag
// (zie supabase/migrations/20261025_videotheek_stats.sql). Alleen aantallen, niets over de bezoeker. De browser stuurt
// elke stap hooguit één keer per dag; de ratelimiet is het vangnet tegen opgeblazen tellingen.
export async function POST(request: NextRequest) {
  const guard = await guardPublicRequest(request, 'public-videotheek-count', LIMITS.publicVideotheekCount)
  if (!guard.ok) return guard.response

  let step: unknown
  try {
    step = (await request.json()).step
  } catch {
    return new NextResponse(null, { status: 400 })
  }
  if (!VIDEOTHEEK_STEPS.includes(step as VideotheekStep)) return new NextResponse(null, { status: 400 })

  // Alleen de server mag tellen (de functie is alleen voor de service role), daarom via cacheWriter.
  const { error } = await cacheWriter(guard.supabase).rpc('log_videotheek_step', { p_step: step })
  // Mislukt tellen (bv. de migratie staat er nog niet) mag de bezoeker niet merken: alleen een regel in het log.
  if (error) console.warn('Videotheek tellen mislukt:', error.message)
  return new NextResponse(null, { status: 204 })
}
