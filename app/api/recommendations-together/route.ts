import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import {
  SOURCE_IDS,
  fetchProfileInputs,
  buildProfileSignature,
  computeTasteProfile,
  discoverByGenres,
  resolveWatchInfo,
  getCachedDetails,
  getEmbeddingsForItems,
  cosineSimilarity,
  type RankedCandidate,
  type RecommendationItem,
  type GenreAffinity,
  type TmdbItem,
  type MediaType,
} from '@/lib/recommendationEngine'

// Standaard-timeout van Vercel's serverless functions (10s op Hobby) is te kort: deze
// route berekent het volledige smaakprofiel van twee mensen na elkaar/parallel (zie
// Promise.all hieronder), dus zwaarder dan de gewone /api/recommendations-route. 60s is
// het maximum dat zowel op Hobby als Pro werkt.
export const maxDuration = 60

// Zelfde weging als bij persoonlijke ratings ("love" telt dubbel zo zwaar als
// favoriet, "ok" half) — zie computeTasteProfile in lib/recommendationEngine.ts.
const COUPLE_LOVE_WEIGHT = 2
const COUPLE_OK_WEIGHT = 0.5
// Punten matchpercentage per eenheid genre-overlap-gewicht met wat het koppel al
// samen goed beoordeelde — bewust bescheiden, dit is een bijsturing, geen nieuwe
// hoofdscore.
const COUPLE_GENRE_BOOST_PER_WEIGHT = 5

// Hoeveel titels de genre-fallback (tier 2, zie hieronder) maximaal teruggeeft per
// media-type — puur om de payload en het aantal kijkprovider-checks te begrenzen.
const FALLBACK_LIMIT_PER_TYPE = 20

// Hoeveel titels er uiteindelijk getoond worden in Samen, per media-type (films/series
// apart) — de beste matches eerst, de rest wordt afgekapt.
const SAMEN_MAX_PER_TYPE = 15

// Zelfde aanpak als recommendations_cache (zie app/api/recommendations/route.ts): het
// complete resultaat (incl. kijkproviders) wordt hergebruikt zolang geen van beide
// profielen of de koppel-beoordelingen zijn gewijzigd. Zonder deze cache rekent deze
// route bij élke aanvraag het volledige smaakprofiel van beide partners opnieuw uit —
// dat is de belangrijkste oorzaak van een trage/timeoutende Samen-tab.
const COUPLE_RECOMMENDATIONS_RESULT_CACHE_MAX_AGE_HOURS = 6

// Hoe zwaar de verhaal-overeenkomst (Voyage) meeweegt in het uiteindelijke matchpercentage.
// Bij "intersection" staat al een sterke score (beiden hadden de titel al in hun eigen
// lijst) en is dit een bijsturing; bij "fallback" is de oude ordening alleen TMDB's gemiddelde
// cijfer, dus daar mag de overeenkomst met jullie smaak veel zwaarder wegen.
const JOINT_FIT_WEIGHT_INTERSECTION = 0.3
const JOINT_FIT_WEIGHT_FALLBACK = 0.75
// Minimaal aantal titels per type (films/series) waar Samen naartoe aanvult met de bredere
// zoektocht als de doorsnede te klein is.
const MIN_ITEMS_PER_TYPE = 8
// Verhaal-overeenkomsten liggen bij deze embeddings dicht bij elkaar (op echte data: mediaan
// ~0,55, top ~0,72), dus de drempel van de gewone engine (0,5) zou bijna alles labelen. Dit
// is ongeveer de bovenste 10% van de kandidaten.
const STORY_MATCH_THRESHOLD = 0.62
const STORY_MATCH_LABEL = 'verhaal dat bij jullie allebei past'

