import { NextRequest, NextResponse, after } from 'next/server'
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
import { upcomingForCouple } from '@/lib/upcomingTitles'

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

interface TasteMatch {
  // Van wie het oogpunt is (wie de lijst berekende): bepaalt wie "jij" is in de tekst.
  ownerId?: string
  // 0-100, gemiddelde van de genre-overlap en de verhaal-overeenkomst.
  score: number
  genrePercent: number
  // null als een van beiden nog geen verhaal-vingerafdruk heeft.
  storyPercent: number | null
  sharedGenres: string[]
  youMoreGenres: string[]
  partnerMoreGenres: string[]
  sharedTopTitles: number
}

// Op echte data van ons testpubliek: genre-overlap loopt van 3% tot 80% (mediaan 29%) en de
// cosinus-overeenkomst tussen twee smaakvectoren van 0,52 tot 0,89 (mediaan 0,74). Zonder
// herschalen zou de verhaalscore altijd "hoog" lijken en de genrescore altijd "laag".
const GENRE_OVERLAP_FULL = 0.7
const STORY_COSINE_FLOOR = 0.5
const STORY_COSINE_CEILING = 0.9

// Vergelijkt twee smaakprofielen: hoeveel van hun genresmaak overlapt (het gedeelte van elk
// profiel dat ook bij de ander zit) en hoe dicht hun verhaal-vingerafdrukken bij elkaar liggen.
function computeTasteMatch(
  tasteA: { movieGenres: GenreAffinity[]; tvGenres: GenreAffinity[]; userVector: number[] },
  tasteB: { movieGenres: GenreAffinity[]; tvGenres: GenreAffinity[]; userVector: number[] },
  inputsA: { favorites: { media_type: string; tmdb_id: number }[]; ratings: { media_type: string; tmdb_id: number; rating: string }[] },
  inputsB: { favorites: { media_type: string; tmdb_id: number }[]; ratings: { media_type: string; tmdb_id: number; rating: string }[] }
): TasteMatch | null {
  const toDistribution = (taste: typeof tasteA) => {
    const raw = new Map<string, { name: string; weight: number }>()
    for (const [type, list] of [['movie', taste.movieGenres], ['tv', taste.tvGenres]] as const) {
      for (const g of list) raw.set(`${type}:${g.id}`, { name: g.name, weight: g.count })
    }
    const total = Array.from(raw.values()).reduce((sum, v) => sum + v.weight, 0)
    return { raw, total }
  }
  const a = toDistribution(tasteA)
  const b = toDistribution(tasteB)
  if (a.total === 0 || b.total === 0) return null

  let overlap = 0
  const rows: { name: string; pa: number; pb: number }[] = []
  for (const key of new Set([...a.raw.keys(), ...b.raw.keys()])) {
    const pa = (a.raw.get(key)?.weight ?? 0) / a.total
    const pb = (b.raw.get(key)?.weight ?? 0) / b.total
    overlap += Math.min(pa, pb)
    rows.push({ name: (a.raw.get(key) ?? b.raw.get(key))!.name, pa, pb })
  }
  const genreScaled = Math.min(1, overlap / GENRE_OVERLAP_FULL)

  let storyScaled: number | null = null
  if (tasteA.userVector.length > 0 && tasteB.userVector.length > 0) {
    const cos = cosineSimilarity(tasteA.userVector, tasteB.userVector)
    storyScaled = Math.min(1, Math.max(0, (cos - STORY_COSINE_FLOOR) / (STORY_COSINE_CEILING - STORY_COSINE_FLOOR)))
  }

  // Film- en seriegenres met dezelfde naam (bv. "Drama") samenvoegen voor de weergave.
  const byName = new Map<string, { pa: number; pb: number }>()
  for (const r of rows) {
    const cur = byName.get(r.name) ?? { pa: 0, pb: 0 }
    byName.set(r.name, { pa: cur.pa + r.pa, pb: cur.pb + r.pb })
  }
  const named = Array.from(byName.entries()).map(([name, v]) => ({ name, ...v }))
  const sharedGenres = named
    .filter((n) => Math.min(n.pa, n.pb) > 0.02)
    .sort((x, y) => Math.min(y.pa, y.pb) - Math.min(x.pa, x.pb))
    .slice(0, 3)
    .map((n) => n.name)
  const youMoreGenres = named
    .filter((n) => n.pa - n.pb > 0.05)
    .sort((x, y) => y.pa - y.pb - (x.pa - x.pb))
    .slice(0, 2)
    .map((n) => n.name)
  const partnerMoreGenres = named
    .filter((n) => n.pb - n.pa > 0.05)
    .sort((x, y) => y.pb - y.pa - (x.pb - x.pa))
    .slice(0, 2)
    .map((n) => n.name)

  const topKeys = (inputs: typeof inputsA) =>
    new Set([
      ...inputs.favorites.map((f) => `${f.media_type}-${f.tmdb_id}`),
      ...inputs.ratings.filter((r) => r.rating === 'love').map((r) => `${r.media_type}-${r.tmdb_id}`),
    ])
  const topA = topKeys(inputsA)
  const sharedTopTitles = Array.from(topKeys(inputsB)).filter((k) => topA.has(k)).length

  const parts = storyScaled === null ? [genreScaled] : [genreScaled, storyScaled]
  const score = Math.round((parts.reduce((s, v) => s + v, 0) / parts.length) * 100)
  return {
    score,
    genrePercent: Math.round(genreScaled * 100),
    storyPercent: storyScaled === null ? null : Math.round(storyScaled * 100),
    sharedGenres,
    youMoreGenres,
    partnerMoreGenres,
    sharedTopTitles,
  }
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

// Hoe lang een lopende berekening als "bezig" telt. Daarna mag een nieuwe aanvraag het overnemen
// (bv. omdat de vorige is afgebroken).
// Iets langer dan maxDuration (60s): een echte crash op Vercel kan de "computing"-vlag niet meer
// zelf opruimen, dus moet dit vanzelf weer loslaten zodra de vorige poging onmogelijk nog bezig
// kan zijn.
const COMPUTE_LOCK_SECONDS = 70
// Zoveel doorsnede-titels (de beste eerst) controleren we op beschikbaarheid bij jullie diensten.
const AVAILABILITY_CHECK_LIMIT = 50
// Zachte tijdslimiet: ruim onder maxDuration (60s), zodat er nog tijd overblijft om het resultaat
// op te slaan voordat Vercel de functie hard afbreekt. Duurt de berekening langer, dan slaan we
// de resterende, duurste stappen (aanvulling, tweede beschikbaarheidscheck) over.
const SOFT_DEADLINE_MS = 42_000

// De smaakmatch is berekend vanuit het oogpunt van degene die de lijst maakte ("jij" en "je
// partner"). Leest de ander de gedeelde lijst, dan draaien we die twee om.
function viewerMatch(match: unknown, viewerId: string): TasteMatch | null {
  if (!match || typeof match !== 'object') return null
  const m = match as TasteMatch
  if (!m.ownerId || m.ownerId === viewerId) return m
  return { ...m, youMoreGenres: m.partnerMoreGenres, partnerMoreGenres: m.youMoreGenres }
}

// Zet het slot voor een berekening. Geeft true als jij de berekening mag doen, false als
// iemand anders er net mee bezig is.
async function claimCompute(supabase: SupabaseClient, connectionId: string): Promise<boolean> {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('couple_recommendations_cache')
    .insert({ connection_id: connectionId, signature: '', tier: 'empty', items: [], computing_since: now })
  if (!error) return true
  if (error.code !== '23505') {
    // Slot zetten mislukt om een andere reden: liever toch rekenen dan de lijst nooit vullen.
    console.error('Slot voor Samen-berekening zetten mislukt:', error)
    return true
  }
  const cutoff = new Date(Date.now() - COMPUTE_LOCK_SECONDS * 1000).toISOString()
  const { data } = await supabase
    .from('couple_recommendations_cache')
    .update({ computing_since: now })
    .eq('connection_id', connectionId)
    .or(`computing_since.is.null,computing_since.lt.${cutoff}`)
    .select('connection_id')
  return (data?.length ?? 0) > 0
}

async function releaseClaim(supabase: SupabaseClient, connectionId: string): Promise<void> {
  await supabase.from('couple_recommendations_cache').update({ computing_since: null }).eq('connection_id', connectionId)
}

async function cacheCoupleRecommendationsResult(
  supabase: SupabaseClient,
  connectionId: string,
  signature: string,
  tier: 'intersection' | 'fallback' | 'empty',
  items: RecommendationItem[],
  match: TasteMatch | null
): Promise<void> {
  await supabase.from('couple_recommendations_cache').upsert(
    { connection_id: connectionId, signature, tier, items, match, fetched_at: new Date().toISOString(), computing_since: null },
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
    const [inputsA, inputsB, coupleRatingsResult, coupleWatchlistResult] = await Promise.all([
      fetchProfileInputs(supabase, user.id),
      fetchProfileInputs(supabase, partnerId),
      supabase
        .from('couple_ratings')
        .select('tmdb_id, media_type, rating')
        .eq('connection_id', connection.id),
      supabase
        .from('couple_watchlist')
        .select('tmdb_id, media_type')
        .eq('connection_id', connection.id),
    ])

    const coupleRatings = coupleRatingsResult.data || []
    // Wat al op jullie gezamenlijke watchlist staat, hoeft niet nog eens aanbevolen te worden.
    const coupleWatchlistKeys = (coupleWatchlistResult.data || []).map((w) => `${w.media_type}-${w.tmdb_id}`)

    // "signature" vangt de staat van beide profielen + de koppel-beoordelingen. Wijzigt
    // daar niets aan sinds de vorige berekening, dan kan de complete, dure pijplijn
    // hieronder (twee keer computeTasteProfile, discover-fallback, kijkproviders)
    // overgeslagen worden.
    const signature = [
      'v10-upcoming',
      // Gesorteerd: zo is de handtekening voor jullie beiden gelijk en delen jullie dezelfde opgeslagen lijst.
      ...[buildProfileSignature(inputsA), buildProfileSignature(inputsB)].sort(),
      'cpl:' + coupleRatings.map((r) => `${r.media_type}-${r.tmdb_id}-${r.rating}`).sort().join(','),
      'cwl:' + [...coupleWatchlistKeys].sort().join(','),
    ].join('||')

    // De zware berekening; loopt op de achtergrond (zie hieronder) en slaat het resultaat op.
    const compute = async () => {
    const computeStartedAt = Date.now()
    const [tasteA, tasteB] = await Promise.all([
      computeTasteProfile(supabase, inputsA),
      computeTasteProfile(supabase, inputsB),
    ])

    // Eenmaal samen beoordeeld (positief of negatief) komt een titel niet nog eens
    // terug in Samen — net als bij persoonlijke ratings.
    const coupleRatedKeys = new Set([
      ...coupleRatings.map((r) => `${r.media_type}-${r.tmdb_id}`),
      ...coupleWatchlistKeys,
    ])

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

    // Genres die een van jullie uitsluit tellen niet mee als "gedeelde smaak": anders nemen ze
    // een plek in de top vijf in waar de zoektocht op zoekt, en valt die titels daarna weer af.
    const mergedMovieGenres = mergeGenreAffinities(tasteA.movieGenres, tasteB.movieGenres).filter(
      (g) => !combinedExcludedGenreIds.has(g.id)
    )
    const mergedTvGenres = mergeGenreAffinities(tasteA.tvGenres, tasteB.tvGenres).filter(
      (g) => !combinedExcludedGenreIds.has(g.id)
    )

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
              pages: [1, 2],
              excludeGenreIds: Array.from(combinedExcludedGenreIds),
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

      // Eerst de titels weghalen die niet op jullie streamingdiensten staan, dán pas tellen
      // hoeveel er over zijn. Eerder telde dit de ruwe doorsnede (die veel titels bevat die op
      // geen van jullie diensten staan), dacht de route dat er genoeg was, en viel het aantal
      // pas daarna terug naar 2 — zonder dat er nog werd aangevuld.
      if (discoverProviderIds.length > 0) {
        const checkable = items.slice(0, AVAILABILITY_CHECK_LIMIT)
        const watchInfo = await resolveWatchInfo(supabase, checkable, new Set(discoverProviderIds))
        items = checkable.filter((i) => watchInfo.get(titleKey(i)))
      }
      // Blijft er niets over, dan is dit feitelijk een fallback zonder echte doorsnede-matches.
      if (items.length === 0) tier = 'fallback'

      // Is de doorsnede voor een type (films/series) klein — bv. omdat een van jullie veel
      // genres uitsluit of al veel heeft beoordeeld — vul dan aan uit de bredere zoektocht.
      // Niet meer als de zachte deadline al voorbij is: dan liever een kortere lijst dan geen
      // enkele (die dan nooit wordt opgeslagen omdat de functie hard wordt afgebroken).
      const shortTypes =
        Date.now() - computeStartedAt > SOFT_DEADLINE_MS
          ? []
          : (['movie', 'tv'] as const).filter(
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
    if (combinedSourceIds.size === 0 || items.length === 0 || Date.now() - computeStartedAt > SOFT_DEADLINE_MS) {
      // Over de deadline heen: geen tijd meer voor nog een beschikbaarheidscheck. De titels
      // blijven gewoon zonder "waar te zien"-label, in plaats van de hele berekening te
      // verliezen omdat Vercel de functie halverwege afbreekt.
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

    const rawMatch = computeTasteMatch(tasteA, tasteB, inputsA, inputsB)
    const match = rawMatch ? { ...rawMatch, ownerId: user.id } : null

    // Films en series die binnenkort uitkomen en bij jullie allebei passen. Los van de streamingcontrole
    // hierboven (ze hebben nog geen kijkinfo) en alleen als er nog tijd over is.
    if (Date.now() - computeStartedAt <= SOFT_DEADLINE_MS) {
      const upcomingSamen = await upcomingForCouple(supabase, process.env.TMDB_API_KEY, tasteA, tasteB, {
        excludedGenreIds: combinedExcludedGenreIds,
        seenKeys: excludeIds,
      })
      resultItems = [...resultItems, ...upcomingSamen]
    }

    await cacheCoupleRecommendationsResult(supabase, connection.id, signature, tier, resultItems, match)

    // Handig in de Vercel-logs om te zien hoe lang de berekening duurt en wat erin zat.
    console.log('Samen berekend', {
      seconden: Math.round((Date.now() - computeStartedAt) / 100) / 10,
      tier,
      films: resultItems.filter((i) => i.media_type === 'movie').length,
      series: resultItems.filter((i) => i.media_type === 'tv').length,
      doorsnede: intersectionKeys.length,
      aangevuld: tier === 'intersection' && fallbackKeys.size > 0,
    })
    return { tier, items: resultItems, match }
    }

    const { data: cachedResult } = await supabase
      .from('couple_recommendations_cache')
      .select('signature, tier, items, match, fetched_at, computing_since')
      .eq('connection_id', connection.id)
      .single()

    // Een placeholder-rij (signature '') is alleen het slot van een lopende eerste berekening.
    const hasCache = !!cachedResult && cachedResult.signature !== '' && Array.isArray(cachedResult.items)

    if (cachedResult && hasCache && cachedResult.signature === signature) {
      const ageHours = (Date.now() - new Date(cachedResult.fetched_at).getTime()) / (1000 * 60 * 60)
      if (ageHours < COUPLE_RECOMMENDATIONS_RESULT_CACHE_MAX_AGE_HOURS) {
        return NextResponse.json({
          connected: true,
          connectionId: connection.id,
          tier: cachedResult.tier,
          items: cachedResult.items,
          match: viewerMatch(cachedResult.match, user.id),
        })
      }
    }

    // Geen verse lijst: de nieuwe wordt op de achtergrond samengesteld, zodat niemand hoeft te
    // wachten. Ondertussen tonen we de laatst bekende lijst (als die er is), en anders laten we
    // de app weten dat de eerste lijst onderweg is. Het slot voorkomt dat jullie allebei
    // tegelijk dezelfde zware berekening starten.
    const claimed = await claimCompute(supabase, connection.id)
    if (claimed) {
      after(async () => {
        try {
          await compute()
        } catch (err) {
          console.error('Samen op de achtergrond berekenen mislukt:', err)
          await releaseClaim(supabase, connection.id)
        }
      })
    }

    if (cachedResult && hasCache) {
      // De oude lijst kan titels bevatten die jullie intussen hebben beoordeeld of opgeslagen.
      const knownKeys = new Set(
        [...inputsA.favorites, ...inputsA.ratings, ...inputsA.watchlist, ...inputsB.favorites, ...inputsB.ratings, ...inputsB.watchlist]
          .map((t) => `${t.media_type}-${t.tmdb_id}`)
          .concat(coupleRatings.map((r) => `${r.media_type}-${r.tmdb_id}`), coupleWatchlistKeys)
      )
      return NextResponse.json({
        connected: true,
        connectionId: connection.id,
        tier: cachedResult.tier,
        items: (cachedResult.items as RecommendationItem[]).filter((i) => !knownKeys.has(`${i.media_type}-${i.id}`)),
        match: viewerMatch(cachedResult.match, user.id),
        stale: true,
      })
    }

    return NextResponse.json({ connected: true, connectionId: connection.id, tier: 'none', items: [], computing: true })
  } catch (err) {
    console.error('Samen-aanbevelingen berekenen mislukt:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Onbekende fout bij het berekenen van Samen-aanbevelingen' },
      { status: 500 }
    )
  }
}
