import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SOURCE_IDS: Record<string, number> = {
  netflix: 203,
  videoland: 465,
  disney_plus: 372,
  amazon_prime: 68,
  hbo_max: 454,
}

const WATCHMODE_CACHE_MAX_AGE_HOURS = 24
const TMDB_DETAILS_CACHE_MAX_AGE_HOURS = 24 * 7
const RECOMMENDATIONS_CACHE_MAX_AGE_HOURS = 24
const DISCOVER_CACHE_MAX_AGE_HOURS = 12
const COLLECTION_CACHE_MAX_AGE_HOURS = 24 * 7
const VOYAGE_MODEL = 'voyage-4-lite'
const EMBEDDING_BONUS_WEIGHT = 2
const COLLECTION_WEIGHT = 3
const MAX_PER_GENRE = 5
const DISCOVER_GENRE_LIMIT = 5
const DISCOVER_PAGES = [1, 2]
const RECOMMENDATION_PAGES = [1, 2, 3]

type RecommendationMode = 'focused' | 'balanced' | 'explore'
const MODES: RecommendationMode[] = ['focused', 'balanced', 'explore']

// "focused" telt alleen scores op van favorieten/"echt leuk"; "OK"-getagde titels
// tellen pas mee als aanbevelingsbron vanaf "balanced". "explore" haalt daarnaast
// bewust een bredere discover-pool op (zie DISCOVER_GENRE_LIMIT/DISCOVER_PAGES) en
// dempt de scores sterker, zodat de long tail niet wordt overstemd door de bekende titels.
const MODE_CONFIG: Record<RecommendationMode, {
  includeOkAsSource: boolean
  discoverWeight: number
  dampingFactor: number
  longTailSlots: number
}> = {
  focused:  { includeOkAsSource: false, discoverWeight: 0.4,  dampingFactor: 1.0, longTailSlots: 0 },
  balanced: { includeOkAsSource: true,  discoverWeight: 0.75, dampingFactor: 1.0, longTailSlots: 2 },
  explore:  { includeOkAsSource: true,  discoverWeight: 1.5,  dampingFactor: 0.6, longTailSlots: 5 },
}

async function getCached<T>(
  supabase: any,
  table: string,
  match: Record<string, string | number>,
  column: string,
  maxAgeHours: number,
  fetcher: () => Promise<T>
): Promise<T> {
  let query = supabase.from(table).select(`${column}, fetched_at`)
  for (const [key, value] of Object.entries(match)) query = query.eq(key, value)
  const { data: cached } = await query.single()

  if (cached) {
    const ageHours = (Date.now() - new Date(cached.fetched_at).getTime()) / (1000 * 60 * 60)
    if (ageHours < maxAgeHours) return cached[column]
  }

  const fresh = await fetcher()
  await supabase.from(table).upsert(
    { ...match, [column]: fresh, fetched_at: new Date().toISOString() },
    { onConflict: Object.keys(match).join(',') }
  )
  return fresh
}

async function getWatchmodeSources(supabase: any, mediaType: string, tmdbId: number) {
  return getCached(
    supabase,
    'watchmode_cache',
    { media_type: mediaType, tmdb_id: tmdbId },
    'sources',
    WATCHMODE_CACHE_MAX_AGE_HOURS,
    async () => {
      try {
        const res = await fetch(
          `https://api.watchmode.com/v1/title/${mediaType}-${tmdbId}/sources/?apiKey=${process.env.WATCHMODE_API_KEY}&regions=NL`
        )
        if (!res.ok) return []
        const sources = await res.json()
        return Array.isArray(sources) ? sources : []
      } catch {
        return []
      }
    }
  )
}

