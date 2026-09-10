import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type MediaType = 'movie' | 'tv'
type Tier = 'core' | 'ok'
type RecommendationMode = 'focused' | 'balanced' | 'explore'
type ScoreField = 'coreScore' | 'okScore' | 'discoverScore' | 'collectionScore'

// Ruwe vorm van een TMDB-item zoals de API die teruggeeft (films gebruiken "title", series "name").
interface RawTmdbItem {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  vote_average: number
  overview?: string
  genre_ids?: number[]
}

interface TmdbItem {
  id: number
  title: string
  poster_path: string | null
  vote_average: number
  overview: string
  media_type: MediaType
  genre_ids: number[]
}

interface WatchProviderSource {
  provider_id: number
  name: string
  type: 'sub' | 'rent' | 'buy' | string
  price: number | null
  web_url: string
}

interface TitleDetails {
  genres: { id: number; name: string }[]
  overview: string
  collectionId: number | null
  collectionName: string | null
}

interface ProfileSource {
  tmdb_id: number
  title: string
  media_type: MediaType
  weight: number
  tier: Tier
}

interface SourceDetail extends ProfileSource, TitleDetails {}

interface ScoredCandidate extends TmdbItem {
  coreScore: number
  okScore: number
  discoverScore: number
  collectionScore: number
  embeddingBonus: number
  basedOn: Set<string>
}

interface RankedCandidate extends TmdbItem {
  score: number
  basedOn: string[]
  coreScore: number
  okScore: number
  discoverScore: number
  collectionScore: number
  embeddingBonus: number
}

interface RecommendationItem extends RankedCandidate {
  watchOn?: string
  watchUrl?: string
}

// TMDB (JustWatch) provider-ID's voor de NL-regio. Op te vragen via
// GET /3/watch/providers/movie?watch_region=NL.
const SOURCE_IDS: Record<string, number> = {
  netflix: 8,
  videoland: 72,
  disney_plus: 337,
  amazon_prime: 119,
  hbo_max: 1899,
}

const WATCH_PROVIDERS_CACHE_MAX_AGE_HOURS = 24
const TMDB_DETAILS_CACHE_MAX_AGE_HOURS = 24 * 7
const RECOMMENDATIONS_CACHE_MAX_AGE_HOURS = 24
const DISCOVER_CACHE_MAX_AGE_HOURS = 12
const COLLECTION_CACHE_MAX_AGE_HOURS = 24 * 7
const VOYAGE_MODEL = 'voyage-4-lite'
const EMBEDDING_BONUS_WEIGHT = 2
const COLLECTION_WEIGHT = 3
const DISCOVER_GENRE_LIMIT = 5
// Begrenst over hoeveel genres de max-5-per-genre-selectie draait. Zonder dit kan
// iemand met veel favorieten/ratings tientallen genres aantikken, wat de kandidaten-
// pool (en dus het aantal beschikbaarheids-checks bij TMDB hieronder) onnodig
// laat exploderen — dat is de belangrijkste oorzaak van een trage eerste keer laden.
const ROUND_ROBIN_GENRE_LIMIT = 10
const DISCOVER_PAGES = [1, 2]
// 2 pagina's i.p.v. 3: pagina 3 van TMDB's per-titel-aanbevelingen voegt weinig relevantie
// toe, maar bij veel favorieten/ratings (elk 3 losse TMDB-calls) telt dat wel flink op.
const RECOMMENDATION_PAGES = [1, 2]

const MODES: RecommendationMode[] = ['focused', 'balanced', 'explore']

// "focused" telt alleen scores op van favorieten/"echt leuk"; "OK"-getagde titels
// tellen pas mee als aanbevelingsbron vanaf "balanced". "explore" haalt daarnaast
// bewust een bredere discover-pool op (zie DISCOVER_GENRE_LIMIT/DISCOVER_PAGES) en
// dempt de scores sterker, zodat de long tail niet wordt overstemd door de bekende titels.
// De modi worden na elkaar opgebouwd (focused -> balanced -> explore) en sluiten
// elkaars titels uit, zodat dezelfde film niet in meerdere tabbladen opduikt.
// maxPerGenre/longTailSlots lopen op per modus, zodat "explore" ook echt breder is.
const MODE_CONFIG: Record<RecommendationMode, {
  includeOkAsSource: boolean
  discoverWeight: number
  dampingFactor: number
  maxPerGenre: number
  longTailSlots: number
}> = {
  focused:  { includeOkAsSource: false, discoverWeight: 0.4,  dampingFactor: 1.0, maxPerGenre: 3, longTailSlots: 0 },
  balanced: { includeOkAsSource: true,  discoverWeight: 0.75, dampingFactor: 1.0, maxPerGenre: 5, longTailSlots: 3 },
  explore:  { includeOkAsSource: true,  discoverWeight: 1.5,  dampingFactor: 0.6, maxPerGenre: 8, longTailSlots: 12 },
}

