import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  SOURCE_IDS,
  fetchProfileInputs,
  buildProfileSignature,
  computeTasteProfile,
  discoverByGenres,
  resolveWatchInfo,
  getCachedDetails,
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
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  // De hele body staat in een try/catch: een onafgevangen fout waar dan ook hierin
  // (bv. Supabase- of TMDB-calls in lib/recommendationEngine.ts) leverde eerder een
  // kale HTML-foutpagina van Next.js op — de client kreeg dan "Unexpected token '<'"
  // te zien bij het parsen als JSON, zonder enige aanwijzing wat er echt misging.
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

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
    } else {
      // Geen enkele titel komt bij allebei voor: val terug op een bredere zoektocht op de
      // gecombineerde genre-affiniteit van jullie beiden, zodat er toch iets te zien is —
      // wel met minder zekerheid dan een echte doorsnede-match.
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
      // bij de doorsnede (tier "intersection") kan dat toch al niet (elke titel moest
      // al door ieders eigen, al gefilterde lijst komen), maar deze fallback-zoektocht
      // start helemaal opnieuw op genre en had die filtering nog niet.
      const combinedExcludedGenreIds = new Set([...inputsA.excludedGenreIds, ...inputsB.excludedGenreIds])

      const mergedMovieGenres = mergeGenreAffinities(tasteA.movieGenres, tasteB.movieGenres)
      const mergedTvGenres = mergeGenreAffinities(tasteA.tvGenres, tasteB.tvGenres)

      const [movieDiscover, tvDiscover] = await Promise.all([
        discoverByGenres(supabase, 'movie', mergedMovieGenres),
        discoverByGenres(supabase, 'tv', mergedTvGenres),
      ])

      const buildFallbackItems = (discover: { results: TmdbItem[]; label: string }): RankedCandidate[] => {
        const filtered = discover.results
          .filter((item) => !excludeIds.has(`${item.media_type}-${item.id}`))
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

      tier = mergedMovieGenres.length === 0 && mergedTvGenres.length === 0 ? 'empty' : 'fallback'
      items = [
        ...buildFallbackItems(movieDiscover),
        ...buildFallbackItems(tvDiscover),
      ]
    }

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

    // Beperk tot de beste SAMEN_MAX_PER_TYPE per type — anders kan vooral tier
    // "intersection" (die niet, zoals de gewone modi, al door een round-robin/long-tail-
    // limiet gaat) onbeperkt groeien. Per type i.p.v. één gecombineerde cap, zodat een
    // sterke overlap in films niet ten koste gaat van het aantal series (of andersom).
    items = [
      ...items.filter((i) => i.media_type === 'movie').sort((a, b) => b.matchPercent - a.matchPercent).slice(0, SAMEN_MAX_PER_TYPE),
      ...items.filter((i) => i.media_type === 'tv').sort((a, b) => b.matchPercent - a.matchPercent).slice(0, SAMEN_MAX_PER_TYPE),
    ]

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
