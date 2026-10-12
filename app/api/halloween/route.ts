import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import {
  SOURCE_IDS,
  fetchProfileInputs,
  isOlderThan,
  resolveWatchInfo,
  type ProfileInputs,
  type RecommendationItem,
} from '@/lib/recommendationEngine'
import { HORROR_GENRE, fetchHalloweenCandidates, halloweenTaste, type HalloweenCandidate, type HalloweenFlavour } from '@/lib/halloween'
import { scoreUpcoming } from '@/lib/upcomingTitles'
import { isHalloweenSeason } from '@/lib/skins'
import { withLatinTitles } from '@/lib/titleFallback'

// Bij een koude cache: vingerafdrukken maken voor Halloween-titels die nog nergens zijn aanbevolen.
export const maxDuration = 60

// Zoveel titels per smaak in de rij, waarvan hooguit zoveel series: het gaat om een filmavond.
const MAX_PER_FLAVOUR = 12
const MAX_SERIES_PER_FLAVOUR = 4
// Van zoveel best passende titels per smaak controleren we nog eens of ze echt op de diensten staan.
const AVAILABILITY_POOL = 30
const AVAILABILITY_LIVE_LIMIT = 40

type HalloweenItem = RecommendationItem & { halloween: HalloweenFlavour }

function toItem(c: HalloweenCandidate, fit: number): HalloweenItem {
  return {
    id: c.id,
    title: c.title,
    poster_path: c.poster_path,
    vote_average: c.vote_average,
    overview: c.overview,
    media_type: c.media_type,
    genre_ids: c.genre_ids,
    release_date: c.release_date,
    score: fit,
    // Geen echt matchpercentage (alleen de volgorde binnen de Halloween-titels); de app toont het ook niet.
    matchPercent: Math.round(fit * 100),
    basedOn: [],
    coreScore: 0,
    okScore: 0,
    discoverScore: 0,
    collectionScore: 0,
    embeddingBonus: 0,
    actorScore: 0,
    directorScore: 0,
    halloween: c.flavour,
  }
}

// De Halloween-rij voor wie de Halloween-skin aan heeft (zie lib/halloween.ts): Halloween-titels op je eigen diensten,
// de best passende eerst. Met ?samen=1 de versie voor Samen: op de diensten van jullie beiden, zonder wat een van jullie
// al kent, en gesorteerd op wie van de twee de titel het minst ligt, zodat hij bij jullie allebei past.
export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'halloween', LIMITS.halloween)
  if (!guard.ok) return guard.response
  const { supabase, user } = guard

  const together = request.nextUrl.searchParams.get('samen') === '1'
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey || !isHalloweenSeason()) return NextResponse.json({ scary: [], cozy: [] })

  try {
    const people: ProfileInputs[] = []
    const seenKeys = new Set<string>()
    if (together) {
      const { data: connections } = await supabase
        .from('partner_connections')
        .select('id, requester_id, partner_id')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},partner_id.eq.${user.id}`)
        .limit(1)
      const connection = connections?.[0]
      if (!connection) return NextResponse.json({ connected: false, scary: [], cozy: [] })
      const partnerId = connection.requester_id === user.id ? connection.partner_id : connection.requester_id
      // Verborgen titels tellen bij Samen niet mee, net als in de gewone Samen-lijst.
      const [inputsA, inputsB, coupleRatings, coupleWatchlist] = await Promise.all([
        fetchProfileInputs(supabase, user.id),
        fetchProfileInputs(supabase, partnerId),
        supabase.from('couple_ratings').select('tmdb_id, media_type').eq('connection_id', connection.id),
        supabase.from('couple_watchlist').select('tmdb_id, media_type').eq('connection_id', connection.id),
      ])
      people.push(inputsA, inputsB)
      for (const row of [...(coupleRatings.data || []), ...(coupleWatchlist.data || [])]) seenKeys.add(`${row.media_type}-${row.tmdb_id}`)
    } else {
      people.push(await fetchProfileInputs(supabase, user.id, { includeHidden: true }))
    }

    for (const person of people) {
      for (const x of [...person.favorites, ...person.ratings, ...person.watchlist, ...(person.hidden ?? [])]) {
        seenKeys.add(`${x.media_type}-${x.tmdb_id}`)
      }
    }
    // Bij Samen geldt de strengste keuze van jullie twee, net als in de gewone Samen-lijst.
    const excludedGenreIds = new Set(people.flatMap((p) => [...p.excludedGenreIds]))
    const minYear = Math.max(...people.map((p) => p.minYear ?? 0)) || null
    const providerIds = Array.from(new Set(people.flatMap((p) => p.streamingServices).map((s) => SOURCE_IDS[s]).filter(Boolean)))

    const candidates = (await fetchHalloweenCandidates(apiKey, providerIds)).filter(
      (c) =>
        !isOlderThan(c.release_date, minYear) &&
        // Wie horror uitsluit, krijgt alleen "gezellig eng": griezelige series hebben bij TMDB geen horror-genre.
        !(c.flavour === 'scary' && excludedGenreIds.has(HORROR_GENRE))
    )

    // Na elkaar: de eerste maakt de vingerafdrukken die nog ontbreken, de tweede vindt ze dan al.
    let fits: Map<string, number> | null = null
    for (const person of people) {
      const taste = await halloweenTaste(supabase, person)
      const own = await scoreUpcoming(supabase, candidates, taste, { excludedGenreIds, seenKeys })
      if (!fits) {
        fits = own
        continue
      }
      const joint = new Map<string, number>()
      for (const [key, fit] of fits) {
        const other = own.get(key)
        if (other !== undefined) joint.set(key, Math.min(fit, other))
      }
      fits = joint
    }
    const fitOf = (c: HalloweenCandidate) => fits?.get(`${c.media_type}-${c.id}`)

    const ranked = (flavour: HalloweenFlavour) =>
      candidates
        .filter((c) => c.flavour === flavour && fitOf(c) !== undefined)
        .sort((a, b) => fitOf(b)! - fitOf(a)!)
        .slice(0, AVAILABILITY_POOL)
    const pools = { scary: ranked('scary'), cozy: ranked('cozy') }

    const sourceIds = new Set(providerIds)
    const watchInfo =
      sourceIds.size > 0
        ? await resolveWatchInfo(supabase, [...pools.scary, ...pools.cozy], sourceIds, { maxLive: AVAILABILITY_LIVE_LIMIT })
        : null

    const pick = (pool: HalloweenCandidate[]): HalloweenItem[] => {
      const out: HalloweenItem[] = []
      let series = 0
      for (const c of pool) {
        if (out.length >= MAX_PER_FLAVOUR) break
        const info = watchInfo?.get(`${c.media_type}-${c.id}`)
        if (watchInfo && !info) continue
        if (c.media_type === 'tv' && series >= MAX_SERIES_PER_FLAVOUR) continue
        if (c.media_type === 'tv') series++
        out.push({ ...toItem(c, fitOf(c)!), ...(info ?? {}) })
      }
      return out
    }

    const [scary, cozy] = await Promise.all([withLatinTitles(pick(pools.scary)), withLatinTitles(pick(pools.cozy))])
    return NextResponse.json({ ...(together ? { connected: true } : {}), scary, cozy })
  } catch (err) {
    console.error('Halloween-titels ophalen mislukt:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout bij het ophalen van Halloween-titels' }, { status: 500 })
  }
}