async function fetchDetails(mediaType: string, tmdbId: number): Promise<{
  genres: { id: number; name: string }[]
  overview: string
  collectionId: number | null
  collectionName: string | null
}> {
  const endpoint = mediaType === 'tv' ? 'tv' : 'movie'
  try {
    const res = await fetch(`https://api.themoviedb.org/3/${endpoint}/${tmdbId}?language=nl-NL`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
    })
    const data = await res.json()
    return {
      genres: data.genres || [],
      overview: data.overview || '',
      collectionId: data.belongs_to_collection?.id ?? null,
      collectionName: data.belongs_to_collection?.name ?? null,
    }
  } catch {
    return { genres: [], overview: '', collectionId: null, collectionName: null }
  }
}

async function getCachedDetails(supabase: any, mediaType: string, tmdbId: number) {
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

function mapTmdbResults(results: any[], mediaType: string) {
  return (results || []).map((item: any) => ({
    id: item.id,
    title: item.title || item.name,
    poster_path: item.poster_path,
    vote_average: item.vote_average,
    overview: item.overview || '',
    media_type: mediaType,
    genre_ids: item.genre_ids || [],
  }))
}

function getCachedRecommendationPage(
  supabase: any,
  mediaType: string,
  tmdbId: number,
  page: number,
  fetcher: () => Promise<any[]>
) {
  return getCached(
    supabase,
    'tmdb_recommendations_cache',
    { media_type: mediaType, tmdb_id: tmdbId, page },
    'results',
    RECOMMENDATIONS_CACHE_MAX_AGE_HOURS,
    fetcher
  )
}

function getCachedDiscoverPage(
  supabase: any,
  mediaType: string,
  genreKey: string,
  page: number,
  fetcher: () => Promise<any[]>
) {
  return getCached(
    supabase,
    'tmdb_discover_cache',
    { media_type: mediaType, genre_key: genreKey, page },
    'results',
    DISCOVER_CACHE_MAX_AGE_HOURS,
    fetcher
  )
}

async function fetchCollectionParts(collectionId: number): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/collection/${collectionId}?language=nl-NL`,
      { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
    )
    const data = await res.json()
    return mapTmdbResults(data.parts || [], 'movie')
  } catch {
    return []
  }
}

function getCachedCollectionParts(supabase: any, collectionId: number) {
  return getCached(
    supabase,
    'tmdb_collection_cache',
    { collection_id: collectionId },
    'parts',
    COLLECTION_CACHE_MAX_AGE_HOURS,
    () => fetchCollectionParts(collectionId)
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
        return (data.data || []).map((item: any) => item.embedding)
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
  supabase: any,
  items: { media_type: string; tmdb_id: number; text: string }[]
): Promise<Map<string, number[]>> {
  const result = new Map<string, number[]>()

  const movieIds = items.filter((i) => i.media_type === 'movie').map((i) => i.tmdb_id)
  const tvIds = items.filter((i) => i.media_type === 'tv').map((i) => i.tmdb_id)

  const [movieRows, tvRows] = await Promise.all([
    movieIds.length
      ? supabase.from('title_embeddings').select('tmdb_id, embedding').eq('media_type', 'movie').in('tmdb_id', movieIds)
      : Promise.resolve({ data: [] }),
    tvIds.length
      ? supabase.from('title_embeddings').select('tmdb_id, embedding').eq('media_type', 'tv').in('tmdb_id', tvIds)
      : Promise.resolve({ data: [] }),
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

function pickByGenreRoundRobin(
  candidates: any[],
  relevantGenreIds: number[],
  keyFn: (i: any) => string,
  genresFn: (i: any) => number[],
  perGenre: number
) {
  const genreGroups = new Map<number, any[]>()
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
  const result: any[] = []

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

function pickLongTail(
  scoredItems: any[],
  usedKeys: Set<string>,
  keyFn: (i: any) => string,
  count: number
) {
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

  const { data: favorites } = await supabase
    .from('favorite_movies')
    .select('tmdb_id, title, media_type')
    .eq('user_id', user.id)

  const { data: ratings } = await supabase
    .from('ratings')
    .select('tmdb_id, title, rating, media_type')
    .eq('user_id', user.id)

  const { data: watchlist } = await supabase
    .from('watchlist')
    .select('tmdb_id, media_type')
    .eq('user_id', user.id)

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
  const profileSources = [
    ...favorites.map((f) => ({ tmdb_id: f.tmdb_id, title: f.title, media_type: f.media_type, weight: 1, tier: 'core' as const })),
    ...lovedItems.map((r) => ({ tmdb_id: r.tmdb_id, title: r.title, media_type: r.media_type, weight: 2, tier: 'core' as const })),
    ...okItems.map((r) => ({ tmdb_id: r.tmdb_id, title: r.title, media_type: r.media_type, weight: 0.5, tier: 'ok' as const })),
  ]

  const [sourceDetails, titleRecommendationLists] = await Promise.all([
    Promise.all(
      profileSources.map(async (source) => ({
        ...source,
        ...(await getCachedDetails(supabase, source.media_type, source.tmdb_id)),
      }))
    ),
    Promise.all(
      profileSources.flatMap((source) =>
        RECOMMENDATION_PAGES.map(async (page) => {
          const endpoint = source.media_type === 'tv' ? 'tv' : 'movie'
          const results = await getCachedRecommendationPage(supabase, source.media_type, source.tmdb_id, page, async () => {
            const res = await fetch(
              `https://api.themoviedb.org/3/${endpoint}/${source.tmdb_id}/recommendations?language=nl-NL&page=${page}`,
              { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
            )
            const data = await res.json()
            return mapTmdbResults(data.results || [], source.media_type)
          })
          return { results, weight: source.weight, sourceTitle: source.title, tier: source.tier }
        })
      )
    ),
  ])

  const genreCounts: Record<'movie' | 'tv', Map<number, { name: string; count: number }>> = {
    movie: new Map(),
    tv: new Map(),
  }
  for (const source of sourceDetails) {
    const bucket = genreCounts[source.media_type as 'movie' | 'tv']
    for (const genre of source.genres) {
      const existing = bucket.get(genre.id)
      if (existing) existing.count += source.weight
      else bucket.set(genre.id, { name: genre.name, count: source.weight })
    }
  }

  function allGenres(mediaType: 'movie' | 'tv') {
    return Array.from(genreCounts[mediaType].entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count)
  }

  const movieGenres = allGenres('movie')
  const tvGenres = allGenres('tv')

  async function discoverByGenres(mediaType: 'movie' | 'tv', genres: { id: number; name: string }[]) {
    if (genres.length === 0) return { results: [], label: '' }
    const topGenres = genres.slice(0, DISCOVER_GENRE_LIMIT)
    const genreKey = topGenres.map((g) => g.id).sort((a, b) => a - b).join(',')
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie'

    const pages = await Promise.all(
      DISCOVER_PAGES.map((page) =>
        getCachedDiscoverPage(supabase, mediaType, genreKey, page, async () => {
          const ids = topGenres.map((g) => g.id).join(',')
          const res = await fetch(
            `https://api.themoviedb.org/3/discover/${endpoint}?with_genres=${ids}&sort_by=popularity.desc&vote_count.gte=100&language=nl-NL&page=${page}`,
            { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
          )
          const data = await res.json()
          return mapTmdbResults(data.results || [], mediaType)
        })
      )
    )

    const seen = new Set<number>()
    const results: any[] = []
    for (const page of pages) {
      for (const item of page) {
        if (seen.has(item.id)) continue
        seen.add(item.id)
        results.push(item)
      }
    }

    return { results, label: `jouw voorkeur voor ${topGenres.slice(0, 3).map((g) => g.name).join(', ')}` }
  }

  // Onvertoonde vervolgfilms/-series (zoals The Matrix 2/3) horen bij je "echt leuk"-smaak,
  // dus die zoeken we alleen op basis van favorieten + "echt leuk", niet op basis van "OK".
  const uniqueCollections = new Map<number, string>()
  for (const source of sourceDetails) {
    if (source.tier === 'core' && source.media_type === 'movie' && source.collectionId) {
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

  const scoreMap = new Map<string, any>()

  function ensureEntry(item: any) {
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
    return scoreMap.get(key)
  }

  function addScore(
    items: any[],
    field: 'coreScore' | 'okScore' | 'discoverScore' | 'collectionScore',
    weight: number,
    label: string
  ) {
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

  const movieGenreIds = movieGenres.map((g) => g.id)
  const tvGenreIds = tvGenres.map((g) => g.id)

  function buildModeResults(mode: RecommendationMode) {
    const modeConfig = MODE_CONFIG[mode]

    const allScored = candidates.map((item) => {
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
      MAX_PER_GENRE
    )
    const roundRobinTv = pickByGenreRoundRobin(
      allScored.filter((m) => m.media_type === 'tv' && !collectionKeys.has(`tv-${m.id}`)),
      tvGenreIds,
      (m) => `tv-${m.id}`,
      (m) => m.genre_ids || [],
      MAX_PER_GENRE
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

  const sortedByMode: Record<RecommendationMode, any[]> = {
    focused: buildModeResults('focused'),
    balanced: buildModeResults('balanced'),
    explore: buildModeResults('explore'),
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('streaming_services')
    .eq('id', user.id)
    .single()

  const userServices: string[] = profile?.streaming_services || []
  const userSourceIds = new Set(userServices.map((s) => SOURCE_IDS[s]).filter(Boolean))

  if (userSourceIds.size === 0) {
    return NextResponse.json(sortedByMode)
  }

  // Eén candidate kan in meerdere modi voorkomen; beschikbaarheid per streamingdienst
  // hoeft dan ook maar één keer per titel opgehaald te worden, niet drie keer.
  const allCandidateItems = new Map<string, any>()
  for (const mode of MODES) {
    for (const item of sortedByMode[mode]) {
      allCandidateItems.set(`${item.media_type}-${item.id}`, item)
    }
  }

  const watchInfoEntries = await Promise.all(
    Array.from(allCandidateItems.values()).map(async (item) => {
      const key = `${item.media_type}-${item.id}`
      const itemSources = await getWatchmodeSources(supabase, item.media_type, item.id)
      const userMatches = itemSources.filter((s: any) => userSourceIds.has(s.source_id))
      if (userMatches.length === 0) return [key, null] as const

      const subMatch = userMatches.find((s: any) => s.type === 'sub')
      const rentMatch = userMatches
        .filter((s: any) => s.type === 'rent')
        .sort((a: any, b: any) => (a.price ?? 999) - (b.price ?? 999))[0]
      const buyMatch = userMatches
        .filter((s: any) => s.type === 'buy')
        .sort((a: any, b: any) => (a.price ?? 999) - (b.price ?? 999))[0]

      const best = subMatch || rentMatch || buyMatch
      if (!best) return [key, null] as const

      let watchOn = best.name
      if (best.type === 'rent') watchOn = `${best.name} · huren${best.price ? ` €${best.price}` : ''}`
      if (best.type === 'buy') watchOn = `${best.name} · kopen${best.price ? ` €${best.price}` : ''}`

      return [key, { watchOn, watchUrl: best.web_url }] as const
    })
  )
  const watchInfoMap = new Map(watchInfoEntries)

  const result: Record<RecommendationMode, any[]> = { focused: [], balanced: [], explore: [] }
  for (const mode of MODES) {
    result[mode] = sortedByMode[mode]
      .map((item) => {
        const info = watchInfoMap.get(`${item.media_type}-${item.id}`)
        if (!info) return null
        return { ...item, ...info }
      })
      .filter((m): m is any => m !== null)
  }

  return NextResponse.json(result)
}