type CacheRow<T> = Record<string, T> & { fetched_at: string }

async function getCached<T>(
  supabase: SupabaseClient,
  table: string,
  match: Record<string, string | number>,
  column: string,
  maxAgeHours: number,
  // null = de live fetch is mislukt (bv. verkeerde/ontbrekende API-key, externe
  // storing). Dat mag nooit als een geldig "geen resultaten" worden weggeschreven —
  // anders staat een tijdelijke storing (of een vergeten env var op Vercel) uren tot
  // dagen lang "vast" in de cache, ook nadat het probleem is opgelost.
  fetcher: () => Promise<T | null>,
  fallback: T
): Promise<T> {
  let query = supabase.from(table).select(`${column}, fetched_at`)
  for (const [key, value] of Object.entries(match)) query = query.eq(key, value)
  // De select-string is dynamisch (kolomnaam via een variabele), dus supabase-js kan
  // de vorm niet op typeniveau afleiden — we leggen het rij-type hier expliciet vast.
  const { data: cached } = await query.single().overrideTypes<CacheRow<T>, { merge: false }>()

  if (cached) {
    const ageHours = (Date.now() - new Date(cached.fetched_at).getTime()) / (1000 * 60 * 60)
    if (ageHours < maxAgeHours) return cached[column]
  }

  const fresh = await fetcher()
  if (fresh === null) {
    return cached ? cached[column] : fallback
  }

  await supabase.from(table).upsert(
    { ...match, [column]: fresh, fetched_at: new Date().toISOString() },
    { onConflict: Object.keys(match).join(',') }
  )
  return fresh
}

async function fetchWatchProvidersLive(mediaType: MediaType, tmdbId: number): Promise<WatchProviderSource[] | null> {
  const endpoint = mediaType === 'tv' ? 'tv' : 'movie'
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/${endpoint}/${tmdbId}/watch/providers`,
      { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const nl = data.results?.NL
    if (!nl) return []

    const link: string = nl.link || ''
    const sources: WatchProviderSource[] = []
    for (const p of nl.flatrate || []) sources.push({ provider_id: p.provider_id, name: p.provider_name, type: 'sub', price: null, web_url: link })
    for (const p of nl.rent || []) sources.push({ provider_id: p.provider_id, name: p.provider_name, type: 'rent', price: null, web_url: link })
    for (const p of nl.buy || []) sources.push({ provider_id: p.provider_id, name: p.provider_name, type: 'buy', price: null, web_url: link })
    return sources
  } catch {
    return null
  }
}

// TMDB's watch/providers-endpoint (JustWatch-data) i.p.v. Watchmode: gratis, geen
// aparte quota, en dezelfde TMDB_API_KEY die we toch al gebruiken. Geeft geen prijzen
// en linkt naar een algemene TMDB-kijkpagina i.p.v. rechtstreeks naar de dienst zelf.
//
// Bulk-variant (zelfde opzet als getEmbeddingsForItems hieronder): i.p.v. per titel een
// losse SELECT + eventuele upsert (bij 250+ titels al gauw 250+ losse round trips), lezen
// we de cache in twee .in()-queries (movie/tv) en doen we alleen live TMDB-calls + één
// gebundelde upsert voor de titels die niet of verouderd in de cache staan.
async function getWatchProvidersBulk(
  supabase: SupabaseClient,
  items: { mediaType: MediaType; tmdbId: number }[]
): Promise<Map<string, WatchProviderSource[]>> {
  const result = new Map<string, WatchProviderSource[]>()
  const staleFallback = new Map<string, WatchProviderSource[]>()
  const cutoffMs = Date.now() - WATCH_PROVIDERS_CACHE_MAX_AGE_HOURS * 60 * 60 * 1000

  const movieIds = items.filter((i) => i.mediaType === 'movie').map((i) => i.tmdbId)
  const tvIds = items.filter((i) => i.mediaType === 'tv').map((i) => i.tmdbId)

  type CachedRow = { tmdb_id: number; sources: WatchProviderSource[]; fetched_at: string }
  const [movieRows, tvRows] = await Promise.all([
    movieIds.length
      ? supabase.from('tmdb_watch_providers_cache').select('tmdb_id, sources, fetched_at').eq('media_type', 'movie').in('tmdb_id', movieIds)
      : Promise.resolve({ data: [] as CachedRow[] }),
    tvIds.length
      ? supabase.from('tmdb_watch_providers_cache').select('tmdb_id, sources, fetched_at').eq('media_type', 'tv').in('tmdb_id', tvIds)
      : Promise.resolve({ data: [] as CachedRow[] }),
  ])

  for (const [mediaType, rows] of [['movie', movieRows.data], ['tv', tvRows.data]] as const) {
    for (const row of rows || []) {
      const key = `${mediaType}-${row.tmdb_id}`
      staleFallback.set(key, row.sources)
      if (new Date(row.fetched_at).getTime() >= cutoffMs) result.set(key, row.sources)
    }
  }

  const missing = items.filter((i) => !result.has(`${i.mediaType}-${i.tmdbId}`))

  if (missing.length > 0) {
    const fetched = await Promise.all(
      missing.map(async (item) => ({
        key: `${item.mediaType}-${item.tmdbId}`,
        mediaType: item.mediaType,
        tmdbId: item.tmdbId,
        sources: await fetchWatchProvidersLive(item.mediaType, item.tmdbId),
      }))
    )

    const upserts = fetched
      .filter((f) => f.sources !== null)
      .map((f) => ({ media_type: f.mediaType, tmdb_id: f.tmdbId, sources: f.sources, fetched_at: new Date().toISOString() }))

    if (upserts.length > 0) {
      await supabase.from('tmdb_watch_providers_cache').upsert(upserts, { onConflict: 'media_type,tmdb_id' })
    }

    for (const f of fetched) {
      // Een mislukte live fetch mag geen "niet beschikbaar" worden: val terug op de
      // laatst bekende (evt. verouderde) cache-rij, of anders een lege lijst.
      if (f.sources !== null) result.set(f.key, f.sources)
      else result.set(f.key, staleFallback.get(f.key) ?? [])
    }
  }

  return result
}

async function fetchDetails(mediaType: MediaType, tmdbId: number): Promise<TitleDetails | null> {
  const endpoint = mediaType === 'tv' ? 'tv' : 'movie'
  try {
    const res = await fetch(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}?language=nl-NL`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    return {
      genres: data.genres || [],
      overview: data.overview || '',
      collectionId: data.belongs_to_collection?.id ?? null,
      collectionName: data.belongs_to_collection?.name ?? null,
    }
  } catch {
    return null
  }
}

