import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { classifySeries, type SeriesUpdate, type TmdbTvDetails } from '@/lib/seriesUpdates'

// Zoveel series (de nieuwste eerst) controleren we per aanvraag.
const MAX_SERIES = 40
// Het aantal meldingen dat we teruggeven.
const MAX_RESULTS = 5
// TMDB-antwoorden worden door Next tussen alle gebruikers gedeeld en een paar uur hergebruikt.
const CACHE_SECONDS = 60 * 60 * 6

function amsterdamToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
}

// Series die je "zeker leuk" vond of als favoriet hebt, die binnenkort of net met een nieuw seizoen terugkomen.
export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'series-updates', LIMITS.titleInfo)
  if (!guard.ok) return guard.response
  const { supabase, user } = guard

  try {
    const [loved, favorites] = await Promise.all([
      supabase
        .from('ratings')
        .select('tmdb_id')
        .eq('user_id', user.id)
        .eq('media_type', 'tv')
        .eq('rating', 'love')
        .order('rated_at', { ascending: false })
        .limit(MAX_SERIES),
      supabase.from('favorite_movies').select('tmdb_id').eq('user_id', user.id).eq('media_type', 'tv').limit(MAX_SERIES),
    ])
    const ids = Array.from(new Set([...(loved.data ?? []), ...(favorites.data ?? [])].map((r) => r.tmdb_id as number))).slice(0, MAX_SERIES)
    if (ids.length === 0) return NextResponse.json({ items: [] })

    const today = amsterdamToday()
    const found = await Promise.all(
      ids.map(async (id): Promise<SeriesUpdate | null> => {
        try {
          const res = await fetch(`https://api.themoviedb.org/3/tv/${id}?language=nl-NL&append_to_response=watch/providers`, {
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
            next: { revalidate: CACHE_SECONDS },
          })
          if (!res.ok) return null
          return classifySeries((await res.json()) as TmdbTvDetails, today)
        } catch {
          return null
        }
      })
    )

    // Net begonnen eerst, daarna wat het eerst terugkomt.
    const items = found
      .filter((i): i is SeriesUpdate => i !== null)
      .sort((a, b) => (a.kind === b.kind ? (a.kind === 'started' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) : a.kind === 'started' ? -1 : 1))
      .slice(0, MAX_RESULTS)
    return NextResponse.json({ items })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
