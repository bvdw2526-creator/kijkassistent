import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import {
  SOURCE_IDS,
  fetchProfileInputs,
  getWatchProvidersBulk,
  isOlderThan,
  resolveWatchInfo,
  type ProfileInputs,
  type RecommendationItem,
  type WatchProviderSource,
} from '@/lib/recommendationEngine'
import {
  HORROR_GENRE,
  fetchHalloweenCandidates,
  fetchHalloweenClassics,
  halloweenTaste,
  type HalloweenCandidate,
  type HalloweenFlavour,
} from '@/lib/halloween'
import { scoreUpcoming, type UpcomingCandidate } from '@/lib/upcomingTitles'
import { isHalloweenDay, isHalloweenSeason } from '@/lib/skins'
import { withLatinTitles } from '@/lib/titleFallback'

// Bij een koude cache: vingerafdrukken maken voor Halloween-titels die nog nergens zijn aanbevolen.
export const maxDuration = 60

// Zoveel titels per smaak in de rij, waarvan hooguit zoveel series: het gaat om een filmavond.
const MAX_PER_FLAVOUR = 12
const MAX_SERIES_PER_FLAVOUR = 4
// Van zoveel best passende titels per smaak controleren we nog eens of ze echt op de diensten staan.
const AVAILABILITY_POOL = 30
const AVAILABILITY_LIVE_LIMIT = 40
// Op Halloween zelf (?dag=1) vult de lijst heel Voor jou: veel meer titels, en geen grens aan het aantal series, want de
// app toont films en series dan apart.
const DAY_MAX_PER_FLAVOUR = 60
const DAY_AVAILABILITY_LIVE_LIMIT = 150
// Op Halloween zelf telt naast smaak ook mee hoe bekend een titel is, half om half: anders staan de titels die iedereen
// bij Halloween verwacht (Scream, It, The Conjuring) ergens achteraan als ze niet precies je smaak zijn.
const DAY_FAME_WEIGHT = 0.5
// Hoeveel een pure horrorfilm erbij krijgt bij "griezelig" (de scores lopen van 0 tot 1).
const PURE_HORROR_BONUS = 0.2

// 'classic': uit de rij Halloween-klassiekers (zie fetchHalloweenClassics), kan ook buiten je diensten staan.
type HalloweenItem = RecommendationItem & { halloween: HalloweenFlavour | 'classic' }

// Waar een klassieker te zien is als hij niet op je eigen diensten staat. Een gewone streamingdienst gaat voor het aanbod
// van een kabelaar (Ziggo TV) of een kanaal binnen een andere dienst ("... Amazon Channel", "Plex Channel"): daar zoekt
// niemand een film.
function whereElse(sources: WatchProviderSource[]): string {
  const subscriptions = sources.filter((s) => s.type === 'sub')
  const subscription = subscriptions.find((s) => !/ziggo|channel/i.test(s.name)) ?? subscriptions[0]
  if (subscription) return `Bij ${subscription.name}`
  return sources.length > 0 ? 'Alleen te huur' : 'Nu nergens te streamen'
}

function toItem(c: UpcomingCandidate, fit: number, kind: HalloweenItem['halloween']): HalloweenItem {
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
    halloween: kind,
  }
}