const EMPTY_DETAILS: TitleDetails = { genres: [], overview: '', collectionId: null, collectionName: null }

async function getCachedDetails(supabase: SupabaseClient, mediaType: MediaType, tmdbId: number): Promise<TitleDetails> {
  const { data: cached } = await supabase
    .from('tmdb_details_cache')
    .select('genres, overview, collection_id, collection_name, fetched_at')
    .eq('media_type', mediaType)
    .eq('tmdb_id', tmdbId)
    .single()

  if (cached) {
    const ageHours = (Date.now() - new Date(cached.fetched_at).getTime()) / (1000 * 60 * 60)
    if (ageHours < TMDB_DETAILS_CACHE_MAX_AGE_HOURS) {
      return {
        genres: cached.genres,
        overview: cached.overview,
        collectionId: cached.collection_id,
        collectionName: cached.collection_name,
      }
    }
  }

  const details = await fetchDetails(mediaType, tmdbId)
  // Een mislukte live fetch (bv. verkeerde/ontbrekende TMDB_API_KEY) mag niet als
  // "deze titel heeft geen genres/overview" worden gecached — val terug op een
  // eventuele oudere cache-rij en probeer het gewoon later opnieuw live.
  if (details === null) {
    if (cached) {
      return {
        genres: cached.genres,
        overview: cached.overview,
        collectionId: cached.collection_id,
        collectionName: cached.collection_name,
      }
    }
    return EMPTY_DETAILS
  }

  await supabase.from('tmdb_details_cache').upsert(
    {
      media_type: mediaType,
      tmdb_id: tmdbId,
      genres: details.genres,
      overview: details.overview,
      collection_id: details.collectionId,
      collection_name: details.collectionName,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'media_type,tmdb_id' }
  )
  return details
}

function mapTmdbResults(results: RawTmdbItem[], mediaType: MediaType): TmdbItem[] {
  return (results || []).map((item) => ({
    id: item.id,
    title: item.title || item.name || '',
    poster_path: item.poster_path,
    vote_average: item.vote_average,
    overview: item.overview || '',
    media_type: mediaType,
    genre_ids: item.genre_ids || [],
  }))
}

