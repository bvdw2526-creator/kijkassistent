// Nieuwe seizoenen van series die iemand "zeker leuk" vond of als favoriet heeft. Gedeeld door het blok "Nieuw bij
// jouw series" in de app (app/api/series-updates) en de wekelijkse tipsmail (lib/weeklyMail.ts).
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { classifySeries, type SeriesUpdate, type TmdbTvDetails } from './seriesUpdates'

// Zoveel series (de nieuwste eerst) controleren we per keer.
const MAX_SERIES = 40
// TMDB-antwoorden worden door Next tussen alle gebruikers gedeeld en een paar uur hergebruikt.
const CACHE_SECONDS = 60 * 60 * 6

export function amsterdamToday(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
}

// language: TMDB-taal ("nl-NL" of "en-US"). Volgorde: net begonnen eerst (nieuwste bovenaan), daarna wat het eerst
// terugkomt.
export async function findSeriesUpdates(db: SupabaseClient, userId: string, language: string, today = amsterdamToday()): Promise<SeriesUpdate[]> {
  const [loved, favorites] = await Promise.all([
    db
      .from('ratings')
      .select('tmdb_id')
      .eq('user_id', userId)
      .eq('media_type', 'tv')
      .eq('rating', 'love')
      .order('rated_at', { ascending: false })
      .limit(MAX_SERIES),
    db.from('favorite_movies').select('tmdb_id').eq('user_id', userId).eq('media_type', 'tv').limit(MAX_SERIES),
  ])
  const ids = Array.from(new Set([...(loved.data ?? []), ...(favorites.data ?? [])].map((r) => r.tmdb_id as number))).slice(0, MAX_SERIES)
  if (ids.length === 0) return []

  const found = await Promise.all(
    ids.map(async (id): Promise<SeriesUpdate | null> => {
      try {
        const res = await fetch(`https://api.themoviedb.org/3/tv/${id}?language=${language}&append_to_response=watch/providers`, {
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

  return found
    .filter((i): i is SeriesUpdate => i !== null)
    .sort((a, b) => (a.kind === b.kind ? (a.kind === 'started' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)) : a.kind === 'started' ? -1 : 1))
}
