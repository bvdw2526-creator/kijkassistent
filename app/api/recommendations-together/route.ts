import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  MODES,
  SOURCE_IDS,
  fetchProfileInputs,
  computeTasteProfile,
  discoverByGenres,
  resolveWatchInfo,
  type RankedCandidate,
  type RecommendationItem,
  type GenreAffinity,
  type TmdbItem,
} from '@/lib/recommendationEngine'

// Hoeveel titels de genre-fallback (tier 2, zie hieronder) maximaal teruggeeft per
// media-type — puur om de payload en het aantal kijkprovider-checks te begrenzen.
const FALLBACK_LIMIT_PER_TYPE = 20

function flattenByKey(sortedByMode: Record<string, RankedCandidate[]>): Map<string, RankedCandidate> {
  const map = new Map<string, RankedCandidate>()
  for (const mode of MODES) {
    for (const item of sortedByMode[mode] || []) {
      map.set(`${item.media_type}-${item.id}`, item)
    }
  }
  return map
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

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { data: connections, error: connectionsError } = await supabase
    .from('partner_connections')
    .select('requester_id, partner_id')
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

  // De rest staat in een try/catch: dit roept een lange keten van Supabase- en
  // TMDB-calls aan (zie lib/recommendationEngine.ts), en een onafgevangen fout daar
  // leverde eerder een kale 500-pagina op — waardoor de client "0 resultaten" liet
  // zien zonder enige aanwijzing wat er misging.
  try {
    // Zelfde RLS-client, maar dankzij de "accepted partner"-leesbeleid (zie de
    // partner_connections-migratie) mag deze ook de smaakgegevens van de partner ophalen.
    const [inputsA, inputsB] = await Promise.all([
      fetchProfileInputs(supabase, user.id),
      fetchProfileInputs(supabase, partnerId),
    ])

    const [tasteA, tasteB] = await Promise.all([
      computeTasteProfile(supabase, inputsA),
      computeTasteProfile(supabase, inputsB),
    ])

    const mapA = flattenByKey(tasteA.sortedByMode)
    const mapB = flattenByKey(tasteB.sortedByMode)

    const intersectionKeys = Array.from(mapA.keys()).filter((key) => mapB.has(key))

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
      ])

      const mergedMovieGenres = mergeGenreAffinities(tasteA.movieGenres, tasteB.movieGenres)
      const mergedTvGenres = mergeGenreAffinities(tasteA.tvGenres, tasteB.tvGenres)

      const [movieDiscover, tvDiscover] = await Promise.all([
        discoverByGenres(supabase, 'movie', mergedMovieGenres),
        discoverByGenres(supabase, 'tv', mergedTvGenres),
      ])

      const buildFallbackItems = (discover: { results: TmdbItem[]; label: string }): RankedCandidate[] => {
        const filtered = discover.results
          .filter((item) => !excludeIds.has(`${item.media_type}-${item.id}`))
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
        }))
      }

      tier = mergedMovieGenres.length === 0 && mergedTvGenres.length === 0 ? 'empty' : 'fallback'
      items = [
        ...buildFallbackItems(movieDiscover),
        ...buildFallbackItems(tvDiscover),
      ]
    }

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

    // Tijdelijke debug-info: helpt te achterhalen of een leeg resultaat komt door een
    // lege doorsnede/fallback, of door het wegfilteren op streamingdiensten daarna.
    return NextResponse.json({
      connected: true,
      tier,
      items: resultItems,
      debug: {
        favoritesA: inputsA.favorites.length,
        favoritesB: inputsB.favorites.length,
        itemsBeforeStreamingFilter: items.length,
        itemsAfterStreamingFilter: resultItems.length,
        combinedStreamingServices: [...inputsA.streamingServices, ...inputsB.streamingServices],
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