// Bulk-variant van dezelfde getCached-caching, maar dan in twee .in()-queries i.p.v.
// één losse SELECT (+ eventuele upsert) per bron × pagina — zelfde reden als bij
// getWatchProvidersBulk hierboven.
async function getRecommendationPagesBulk(
  supabase: SupabaseClient,
  items: { mediaType: MediaType; tmdbId: number; page: number }[]
): Promise<Map<string, TmdbItem[]>> {
  const result = new Map<string, TmdbItem[]>()
  const staleFallback = new Map<string, TmdbItem[]>()
  const cutoffMs = Date.now() - RECOMMENDATIONS_CACHE_MAX_AGE_HOURS * 60 * 60 * 1000

  const movieIds = [...new Set(items.filter((i) => i.mediaType === 'movie').map((i) => i.tmdbId))]
  const tvIds = [...new Set(items.filter((i) => i.mediaType === 'tv').map((i) => i.tmdbId))]

  type Row = { tmdb_id: number; page: number; results: TmdbItem[]; fetched_at: string }
  const [movieRows, tvRows] = await Promise.all([
    movieIds.length
      ? supabase.from('tmdb_recommendations_cache').select('tmdb_id, page, results, fetched_at').eq('media_type', 'movie').in('tmdb_id', movieIds)
      : Promise.resolve({ data: [] as Row[] }),
    tvIds.length
      ? supabase.from('tmdb_recommendations_cache').select('tmdb_id, page, results, fetched_at').eq('media_type', 'tv').in('tmdb_id', tvIds)
      : Promise.resolve({ data: [] as Row[] }),
  ])

  for (const [mediaType, rows] of [['movie', movieRows.data], ['tv', tvRows.data]] as const) {
    for (const row of rows || []) {
      const key = `${mediaType}-${row.tmdb_id}-${row.page}`
      staleFallback.set(key, row.results)
      if (new Date(row.fetched_at).getTime() >= cutoffMs) result.set(key, row.results)
    }
  }

  // Dedupliceren: dezelfde titel kan meerdere keren als bron voorkomen (favoriet én
  // beoordeeld), dan hoeft dezelfde pagina maar één keer opgehaald te worden.
  const missingByKey = new Map<string, { mediaType: MediaType; tmdbId: number; page: number }>()
  for (const item of items) {
    const key = `${item.mediaType}-${item.tmdbId}-${item.page}`
    if (!result.has(key)) missingByKey.set(key, item)
  }

  if (missingByKey.size > 0) {
    const fetched = await Promise.all(
      Array.from(missingByKey.entries()).map(async ([key, item]) => {
        const endpoint = item.mediaType === 'tv' ? 'tv' : 'movie'
        try {
          const res = await fetch(
            `https://api.themoviedb.org/3/${endpoint}/${item.tmdbId}/recommendations?language=nl-NL&page=${item.page}`,
            { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
          )
          if (!res.ok) return { key, item, results: null as TmdbItem[] | null }
          const data = await res.json()
          return { key, item, results: mapTmdbResults(data.results || [], item.mediaType) }
        } catch {
          return { key, item, results: null as TmdbItem[] | null }
        }
      })
    )

    const upserts = fetched
      .filter((f) => f.results !== null)
      .map((f) => ({ media_type: f.item.mediaType, tmdb_id: f.item.tmdbId, page: f.item.page, results: f.results, fetched_at: new Date().toISOString() }))

    if (upserts.length > 0) {
      await supabase.from('tmdb_recommendations_cache').upsert(upserts, { onConflict: 'media_type,tmdb_id,page' })
    }

    for (const f of fetched) {
      result.set(f.key, f.results ?? staleFallback.get(f.key) ?? [])
    }
  }

  return result
}

function getCachedDiscoverPage(
  supabase: SupabaseClient,
  mediaType: MediaType,
  genreKey: string,
  page: number,
  fetcher: () => Promise<TmdbItem[] | null>
): Promise<TmdbItem[]> {
  return getCached(
    supabase,
    'tmdb_discover_cache',
    { media_type: mediaType, genre_key: genreKey, page },
    'results',
    DISCOVER_CACHE_MAX_AGE_HOURS,
    fetcher,
    []
  )
}

async function fetchCollectionParts(collectionId: number): Promise<TmdbItem[] | null> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/collection/${collectionId}?language=nl-NL`,
      { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
    )
    if (!res.ok) return null
    const data = await res.json()
    return mapTmdbResults(data.parts || [], 'movie')
  } catch {
    return null
  }
}

function getCachedCollectionParts(supabase: SupabaseClient, collectionId: number): Promise<TmdbItem[]> {
  return getCached(
    supabase,
    'tmdb_collection_cache',
    { collection_id: collectionId },
    'parts',
    COLLECTION_CACHE_MAX_AGE_HOURS,
    () => fetchCollectionParts(collectionId),
    []
  )
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < texts.length; i += 100) chunks.push(texts.slice(i, i + 100))

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch('https://api.voyageai.com/v1/embeddings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
          },
          body: JSON.stringify({ input: chunk, model: VOYAGE_MODEL, input_type: 'document' }),
        })
        const data = await res.json()
        return (data.data || []).map((item: { embedding: number[] }) => item.embedding)
      } catch {
        return chunk.map(() => [])
      }
    })
  )

  return chunkResults.flat()
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

async function getEmbeddingsForItems(
  supabase: SupabaseClient,
  items: { media_type: MediaType; tmdb_id: number; text: string }[]
): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>()

  const movieIds = items.filter((i) => i.media_type === 'movie').map((i) => i.tmdb_id)
  const tvIds = items.filter((i) => i.media_type === 'tv').map((i) => i.tmdb_id)

  const [movieRows, tvRows] = await Promise.all([
    movieIds.length
      ? supabase.from('title_embeddings').select('tmdb_id, embedding').eq('media_type', 'movie').in('tmdb_id', movieIds)
      : Promise.resolve({ data: [] as { tmdb_id: number; embedding: number[] }[] }),
    tvIds.length
      ? supabase.from('title_embeddings').select('tmdb_id, embedding').eq('media_type', 'tv').in('tmdb_id', tvIds)
      : Promise.resolve({ data: [] as { tmdb_id: number; embedding: number[] }[] }),
  ])

  for (const row of movieRows.data || []) result.set(`movie-${row.tmdb_id}`, row.embedding)
  for (const row of tvRows.data || []) result.set(`tv-${row.tmdb_id}`, row.embedding)

  const missing = items.filter((i) => i.text && !result.has(`${i.media_type}-${i.tmdb_id}`))

  if (missing.length > 0) {
    const vectors = await embedTexts(missing.map((m) => m.text))
    const upserts = missing
      .map((item, i) => ({ media_type: item.media_type, tmdb_id: item.tmdb_id, embedding: vectors[i] }))
      .filter((u) => u.embedding && u.embedding.length > 0)

    if (upserts.length > 0) {
      await supabase.from('title_embeddings').upsert(upserts, { onConflict: 'media_type,tmdb_id' })
    }
    upserts.forEach((u) => result.set(`${u.media_type}-${u.tmdb_id}`, u.embedding))
  }

  return result
}

function pickByGenreRoundRobin<T extends { id: number; score: number; genre_ids: number[] }>(
  candidates: T[],
  relevantGenreIds: number[],
  keyFn: (i: T) => string,
  genresFn: (i: T) => number[],
  perGenre: number
): T[] {
  const genreGroups = new Map<number, T[]>()
  for (const genreId of relevantGenreIds) genreGroups.set(genreId, [])

  for (const item of candidates) {
    const itemGenres = genresFn(item)
    for (const g of itemGenres) {
      if (genreGroups.has(g)) genreGroups.get(g)!.push(item)
    }
  }
  for (const list of genreGroups.values()) list.sort((a, b) => b.score - a.score)

  const used = new Set<string>()
  const perGenreCount = new Map<number, number>()
  const result: T[] = []

  let progress = true
  while (progress) {
    progress = false
    for (const genreId of relevantGenreIds) {
      const count = perGenreCount.get(genreId) || 0
      if (count >= perGenre) continue
      const list = genreGroups.get(genreId)!
      const idx = list.findIndex((c) => !used.has(keyFn(c)))
      if (idx === -1) continue
      const chosen = list[idx]
      used.add(keyFn(chosen))
      perGenreCount.set(genreId, count + 1)
      result.push(chosen)
      progress = true
    }
  }

  return result
}

function pickLongTail<T extends { basedOn: string[] }>(
  scoredItems: T[],
  usedKeys: Set<string>,
  keyFn: (i: T) => string,
  count: number
): T[] {
  if (count <= 0) return []
  const pool = scoredItems.filter((i) => !usedKeys.has(keyFn(i)))
  const shuffled = [...pool]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, count).map((item) => ({
    ...item,
    basedOn: [...item.basedOn, 'verrassing'],
  }))
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

  // Deze vier zijn onafhankelijk van elkaar (alleen user.id nodig) — tegelijk ophalen
  // i.p.v. na elkaar scheelt drie keer wachten op een los rondje naar Supabase.
  const [
    { data: favorites },
    { data: ratings },
    { data: watchlist },
    { data: profile },
  ] = await Promise.all([
    supabase.from('favorite_movies').select('tmdb_id, title, media_type').eq('user_id', user.id),
    supabase.from('ratings').select('tmdb_id, title, rating, media_type').eq('user_id', user.id),
    supabase.from('watchlist').select('tmdb_id, media_type').eq('user_id', user.id),
    supabase.from('profiles').select('streaming_services').eq('id', user.id).single(),
  ])

  const emptyResponse = { focused: [], balanced: [], explore: [] }
  if (!favorites || favorites.length === 0) {
    return NextResponse.json(emptyResponse)
  }

  const excludeIds = new Set([
    ...favorites.map((f) => `${f.media_type}-${f.tmdb_id}`),
    ...(ratings?.map((r) => `${r.media_type}-${r.tmdb_id}`) || []),
    ...(watchlist?.map((w) => `${w.media_type}-${w.tmdb_id}`) || []),
  ])

  const lovedItems = ratings?.filter((r) => r.rating === 'love') || []
  const okItems = ratings?.filter((r) => r.rating === 'ok') || []

  // "core" = het smaakprofiel van favorieten + "echt leuk"; "ok" telt pas mee
  // als aanbevelingsbron vanaf de "balanced"-modus (zie MODE_CONFIG).
  const profileSources: ProfileSource[] = [
    ...favorites.map((f): ProfileSource => ({ tmdb_id: f.tmdb_id, title: f.title, media_type: f.media_type, weight: 1, tier: 'core' })),
    ...lovedItems.map((r): ProfileSource => ({ tmdb_id: r.tmdb_id, title: r.title, media_type: r.media_type, weight: 2, tier: 'core' })),
    ...okItems.map((r): ProfileSource => ({ tmdb_id: r.tmdb_id, title: r.title, media_type: r.media_type, weight: 0.5, tier: 'ok' })),
  ]

  // Genre-affiniteit, vervolgdelen en het smaak-embedding (hieronder) blijven altijd
  // gebaseerd op favorieten + "echt leuk" ("core"), ook bij bredere modi — "OK" telt
  // daar dus nooit in mee, alleen in de directe titel-aanbevelingen (okScore) hierboven.
  const coreSources = profileSources.filter((s) => s.tier === 'core')

  const [sourceDetails, recommendationPagesByKey] = await Promise.all([
    Promise.all(
      coreSources.map(async (source): Promise<SourceDetail> => ({
        ...source,
        ...(await getCachedDetails(supabase, source.media_type, source.tmdb_id)),
      }))
    ),
    getRecommendationPagesBulk(
      supabase,
      profileSources.flatMap((source) =>
        RECOMMENDATION_PAGES.map((page) => ({ mediaType: source.media_type, tmdbId: source.tmdb_id, page }))
      )
    ),
  ])
  const titleRecommendationLists = profileSources.flatMap((source) =>
    RECOMMENDATION_PAGES.map((page) => ({
      results: recommendationPagesByKey.get(`${source.media_type}-${source.tmdb_id}-${page}`) || [],
      weight: source.weight,
      sourceTitle: source.title,
      tier: source.tier,
    }))
  )

  const genreCounts: Record<MediaType, Map<number, { name: string; count: number }>> = {
    movie: new Map(),
    tv: new Map(),
  }
  for (const source of sourceDetails) {
    const bucket = genreCounts[source.media_type]
    for (const genre of source.genres) {
      const existing = bucket.get(genre.id)
      if (existing) existing.count += source.weight
      else bucket.set(genre.id, { name: genre.name, count: source.weight })
    }
  }

  function allGenres(mediaType: MediaType) {
    return Array.from(genreCounts[mediaType].entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count)
  }

  const movieGenres = allGenres('movie')
  const tvGenres = allGenres('tv')

  async function discoverByGenres(mediaType: MediaType, genres: { id: number; name: string }[]) {
    if (genres.length === 0) return { results: [] as TmdbItem[], label: '' }
    const topGenres = genres.slice(0, DISCOVER_GENRE_LIMIT)
    // "or2" bumpt de cache-sleutel zodat oude, te smalle resultaten (van vóór de
    // EN/OF-fix hieronder) niet per ongeluk nog een paar uur worden hergebruikt.
    const genreKey = `or2:${topGenres.map((g) => g.id).sort((a, b) => a - b).join(',')}`
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie'

    const pages = await Promise.all(
      DISCOVER_PAGES.map((page) =>
        getCachedDiscoverPage(supabase, mediaType, genreKey, page, async () => {
          try {
            // Pipe (|) = "OF": een titel met minstens één van je topgenres. Met een komma
            // (TMDB's EN-logica) zou een titel ALLE topgenres tegelijk moeten hebben —
            // met 5 genres is die doorsnede vrijwel altijd leeg.
            const ids = topGenres.map((g) => g.id).join('|')
            const res = await fetch(
              `https://api.themoviedb.org/3/discover/${endpoint}?with_genres=${ids}&sort_by=popularity.desc&vote_count.gte=100&language=nl-NL&page=${page}`,
              { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
            )
            if (!res.ok) return null
            const data = await res.json()
            return mapTmdbResults(data.results || [], mediaType)
          } catch {
            return null
          }
        })
      )
    )

    const seen = new Set<number>()
    const results: TmdbItem[] = []
    for (const page of pages) {
      for (const item of page) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        results.push(item)
      }
    }

    return { results, label: `jouw voorkeur voor ${topGenres.slice(0, 3).map((g) => g.name).join(', ')}` }
  }

  const uniqueCollections = new Map<number, string>()
  for (const source of sourceDetails) {
    if (source.media_type === 'movie' && source.collectionId) {
      uniqueCollections.set(source.collectionId, source.collectionName || 'deze collectie')
    }
  }

  const [movieGenreResults, tvGenreResults, collectionResults] = await Promise.all([
    discoverByGenres('movie', movieGenres),
    discoverByGenres('tv', tvGenres),
    Promise.all(
      Array.from(uniqueCollections.entries()).map(async ([collectionId, collectionName]) => {
        const parts = await getCachedCollectionParts(supabase, collectionId)
        return { results: parts, label: `Onderdeel van ${collectionName}` }
      })
    ),
  ])

  const scoreMap = new Map<string, ScoredCandidate>()

  function ensureEntry(item: TmdbItem): ScoredCandidate {
    const key = `${item.media_type}-${item.id}`
    if (!scoreMap.has(key)) {
      scoreMap.set(key, {
        ...item,
        coreScore: 0,
        okScore: 0,
        discoverScore: 0,
        collectionScore: 0,
        embeddingBonus: 0,
        basedOn: new Set<string>(),
      })
    }
    return scoreMap.get(key)!
  }

  function addScore(items: TmdbItem[], field: ScoreField, weight: number, label: string) {
    for (const item of items) {
      const key = `${item.media_type}-${item.id}`
      if (excludeIds.has(key)) continue
      const entry = ensureEntry(item)
      entry[field] += weight
      if (label) entry.basedOn.add(label)
    }
  }

  for (const list of titleRecommendationLists) {
    addScore(list.results, list.tier === 'core' ? 'coreScore' : 'okScore', list.weight, list.sourceTitle)
  }
  addScore(movieGenreResults.results, 'discoverScore', 1, movieGenreResults.label)
  addScore(tvGenreResults.results, 'discoverScore', 1, tvGenreResults.label)
  for (const collection of collectionResults) {
    addScore(collection.results, 'collectionScore', COLLECTION_WEIGHT, collection.label)
  }

  const collectionKeys = new Set<string>()
  for (const collection of collectionResults) {
    for (const item of collection.results) {
      const key = `${item.media_type}-${item.id}`
      if (!excludeIds.has(key)) collectionKeys.add(key)
    }
  }

  const candidates = Array.from(scoreMap.values())

  const sourceEmbeddingItems = sourceDetails
    .filter((s) => s.overview)
    .map((s) => ({ media_type: s.media_type, tmdb_id: s.tmdb_id, text: `${s.title}. ${s.overview}`, weight: s.weight }))

  const sourceEmbeddings = await getEmbeddingsForItems(
    supabase,
    sourceEmbeddingItems.map(({ media_type, tmdb_id, text }) => ({ media_type, tmdb_id, text }))
  )

  let userVector: number[] = []
  let totalWeight = 0
  for (const item of sourceEmbeddingItems) {
    const vec = sourceEmbeddings.get(`${item.media_type}-${item.tmdb_id}`)
    if (!vec || vec.length === 0) continue
    if (userVector.length === 0) userVector = vec.map((v) => v * item.weight)
    else userVector = userVector.map((v, i) => v + vec[i] * item.weight)
    totalWeight += item.weight
  }
  if (totalWeight > 0) userVector = userVector.map((v) => v / totalWeight)

  if (userVector.length > 0) {
    const candidateEmbeddingItems = candidates
      .filter((c) => c.overview)
      .map((c) => ({ media_type: c.media_type, tmdb_id: c.id, text: `${c.title}. ${c.overview}` }))

    const candidateEmbeddings = await getEmbeddingsForItems(supabase, candidateEmbeddingItems)

    for (const candidate of candidates) {
      const vec = candidateEmbeddings.get(`${candidate.media_type}-${candidate.id}`)
      if (!vec || vec.length === 0) continue
      const similarity = cosineSimilarity(userVector, vec)
      candidate.embeddingBonus = similarity
      if (similarity > 0.5) candidate.basedOn.add('vergelijkbare verhaallijn')
    }
  }

  const movieGenreIds = movieGenres.slice(0, ROUND_ROBIN_GENRE_LIMIT).map((g) => g.id)
  const tvGenreIds = tvGenres.slice(0, ROUND_ROBIN_GENRE_LIMIT).map((g) => g.id)

  function buildModeResults(mode: RecommendationMode, excludeKeys: Set<string>): RankedCandidate[] {
    const modeConfig = MODE_CONFIG[mode]

    // Titels die al in een smaller/eerder tabblad staan, komen hier niet nog eens in
    // — anders zie je "zeker leuk" ook terug bij "oké" en "verras me".
    const availableCandidates = candidates.filter((item) => !excludeKeys.has(`${item.media_type}-${item.id}`))

    const allScored: RankedCandidate[] = availableCandidates.map((item) => {
      const rawScore =
        item.coreScore +
        (modeConfig.includeOkAsSource ? item.okScore : 0) +
        item.discoverScore * modeConfig.discoverWeight +
        item.collectionScore +
        item.embeddingBonus * EMBEDDING_BONUS_WEIGHT
      return {
        ...item,
        score: Math.pow(Math.log2(1 + Math.max(0, rawScore)), modeConfig.dampingFactor),
        basedOn: Array.from(item.basedOn).slice(0, 3),
      }
    })

    const forcedMovies = allScored.filter((m) => m.media_type === 'movie' && collectionKeys.has(`movie-${m.id}`))
    const forcedTv = allScored.filter((m) => m.media_type === 'tv' && collectionKeys.has(`tv-${m.id}`))

    const roundRobinMovies = pickByGenreRoundRobin(
      allScored.filter((m) => m.media_type === 'movie' && !collectionKeys.has(`movie-${m.id}`)),
      movieGenreIds,
      (m) => `movie-${m.id}`,
      (m) => m.genre_ids || [],
      modeConfig.maxPerGenre
    )
    const roundRobinTv = pickByGenreRoundRobin(
      allScored.filter((m) => m.media_type === 'tv' && !collectionKeys.has(`tv-${m.id}`)),
      tvGenreIds,
      (m) => `tv-${m.id}`,
      (m) => m.genre_ids || [],
      modeConfig.maxPerGenre
    )

    const usedKeys = new Set<string>([
      ...forcedMovies.map((m) => `movie-${m.id}`),
      ...roundRobinMovies.map((m) => `movie-${m.id}`),
      ...forcedTv.map((m) => `tv-${m.id}`),
      ...roundRobinTv.map((m) => `tv-${m.id}`),
    ])

    const longTailMovies = pickLongTail(
      allScored.filter((m) => m.media_type === 'movie'),
      usedKeys,
      (m) => `movie-${m.id}`,
      Math.ceil(modeConfig.longTailSlots / 2)
    )
    const longTailTv = pickLongTail(
      allScored.filter((m) => m.media_type === 'tv'),
      usedKeys,
      (m) => `tv-${m.id}`,
      Math.floor(modeConfig.longTailSlots / 2)
    )

    return [
      ...forcedMovies, ...roundRobinMovies, ...longTailMovies,
      ...forcedTv, ...roundRobinTv, ...longTailTv,
    ]
  }

  // Volgorde smal -> breed: elke volgende modus sluit de titels van de vorige(n) uit.
  const focusedResults = buildModeResults('focused', new Set())
  const focusedKeys = new Set(focusedResults.map((m) => `${m.media_type}-${m.id}`))

  const balancedResults = buildModeResults('balanced', focusedKeys)
  const balancedKeys = new Set(balancedResults.map((m) => `${m.media_type}-${m.id}`))

  const exploreResults = buildModeResults('explore', new Set([...focusedKeys, ...balancedKeys]))

  const sortedByMode: Record<RecommendationMode, RankedCandidate[]> = {
    focused: focusedResults,
    balanced: balancedResults,
    explore: exploreResults,
  }

  const userServices: string[] = profile?.streaming_services || []
  const userSourceIds = new Set(userServices.map((s) => SOURCE_IDS[s]).filter(Boolean))

  if (userSourceIds.size === 0) {
    return NextResponse.json(sortedByMode)
  }

  // Eén candidate kan in meerdere modi voorkomen; beschikbaarheid per streamingdienst
  // hoeft dan ook maar één keer per titel opgehaald te worden, niet drie keer.
  const allCandidateItems = new Map<string, RankedCandidate>()
  for (const mode of MODES) {
    for (const item of sortedByMode[mode]) {
      allCandidateItems.set(`${item.media_type}-${item.id}`, item)
    }
  }

  const providersByKey = await getWatchProvidersBulk(
    supabase,
    Array.from(allCandidateItems.values()).map((item) => ({ mediaType: item.media_type, tmdbId: item.id }))
  )

  const watchInfoEntries = Array.from(allCandidateItems.values()).map((item) => {
    const key = `${item.media_type}-${item.id}`
    const itemSources = providersByKey.get(key) || []
    const userMatches = itemSources.filter((s) => userSourceIds.has(s.provider_id))
    if (userMatches.length === 0) return [key, null] as const

    const subMatch = userMatches.find((s) => s.type === 'sub')
    const rentMatch = userMatches
      .filter((s) => s.type === 'rent')
      .sort((a, b) => (a.price ?? 999) - (b.price ?? 999))[0]
    const buyMatch = userMatches
      .filter((s) => s.type === 'buy')
      .sort((a, b) => (a.price ?? 999) - (b.price ?? 999))[0]

    const best = subMatch || rentMatch || buyMatch
    if (!best) return [key, null] as const

    let watchOn = best.name
    if (best.type === 'rent') watchOn = `${best.name} · huren${best.price ? ` €${best.price}` : ''}`
    if (best.type === 'buy') watchOn = `${best.name} · kopen${best.price ? ` €${best.price}` : ''}`

    return [key, { watchOn, watchUrl: best.web_url }] as const
  })
  const watchInfoMap = new Map(watchInfoEntries)

  const result: Record<RecommendationMode, RecommendationItem[]> = { focused: [], balanced: [], explore: [] }
  for (const mode of MODES) {
    result[mode] = sortedByMode[mode]
      .map((item): RecommendationItem | null => {
        const info = watchInfoMap.get(`${item.media_type}-${item.id}`)
        if (!info) return null
        return { ...item, ...info }
      })
      .filter((m): m is RecommendationItem => m !== null)
  }

  return NextResponse.json(result)
}
