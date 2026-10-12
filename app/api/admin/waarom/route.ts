import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { computeTasteProfile, fetchProfileInputs, SOURCE_IDS } from '@/lib/recommendationEngine'

// "Waarom staat deze titel (niet) in mijn lijst?": rekent de aanbevelingen van de beheerder zelf opnieuw door en houdt
// voor één titel bij welke stappen hij doorkomt en waar hij afvalt. Alleen voor de beheerder (app_admins), en alleen
// over de eigen lijsten: er worden geen gegevens van andere gebruikers gelezen. Schrijft niets weg; de opgeslagen
// lijsten blijven zoals ze zijn.
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'admin-waarom', LIMITS.adminBackfill)
  if (!guard.ok) return guard.response
  const { supabase, user } = guard

  const { data: isAdmin } = await supabase.rpc('is_app_admin')
  if (isAdmin !== true) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const mediaType = request.nextUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10)
  if (!id) return NextResponse.json({ error: 'Ongeldig id' }, { status: 400 })

  try {
    const inputs = await fetchProfileInputs(supabase, user.id, { includeHidden: true })
    const sourceIds = new Set(inputs.streamingServices.map((s) => SOURCE_IDS[s]).filter(Boolean))
    const taste = await computeTasteProfile(supabase, inputs, { availableOnSourceIds: sourceIds, explainKey: `${mediaType}-${id}` })

    // Waar hij in de zojuist berekende lijsten staat (zonder de titels die binnenkort uitkomen).
    const tabs = (['focused', 'balanced', 'explore'] as const).flatMap((mode) => {
      const item = taste.sortedByMode[mode].find((m) => m.media_type === mediaType && m.id === id)
      return item ? [{ mode, matchPercent: item.matchPercent }] : []
    })
    // Verborgen titels zitten niet in de uitsluitlijst van de motor: de route haalt ze er achteraf uit.
    const hidden = (inputs.hidden ?? []).some((h) => h.media_type === mediaType && h.tmdb_id === id)

    return NextResponse.json({ explanation: taste.explanation ?? null, inLists: tabs, hidden })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
