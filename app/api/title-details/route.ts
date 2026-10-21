import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'

const CACHE_SECONDS = 60 * 60 * 24
const MAX_CAST = 4

type Person = { id: number; name: string }

// Lengte van een gewone aflevering: het midden (mediaan) van het laatst uitgezonden seizoen. TMDB's episode_run_time
// is vrijwel altijd leeg, en de laatste aflevering is vaak een lange finale (Friends 48 i.p.v. 24 min, Stranger Things
// 129 i.p.v. 72). Mislukt het, dan geen lengte.
async function typicalEpisodeRuntime(id: number, season: number | undefined): Promise<number | null> {
  if (!season) return null
  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${id}/season/${season}`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) return null
    const data = await res.json()
    const runtimes = ((data.episodes || []) as { runtime: number | null }[])
      .map((e) => e.runtime)
      .filter((r): r is number => !!r)
      .sort((a, b) => a - b)
    return runtimes.length > 0 ? runtimes[Math.floor(runtimes.length / 2)] : null
  } catch {
    return null
  }
}

// Gegevens voor in de popup: speelduur (film) of seizoenen/afleveringen (serie), regisseur of bedenker, en de
// hoofdrollen (app/components/TitleDetails.tsx). Los van /api/title-info, zodat ook de popup op Voor jou (die geen
// title-info ophaalt) dit kan tonen. Namen zijn niet taalgebonden: geen language-parameter, één antwoord voor nl en en.
export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'title-info', LIMITS.titleInfo)
  if (!guard.ok) return guard.response

  const mediaType = request.nextUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10)
  if (!id) return NextResponse.json({ error: 'Ongeldig id' }, { status: 400 })

  try {
    // Series: aggregate_credits (alle seizoenen) in plaats van credits (alleen het laatste seizoen); anders mist
    // Smallville bv. Kristin Kreuk en Michael Rosenbaum en staan er bijrollen uit seizoen 10.
    const creditsKey = mediaType === 'tv' ? 'aggregate_credits' : 'credits'
    const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?append_to_response=${creditsKey}`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) return NextResponse.json({ error: `TMDB gaf status ${res.status}` }, { status: 502 })
    const data = await res.json()

    const person = (p: Person): Person => ({ id: p.id, name: p.name })
    // Bij series eerst wie in de meeste afleveringen speelt, daarna de volgorde van TMDB.
    const cast = ((data[creditsKey]?.cast || []) as (Person & { order?: number; total_episode_count?: number })[])
      .slice()
      .sort((a, b) => (b.total_episode_count ?? 0) - (a.total_episode_count ?? 0) || (a.order ?? 999) - (b.order ?? 999))
      .slice(0, MAX_CAST)
      .map(person)

    if (mediaType === 'movie') {
      const directors = ((data.credits?.crew || []) as (Person & { job: string })[])
        .filter((c) => c.job === 'Director')
        .slice(0, 2)
        .map(person)
      return NextResponse.json({ runtime: data.runtime || null, directors, creators: [], cast })
    }

    const status: string = data.status || ''
    return NextResponse.json({
      seasons: data.number_of_seasons || null,
      episodes: data.number_of_episodes || null,
      episodeRuntime: await typicalEpisodeRuntime(id, data.last_episode_to_air?.season_number),
      // Alleen "afgelopen" of "loopt nog"; bij series die nog moeten beginnen (In Production, Planned) niets.
      status: status === 'Ended' || status === 'Canceled' ? 'ended' : status === 'Returning Series' ? 'running' : null,
      directors: [],
      creators: ((data.created_by || []) as Person[]).slice(0, 2).map(person),
      cast,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
