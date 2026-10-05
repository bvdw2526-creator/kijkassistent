// Series die je leuk vindt en binnenkort (of net) terugkomen met een nieuw seizoen. Gebruikt in
// app/api/series-updates/route.ts en getoond door app/components/SeriesUpdates.tsx.

export type SeriesUpdateKind = 'upcoming' | 'started'

export interface SeriesUpdate {
  id: number
  title: string
  poster_path: string | null
  kind: SeriesUpdateKind
  season: number
  // Datum waarop het seizoen begint (upcoming) of begon (started), "JJJJ-MM-DD".
  date: string
  watchOn: string | null
  // Verandert per seizoen en soort, zodat een weggeklikte melding bij het volgende seizoen weer verschijnt.
  key: string
}

// Een seizoen dat binnen zoveel dagen begint, of zoveel dagen geleden is begonnen, is nieuws.
export const UPCOMING_WINDOW_DAYS = 60
export const STARTED_WINDOW_DAYS = 14

// Het deel van TMDB's /tv/{id} dat we nodig hebben.
export interface TmdbTvDetails {
  id: number
  name?: string
  poster_path?: string | null
  next_episode_to_air?: { season_number: number; episode_number: number; air_date: string | null } | null
  last_episode_to_air?: { season_number: number; episode_number: number; air_date: string | null } | null
  seasons?: { season_number: number; air_date: string | null }[]
  'watch/providers'?: { results?: { NL?: { flatrate?: { provider_name: string }[] } } }
}

function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000)
}

// today: "JJJJ-MM-DD" (Amsterdamse datum). Geeft null als er niets bijzonders is.
export function classifySeries(details: TmdbTvDetails, today: string): SeriesUpdate | null {
  const base = {
    id: details.id,
    title: details.name || '',
    poster_path: details.poster_path ?? null,
    watchOn:
      (details['watch/providers']?.results?.NL?.flatrate ?? [])
        .map((p) => p.provider_name)
        .slice(0, 2)
        .join(', ') || null,
  }
  const todayNr = dayNumber(today)

  // Net begonnen: het seizoen van de laatst uitgezonden aflevering startte de afgelopen dagen. Bij seizoenen die in
  // één keer verschijnen is die laatste aflevering de finale, dus kijken we naar de startdatum van het seizoen zelf.
  const last = details.last_episode_to_air
  if (last && last.season_number >= 2) {
    const start = details.seasons?.find((s) => s.season_number === last.season_number)?.air_date
    if (start) {
      const ago = todayNr - dayNumber(start)
      if (ago >= 0 && ago <= STARTED_WINDOW_DAYS) {
        return { ...base, kind: 'started', season: last.season_number, date: start, key: `${details.id}-s${last.season_number}-started` }
      }
    }
  }

  // Komt terug: de eerstvolgende aflevering is de eerste van een nieuw seizoen en komt binnenkort.
  const next = details.next_episode_to_air
  if (next && next.season_number >= 2 && next.episode_number === 1 && next.air_date) {
    const ahead = dayNumber(next.air_date) - todayNr
    if (ahead >= 0 && ahead <= UPCOMING_WINDOW_DAYS) {
      return { ...base, kind: 'upcoming', season: next.season_number, date: next.air_date, key: `${details.id}-s${next.season_number}-upcoming` }
    }
  }
  return null
}