// Meet per titel hoe goed het verhaal past bij elk van beide partners (cosinus-overeenkomst met
// ieders smaakvector) en neemt de LAAGSTE van de twee: alleen een titel die bij allebei past
// scoort hoog. Bewust niet de twee vectoren middelen: bij twee verschillende smaken landt het
// gemiddelde in het midden, bij titels die geen van beiden echt aanspreken.
async function applyJointFit(
  supabase: SupabaseClient,
  items: RankedCandidate[],
  vectorA: number[],
  vectorB: number[],
  fallbackKeys: Set<string>
): Promise<RankedCandidate[]> {
  if (items.length === 0 || vectorA.length === 0 || vectorB.length === 0) return items

  const embeddings = await getEmbeddingsForItems(
    supabase,
    items
      .filter((i) => i.overview)
      .map((i) => ({ media_type: i.media_type, tmdb_id: i.id, text: `${i.title}. ${i.overview}` }))
  )

  const fits = items.map((item) => {
    const vec = embeddings.get(`${item.media_type}-${item.id}`)
    if (!vec || vec.length === 0) return null
    return { a: cosineSimilarity(vectorA, vec), b: cosineSimilarity(vectorB, vec) }
  })
  const jointValues = fits.map((f) => (f ? Math.min(f.a, f.b) : null))
  // Schaal binnen deze lijst: het laagste tiende deel (uitschieters) telt als 0%, de beste als
  // 100%. Zonder schaling liggen alle scores op 75-100% en maakt de weging geen verschil.
  const sorted = jointValues.filter((v): v is number => v !== null).sort((x, y) => x - y)
  if (sorted.length < 2) return items
  const low = sorted[Math.floor(sorted.length * 0.1)]
  const high = sorted[sorted.length - 1]
  if (high - low < 0.01) return items

  return items
    .map((item, i) => {
      const fit = fits[i]
      const joint = jointValues[i]
      if (!fit || joint === null) return item
      const weight = fallbackKeys.has(`${item.media_type}-${item.id}`) ? JOINT_FIT_WEIGHT_FALLBACK : JOINT_FIT_WEIGHT_INTERSECTION
      const jointPercent = Math.round(Math.min(1, Math.max(0, (joint - low) / (high - low))) * 100)
      const matchPercent = Math.round((1 - weight) * item.matchPercent + weight * jointPercent)
      const bothMatch = fit.a > STORY_MATCH_THRESHOLD && fit.b > STORY_MATCH_THRESHOLD
      return {
        ...item,
        matchPercent,
        basedOn: bothMatch && !item.basedOn.includes(STORY_MATCH_LABEL) ? [...item.basedOn, STORY_MATCH_LABEL].slice(0, 4) : item.basedOn,
      }
    })
    .sort((x, y) => y.matchPercent - x.matchPercent)
}

function keyByTitle(items: RankedCandidate[]): Map<string, RankedCandidate> {
  return new Map(items.map((item) => [`${item.media_type}-${item.id}`, item]))
}

function mergeGenreAffinities(a: GenreAffinity[], b: GenreAffinity[]): GenreAffinity[] {
  const map = new Map<number, GenreAffinity>()
  for (const g of [...a, ...b]) {
    const existing = map.get(g.id)
    if (existing) existing.count += g.count
    else map.set(g.id, { ...g })
  }
  return Array.from(map.values()).sort((x, y) => y.count - x.count)
}

