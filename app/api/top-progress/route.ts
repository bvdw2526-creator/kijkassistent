import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { getTopList } from '@/lib/topLists'

// Hoeveel van de Top 100 films en series (alle diensten, zie /top-100) de gebruiker al gezien heeft: beoordeeld of als
// favoriet gemarkeerd. De lijsten komen uit dezelfde dagcache als de openbare pagina's.
export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'top-progress', LIMITS.titleInfo)
  if (!guard.ok) return guard.response
  const { supabase, user } = guard

  try {
    const [films, series, ratings, favorites] = await Promise.all([
      getTopList('movie', null),
      getTopList('tv', null),
      supabase.from('ratings').select('tmdb_id, media_type').eq('user_id', user.id),
      supabase.from('favorite_movies').select('tmdb_id, media_type').eq('user_id', user.id),
    ])
    const seen = new Set([...(ratings.data ?? []), ...(favorites.data ?? [])].map((r) => `${r.media_type}-${r.tmdb_id}`))
    const count = (items: { id: number; media_type: string }[]) => ({
      seen: items.filter((i) => seen.has(`${i.media_type}-${i.id}`)).length,
      total: items.length,
    })
    return NextResponse.json({ films: count(films), series: count(series) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
