import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { ensureEmbeddingsExist, type MediaType } from '@/lib/recommendationEngine'

// Vult de Engelse verhaal-vingerafdrukken (title_embeddings_en) aan voor titels die al een Nederlandse hebben, in porties.
// Alleen voor de beheerder (app_admins). De Engelse tekst komt uit de kenmerken-cache of live van TMDB; daarna maakt Voyage
// de vingerafdruk. Herhaal de aanroep tot `remaining` 0 is. Zie EMBEDDING_VERSION in lib/recommendationEngine.ts.
export const maxDuration = 60

const DEFAULT_BATCH = 250
const MAX_BATCH = 300

export async function POST(request: NextRequest) {
  const guard = await guardRequest(request, 'admin-backfill', LIMITS.adminBackfill)
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { data: isAdmin } = await supabase.rpc('is_app_admin')
  if (isAdmin !== true) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

  const requested = Number(new URL(request.url).searchParams.get('limit') ?? DEFAULT_BATCH)
  const limit = Math.max(1, Math.min(MAX_BATCH, Number.isFinite(requested) ? requested : DEFAULT_BATCH))

  const { data: todo, error } = await supabase.rpc('titles_missing_english_embedding', { p_limit: limit })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const items = ((todo || []) as { media_type: MediaType; tmdb_id: number }[]).map((t) => ({ ...t, text: '' }))

  const available = items.length > 0 ? await ensureEmbeddingsExist(supabase, items, 'en') : new Set<string>()
  const done = items.filter((i) => available.has(`${i.media_type}-${i.tmdb_id}`)).length

  // Hoeveel er daarna nog ontbreken (bovengrens 10.000, ruim genoeg om te zien of we klaar zijn).
  const { data: left } = await supabase.rpc('titles_missing_english_embedding', { p_limit: 10000 })
  return NextResponse.json({ attempted: items.length, done, withoutEnglishText: items.length - done, remaining: (left || []).length })
}