async function cacheCoupleRecommendationsResult(
  supabase: SupabaseClient,
  connectionId: string,
  signature: string,
  tier: 'intersection' | 'fallback' | 'empty',
  items: RecommendationItem[]
): Promise<void> {
  await supabase.from('couple_recommendations_cache').upsert(
    { connection_id: connectionId, signature, tier, items, fetched_at: new Date().toISOString() },
    { onConflict: 'connection_id' }
  )
}

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'recommendations-together', LIMITS.recommendationsTogether)
  if (!guard.ok) return guard.response
  const { supabase, user } = guard

  // De hele body staat in een try/catch: een onafgevangen fout waar dan ook hierin
  // (bv. Supabase- of TMDB-calls in lib/recommendationEngine.ts) leverde eerder een
  // kale HTML-foutpagina van Next.js op — de client kreeg dan "Unexpected token '<'"
  // te zien bij het parsen als JSON, zonder enige aanwijzing wat er echt misging.
  try {
    const { data: connections, error: connectionsError } = await supabase
      .from('partner_connections')
      .select('id, requester_id, partner_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},partner_id.eq.${user.id}`)
      .limit(1)

    if (connectionsError) {
      console.error('Koppeling ophalen mislukt:', connectionsError)
      return NextResponse.json(
        { error: `Koppeling ophalen mislukt: ${connectionsError.message}` },
        { status: 500 }
      )
    }

    if (!connections || connections.length === 0) {
      return NextResponse.json({ connected: false, tier: 'none', items: [] })
    }

    const connection = connections[0]
    const partnerId = connection.requester_id === user.id ? connection.partner_id : connection.requester_id

    // Zelfde RLS-client, maar dankzij de "accepted partner"-leesbeleid (zie de
    // partner_connections-migratie) mag deze ook de smaakgegevens van de partner ophalen.
    const [inputsA, inputsB, coupleRatingsResult] = await Promise.all([
      fetchProfileInputs(supabase, user.id),
      fetchProfileInputs(supabase, partnerId),
      supabase
        .from('couple_ratings')
        .select('tmdb_id, media_type, rating')
        .eq('connection_id', connection.id),
    ])

    const coupleRatings = coupleRatingsResult.data || []

    // "signature" vangt de staat van beide profielen + de koppel-beoordelingen. Wijzigt
    // daar niets aan sinds de vorige berekening, dan kan de complete, dure pijplijn
    // hieronder (twee keer computeTasteProfile, discover-fallback, kijkproviders)
    // overgeslagen worden.
    const signature = [
      'v4-topup-providers',
      buildProfileSignature(inputsA),
      buildProfileSignature(inputsB),
      'cpl:' + coupleRatings.map((r) => `${r.media_type}-${r.tmdb_id}-${r.rating}`).sort().join(','),
    ].join('||')

    const { data: cachedResult } = await supabase
      .from('couple_recommendations_cache')
      .select('signature, tier, items, fetched_at')
      .eq('connection_id', connection.id)
      .single()

    if (cachedResult && cachedResult.signature === signature) {
      const ageHours = (Date.now() - new Date(cachedResult.fetched_at).getTime()) / (1000 * 60 * 60)
      if (ageHours < COUPLE_RECOMMENDATIONS_RESULT_CACHE_MAX_AGE_HOURS) {
        return NextResponse.json({
          connected: true,
          connectionId: connection.id,
          tier: cachedResult.tier,
          items: cachedResult.items,
          debug: { cached: true, coupleRatingsCount: coupleRatings.length },
        })
      }
    }

    const [tasteA, tasteB] = await Promise.all([
      computeTasteProfile(supabase, inputsA),
      computeTasteProfile(supabase, inputsB),
    ])

    // Eenmaal samen beoordeeld (positief of negatief) komt een titel niet nog eens
    // terug in Samen — net als bij persoonlijke ratings.
    const coupleRatedKeys = new Set(coupleRatings.map((r) => `${r.media_type}-${r.tmdb_id}`))

    // Genresmaak van het koppel: wat jullie samen als "zeker leuk"/"was oké" hebben
    // beoordeeld, telt mee als extra signaal voor toekomstige Samen-aanbevelingen —
    // los van ieders individuele profiel. "Niet voor mij" wordt hier bewust
    // overgeslagen: dat mag alleen uitsluiten, niet negatief meewegen in de genresmaak.
    const coupleLovedOrOk = coupleRatings.filter((r) => r.rating === 'love' || r.rating === 'ok')
    const coupleGenreDetails = await Promise.all(
      coupleLovedOrOk.map((r) => getCachedDetails(supabase, r.media_type as MediaType, r.tmdb_id))
    )
    const coupleGenreWeight = new Map<number, number>()
    coupleLovedOrOk.forEach((r, i) => {
      const weight = r.rating === 'love' ? COUPLE_LOVE_WEIGHT : COUPLE_OK_WEIGHT
      for (const genre of coupleGenreDetails[i].genres) {
        coupleGenreWeight.set(genre.id, (coupleGenreWeight.get(genre.id) || 0) + weight)
      }
    })

    // De volledige kandidatenpool (allCandidates), niet de smalle sortedByMode-
    // weergavelijstjes: die tonen per tabblad maar 3-8 titels per genre, waardoor een
    // echte overlap er bij een klein profiel (weinig favorieten) toevallig net buiten
    // kan vallen terwijl de onderliggende smaak wel degelijk overeenkomt.
    const mapA = keyByTitle(tasteA.allCandidates)
    const mapB = keyByTitle(tasteB.allCandidates)

    const intersectionKeys = Array.from(mapA.keys()).filter((key) => mapB.has(key) && !coupleRatedKeys.has(key))

    // Uitsluitingen voor de bredere zoektocht (fallback en aanvulling): alles wat een van
    // jullie al kent, op de watchlist heeft staan of samen al beoordeeld heeft.
    const excludeIds = new Set([
      ...inputsA.favorites.map((f) => `${f.media_type}-${f.tmdb_id}`),
      ...inputsA.ratings.map((r) => `${r.media_type}-${r.tmdb_id}`),
      ...inputsA.watchlist.map((w) => `${w.media_type}-${w.tmdb_id}`),
      ...inputsB.favorites.map((f) => `${f.media_type}-${f.tmdb_id}`),
      ...inputsB.ratings.map((r) => `${r.media_type}-${r.tmdb_id}`),
      ...inputsB.watchlist.map((w) => `${w.media_type}-${w.tmdb_id}`),
      ...coupleRatedKeys,
    ])

    // Unie van beide uitsluitlijsten: als één van jullie beiden een genre uitsluit,
    // mag dat genre ook niet via de ander alsnog in de gedeelde Samen-lijst sluipen —
    // bij de doorsnede kan dat toch al niet (elke titel moest al door ieders eigen, al
    // gefilterde lijst komen), maar de bredere zoektocht start helemaal opnieuw op genre.
    const combinedExcludedGenreIds = new Set([...inputsA.excludedGenreIds, ...inputsB.excludedGenreIds])

    const mergedMovieGenres = mergeGenreAffinities(tasteA.movieGenres, tasteB.movieGenres)
    const mergedTvGenres = mergeGenreAffinities(tasteA.tvGenres, tasteB.tvGenres)

    const buildFallbackItems = (discover: { results: TmdbItem[]; label: string }, skipKeys: Set<string>): RankedCandidate[] => {
      const filtered = discover.results
        .filter((item) => !excludeIds.has(`${item.media_type}-${item.id}`) && !skipKeys.has(`${item.media_type}-${item.id}`))
        .filter((item) => !item.genre_ids.some((g) => combinedExcludedGenreIds.has(g)))
        .slice(0, FALLBACK_LIMIT_PER_TYPE)
      const maxVote = Math.max(1, ...filtered.map((item) => item.vote_average))
      return filtered.map((item) => ({
        ...item,
        score: item.vote_average,
        matchPercent: Math.round((item.vote_average / maxVote) * 100),
        basedOn: discover.label ? [`jullie gedeelde ${discover.label.replace('jouw voorkeur voor ', 'voorkeur voor ')}`] : [],
        coreScore: 0,
        okScore: 0,
        discoverScore: 0,
        collectionScore: 0,
        embeddingBonus: 0,
        actorScore: 0,
        directorScore: 0,
      }))
    }

    // Bredere zoektocht op de gecombineerde genre-affiniteit van jullie beiden — met minder
    // zekerheid dan een echte doorsnede-match.
    // TMDB filtert hier zelf op de streamingdiensten van jullie beiden: achteraf filteren liet
    // van een brede zoektocht meestal maar een kwart over. Drie pagina's i.p.v. twee, omdat
    // er daarna nog titels afvallen die jullie al kennen of in uitgesloten genres vallen.
    const discoverProviderIds = Array.from(
      new Set([...inputsA.streamingServices, ...inputsB.streamingServices].map((s) => SOURCE_IDS[s]).filter(Boolean))
    )
    const fetchFallbackItems = async (types: MediaType[], skipKeys: Set<string>): Promise<RankedCandidate[]> => {
      const perType = await Promise.all(
        types.map(async (type) =>
          buildFallbackItems(
            await discoverByGenres(supabase, type, type === 'movie' ? mergedMovieGenres : mergedTvGenres, {
              providerIds: discoverProviderIds,
              pages: [1, 2, 3],
            }),
            skipKeys
          )
        )
      )
      return perType.flat()
    }

    const titleKey = (i: { media_type: string; id: number }) => `${i.media_type}-${i.id}`
    // Titels die uit de bredere zoektocht komen (fallback of aanvulling), niet uit de doorsnede.
    const fallbackKeys = new Set<string>()

    let items: RankedCandidate[]
    let tier: 'intersection' | 'fallback' | 'empty'

    if (intersectionKeys.length > 0) {
      tier = 'intersection'
      // Het laagste van de twee matchpercentages bepaalt de "Samen"-score — de zwakste
      // schakel telt, zodat een titel die slechts één van jullie beiden goed matcht niet
      // alsnog hoog eindigt.
      items = intersectionKeys
        .map((key) => {
          const a = mapA.get(key)!
          const b = mapB.get(key)!
          return {
            ...a,
            matchPercent: Math.min(a.matchPercent, b.matchPercent),
            basedOn: Array.from(new Set([...a.basedOn, ...b.basedOn])).slice(0, 4),
          }
        })
        .sort((x, y) => y.matchPercent - x.matchPercent)

      // Is de doorsnede voor een type (films/series) klein — bv. omdat een van jullie veel
      // genres uitsluit of al veel heeft beoordeeld — vul dan aan uit de bredere zoektocht.
      const shortTypes = (['movie', 'tv'] as const).filter(
        (type) => items.filter((i) => i.media_type === type).length < MIN_ITEMS_PER_TYPE
      )
      if (shortTypes.length > 0) {
        const extra = await fetchFallbackItems(shortTypes, new Set(items.map(titleKey)))
        extra.forEach((e) => fallbackKeys.add(titleKey(e)))
        items = [...items, ...extra]
      }
    } else {
      // Geen enkele titel komt bij allebei voor: val terug op de bredere zoektocht, zodat er
      // toch iets te zien is.
      tier = mergedMovieGenres.length === 0 && mergedTvGenres.length === 0 ? 'empty' : 'fallback'
      items = await fetchFallbackItems(['movie', 'tv'], new Set())
      items.forEach((e) => fallbackKeys.add(titleKey(e)))
    }

    // Verhaal-overeenkomst met beide smaakprofielen (Voyage-embeddings), zie applyJointFit.
    items = await applyJointFit(supabase, items, tasteA.userVector, tasteB.userVector, fallbackKeys)

    // Bijsturing op basis van wat het koppel al samen goed beoordeelde: titels die qua
    // genre aansluiten bij eerdere "zeker leuk"/"was oké"-beoordelingen samen krijgen
    // een bescheiden boost, ongeacht of ze uit de doorsnede of de fallback komen.
    if (coupleGenreWeight.size > 0) {
      items = items
        .map((item) => {
          const overlapWeight = item.genre_ids.reduce((sum, g) => sum + (coupleGenreWeight.get(g) || 0), 0)
          if (overlapWeight === 0) return item
          const label = 'wat jullie samen al waardeerden'
          return {
            ...item,
            matchPercent: Math.min(100, Math.round(item.matchPercent + overlapWeight * COUPLE_GENRE_BOOST_PER_WEIGHT)),
            basedOn: item.basedOn.includes(label) ? item.basedOn : [...item.basedOn, label].slice(0, 4),
          }
        })
        .sort((a, b) => b.matchPercent - a.matchPercent)
    }

    // Aanvullende titels mogen nooit boven een echte doorsnede-match uitkomen: de weergave
    // sorteert op matchpercentage, en de doorsnede is de zekerste groep.
    if (tier === 'intersection' && fallbackKeys.size > 0) {
      const coreFloor = Math.min(...items.filter((i) => !fallbackKeys.has(titleKey(i))).map((i) => i.matchPercent))
      items = items.map((i) =>
        fallbackKeys.has(titleKey(i)) ? { ...i, matchPercent: Math.max(1, Math.min(i.matchPercent, coreFloor - 1)) } : i
      )
    }

    // Beperk tot de beste SAMEN_MAX_PER_TYPE per type — anders kan vooral tier
    // "intersection" (die niet, zoals de gewone modi, al door een round-robin/long-tail-
    // limiet gaat) onbeperkt groeien. Per type i.p.v. één gecombineerde cap, zodat een
    // sterke overlap in films niet ten koste gaat van het aantal series (of andersom).
    // De doorsnede krijgt de cap; de aanvulling houden we ruim vast, want de streamingfilter
    // hieronder kan er nog veel van weghalen (daarna ingekort tot wat nodig is).
    const capForType = (type: MediaType): RankedCandidate[] => {
      const ofType = items.filter((i) => i.media_type === type).sort((a, b) => b.matchPercent - a.matchPercent)
      if (tier !== 'intersection') return ofType.slice(0, SAMEN_MAX_PER_TYPE)
      return [
        ...ofType.filter((i) => !fallbackKeys.has(titleKey(i))).slice(0, SAMEN_MAX_PER_TYPE),
        ...ofType.filter((i) => fallbackKeys.has(titleKey(i))).slice(0, FALLBACK_LIMIT_PER_TYPE),
      ]
    }
    items = [...capForType('movie'), ...capForType('tv')]

    const combinedSourceIds = new Set(
      [...inputsA.streamingServices, ...inputsB.streamingServices]
        .map((s) => SOURCE_IDS[s])
        .filter(Boolean)
    )

    let resultItems: RecommendationItem[]
    if (combinedSourceIds.size === 0 || items.length === 0) {
      resultItems = items
    } else {
      const watchInfoMap = await resolveWatchInfo(supabase, items, combinedSourceIds)
      resultItems = items
        .map((item): RecommendationItem | null => {
          const info = watchInfoMap.get(`${item.media_type}-${item.id}`)
          if (!info) return null
          return { ...item, ...info }
        })
        .filter((m): m is RecommendationItem => m !== null)
    }

    // Na de streamingfilter houden we per type zoveel aanvulling over als nodig is om op
    // MIN_ITEMS_PER_TYPE uit te komen; de echte doorsnede blijft altijd volledig staan.
    if (tier === 'intersection' && fallbackKeys.size > 0) {
      resultItems = (['movie', 'tv'] as const).flatMap((type) => {
        const ofType = resultItems.filter((i) => i.media_type === type)
        const core = ofType.filter((i) => !fallbackKeys.has(titleKey(i)))
        const extra = ofType.filter((i) => fallbackKeys.has(titleKey(i))).slice(0, Math.max(0, MIN_ITEMS_PER_TYPE - core.length))
        return [...core, ...extra]
      })
    }

    await cacheCoupleRecommendationsResult(supabase, connection.id, signature, tier, resultItems)

    // Tijdelijke debug-info: helpt te achterhalen of een leeg resultaat komt door een
    // lege doorsnede/fallback, of door het wegfilteren op streamingdiensten daarna.
    return NextResponse.json({
      connected: true,
      connectionId: connection.id,
      tier,
      items: resultItems,
      debug: {
        favoritesA: inputsA.favorites.length,
        favoritesB: inputsB.favorites.length,
        candidatesA: tasteA.allCandidates.length,
        candidatesB: tasteB.allCandidates.length,
        intersectionSize: intersectionKeys.length,
        toppedUp: tier === 'intersection' && fallbackKeys.size > 0,
        itemsBeforeStreamingFilter: items.length,
        itemsAfterStreamingFilter: resultItems.length,
        combinedStreamingServices: [...inputsA.streamingServices, ...inputsB.streamingServices],
        coupleRatingsCount: coupleRatings.length,
      },
    })
  } catch (err) {
    console.error('Samen-aanbevelingen berekenen mislukt:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Onbekende fout bij het berekenen van Samen-aanbevelingen' },
      { status: 500 }
    )
  }
}
