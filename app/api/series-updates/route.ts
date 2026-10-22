import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { localeFromRequest, tmdbLanguage } from '@/lib/serverI18n'
import { findSeriesUpdates } from '@/lib/seriesUpdatesServer'

// Het aantal meldingen dat we teruggeven.
const MAX_RESULTS = 5

// Series die je "zeker leuk" vond of als favoriet hebt, die binnenkort of net met een nieuw seizoen terugkomen.
export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'series-updates', LIMITS.titleInfo)
  if (!guard.ok) return guard.response
  // Taal van de app (cookie of browser): titels, samenvattingen en genres van TMDB in die taal.
  const language = tmdbLanguage(localeFromRequest(request))

  try {
    const items = (await findSeriesUpdates(guard.supabase, guard.user.id, language)).slice(0, MAX_RESULTS)
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