// De Halloween-rij voor wie de Halloween-skin aan heeft (zie lib/halloween.ts): Halloween-titels op je eigen diensten,
// de best passende eerst. Met ?samen=1 de versie voor Samen: op de diensten van jullie beiden, zonder wat een van jullie
// al kent, en gesorteerd op wie van de twee de titel het minst ligt, zodat hij bij jullie allebei past.
// Met ?dag=1 de lijst voor Halloween zelf (31 oktober): dan is dit het hele aanbod op Voor jou. Uitgesloten genres
// gelden die dag niet, ook horror niet; "Niet ouder dan" en wat je al kent wel. Bekende titels staan dan verder vooraan
// (zie DAY_FAME_WEIGHT), en er komt een rij klassiekers bij.
export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'halloween', LIMITS.halloween)
  if (!guard.ok) return guard.response
  const { supabase, user } = guard

  const together = request.nextUrl.searchParams.get('samen') === '1'
  // Buiten 31 oktober alleen bij het ontwikkelen, om het vooraf te kunnen bekijken.
  const day = request.nextUrl.searchParams.get('dag') === '1' && (isHalloweenDay() || process.env.NODE_ENV === 'development')
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
    const excludedGenreIds = day ? new Set<number>() : new Set(people.flatMap((p) => [...p.excludedGenreIds]))
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
    const keyOf = (c: { media_type: string; id: number }) => `${c.media_type}-${c.id}`
    if (day && fits) {
      // Bekendheid als plek tussen de andere titels van dezelfde smaak en soort (0 = minste stemmen, 1 = meeste), zodat
      // het op dezelfde schaal staat als de smaakscore.
      const taste = fits
      const mixed = new Map<string, number>()
      for (const flavour of ['scary', 'cozy'] as const) {
        for (const type of ['movie', 'tv'] as const) {
          const group = candidates.filter((c) => c.flavour === flavour && c.media_type === type && taste.has(keyOf(c)))
          for (const c of group) {
            const fame = group.length > 1 ? group.filter((other) => other.votes < c.votes).length / (group.length - 1) : 0.5
            mixed.set(keyOf(c), (1 - DAY_FAME_WEIGHT) * taste.get(keyOf(c))! + DAY_FAME_WEIGHT * fame)
          }
        }
      }
      fits = mixed
    }
    // Een film die bij TMDB horror als eerste genre heeft (The Conjuring, It) is enger dan een thriller of drama met een
    // horrorkant (Black Swan, The Purge) en komt daarom verder vooraan bij "griezelig".
    for (const c of candidates) {
      const fit = fits?.get(keyOf(c))
      if (fit !== undefined && c.flavour === 'scary' && c.media_type === 'movie' && c.genre_ids[0] === HORROR_GENRE) {
        fits!.set(keyOf(c), fit + PURE_HORROR_BONUS)
      }
    }
    const fitOf = (c: HalloweenCandidate) => fits?.get(keyOf(c))

    const ranked = (flavour: HalloweenFlavour) =>
      candidates
        .filter((c) => c.flavour === flavour && fitOf(c) !== undefined)
        .sort((a, b) => fitOf(b)! - fitOf(a)!)
        .slice(0, day ? DAY_MAX_PER_FLAVOUR : AVAILABILITY_POOL)
    const pools = { scary: ranked('scary'), cozy: ranked('cozy') }

    const sourceIds = new Set(providerIds)
    const watchInfo =
      sourceIds.size > 0
        ? await resolveWatchInfo(supabase, [...pools.scary, ...pools.cozy], sourceIds, { maxLive: day ? DAY_AVAILABILITY_LIVE_LIMIT : AVAILABILITY_LIVE_LIMIT })
        : null

    const pick = (pool: HalloweenCandidate[]): HalloweenItem[] => {
      const out: HalloweenItem[] = []
      let series = 0
      for (const c of pool) {
        if (!day && out.length >= MAX_PER_FLAVOUR) break
        const info = watchInfo?.get(`${c.media_type}-${c.id}`)
        if (watchInfo && !info) continue
        if (!day && c.media_type === 'tv' && series >= MAX_SERIES_PER_FLAVOUR) continue
        if (c.media_type === 'tv') series++
        out.push({ ...toItem(c, fitOf(c)!, c.flavour), ...(info ?? {}) })
      }
      return out
    }

    // De klassiekers, alleen op Halloween zelf: in hun vaste volgorde, zonder wat je al kent. "Niet ouder dan" geldt hier
    // niet (een klassieker is oud), en ze hoeven niet op je diensten te staan: dan staat erbij waar ze wel te zien zijn.
    let classics: HalloweenItem[] = []
    if (day) {
      const fresh = (await fetchHalloweenClassics(apiKey)).filter((c) => !seenKeys.has(keyOf(c)))
      const allSources = await getWatchProvidersBulk(supabase, fresh.map((c) => ({ mediaType: c.media_type, tmdbId: c.id })))
      const own = sourceIds.size > 0 ? await resolveWatchInfo(supabase, fresh, sourceIds, { cacheOnly: true }) : null
      classics = fresh.map((c) => {
        const sources = allSources.get(keyOf(c)) ?? []
        const where = own?.get(keyOf(c)) ?? { watchOn: whereElse(sources), ...(sources[0] ? { watchUrl: sources[0].web_url } : {}) }
        return { ...toItem(c, 0, 'classic'), ...where }
      })
    }

    const [scary, cozy] = await Promise.all([withLatinTitles(pick(pools.scary)), withLatinTitles(pick(pools.cozy))])
    return NextResponse.json({ ...(together ? { connected: true } : {}), scary, cozy, ...(day ? { classics } : {}) })
  } catch (err) {
    console.error('Halloween-titels ophalen mislukt:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout bij het ophalen van Halloween-titels' }, { status: 500 })
  }
}
