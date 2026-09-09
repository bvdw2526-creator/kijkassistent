import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SOURCE_IDS: Record<string, number> = {
  netflix: 203,
  videoland: 465,
  disney_plus: 372,
  amazon_prime: 68,
  hbo_max: 454,
}

const CACHE_MAX_AGE_HOURS = 24
const VOYAGE_MODEL = 'voyage-4-lite'
const EMBEDDING_BONUS_WEIGHT = 2
const COLLECTION_WEIGHT = 3
const MAX_PER_GENRE = 5
const RECENTLY_SHOWN_DAYS = 14
const SHOWN_RETENTION_DAYS = 60

type RecommendationMode = 'focused' | 'balanced' | 'explore'

const MODE_CONFIG: Record<RecommendationMode, {
  includeOkRatings: boolean
  discoverWeight: number
  dampingFactor: number
  longTailSlots: number
}> = {
  focused:  { includeOkRatings: false, discoverWeight: 0.4,  dampingFactor: 1.0, longTailSlots: 0 },
  balanced: { includeOkRatings: true,  discoverWeight: 0.75, dampingFactor: 1.0, longTailSlots: 2 },
  explore:  { includeOkRatings: true,  discoverWeight: 1.5,  dampingFactor: 0.6, longTailSlots: 5 },
}

async function getWatchmodeSources(supabase: any, mediaType: string, tmdbId: number) {
  const { data: cached } = await supabase
    .from('watchmode_cache')
    .select('sources, fetched_at')
    .eq('media_type', mediaType)
    .eq('tmdb_id', tmdbId)
    .single()

  if (cached) {
    const ageHours = (Date.now() - new Date(cached.fetched_at).getTime()) / (1000 * 60 * 60)
    if (ageHours < CACHE_MAX_AGE_HOURS) {
      return cached.sources
    }
  }

  try {
    const res = await fetch(
      `https://api.watchmode.com/v1/title/${mediaType}-${tmdbId}/sources/?apiKey=${process.env.WATCHMODE_API_KEY}&regions=NL`
    )
    if (!res.ok) return []
    const sources = await res.json()
    const sourcesArray = Array.isArray(sources) ? sources : []
    await supabase.from('watchmode_cache').upsert(
      { media_type: mediaType, tmdb_id: tmdbId, sources: sourcesArray, fetched_at: new Date().toISOString() },
      { onConflict: 'media_type,tmdb_id' }
    )
    return sourcesArray
  } catch {
    return []
  }
}

async function getDetails(mediaType: string, tmdbId: number): Promise<{
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

async function getCollectionParts(collectionId: number): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/collection/${collectionId}?language=nl-NL`,
      { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
    )
    const data = await res.json()
    return (data.parts || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      poster_path: item.poster_path,
      vote_average: item.vote_average,
      overview: item.overview || '',
      media_type: 'movie',
      genre_ids: item.genre_ids || [],
    }))
  } catch {
    return []
  }
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const chunks: string[][] = []
  for (let i = 0; i < texts.length; i += 100) chunks.push(texts.slice(i, i + 100))

  const results: number[][] = []
  for (const chunk of chunks) {
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
      for (const item of data.data || []) results.push(item.embedding)
    } catch {
      for (let i = 0; i < chunk.length; i++) results.push([])
    }
  }
  return results
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
  perGenre: number,
  recentlyShownIds: Set<string>
) {
  const genreGroups = new Map<number, any[]>()
  for (const genreId of relevantGenreIds) genreGroups.set(genreId, [])

  for (const item of candidates) {
    const itemGenres = genresFn(item)
    for (const g of itemGenres) {
      if (genreGroups.has(g)) genreGroups.get(g)!.push(item)
    }
  }
  // Verse titels eerst, recent getoonde titels als tweede keuze (niet uitgesloten,
  // alleen afgeprijsd in volgorde) — zo raakt de pool nooit leeg, maar krijgen
  // nieuwe titels wel voorrang zolang die er zijn.
  for (const list of genreGroups.values()) {
    list.sort((a, b) => {
      const aRecent = recentlyShownIds.has(keyFn(a)) ? 1 : 0
      const bRecent = recentlyShownIds.has(keyFn(b)) ? 1 : 0
      if (aRecent !== bRecent) return aRecent - bRecent
      return b.score - a.score
    })
  }

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

function shuffle(items: any[]) {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function pickLongTail(
  scoredItems: any[],
  usedKeys: Set<string>,
  keyFn: (i: any) => string,
  count: number,
  recentlyShownIds: Set<string>
) {
  if (count <= 0) return []
  const pool = scoredItems.filter((i) => !usedKeys.has(keyFn(i)))
  const fresh = shuffle(pool.filter((i) => !recentlyShownIds.has(keyFn(i))))
  const recent = shuffle(pool.filter((i) => recentlyShownIds.has(keyFn(i))))
  return [...fresh, ...recent].slice(0, count).map((item) => ({
    ...item,
    basedOn: [...item.basedOn, 'verrassing'],
  }))
}

export async function GET(request: NextRequest) {
  const modeParam = request.nextUrl.searchParams.get('mode')
  const mode: RecommendationMode =
    modeParam === 'focused' || modeParam === 'explore' ? modeParam : 'balanced'
  const modeConfig = MODE_CONFIG[mode]

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

  const { data: recentlyShown } = await supabase
    .from('shown_recommendations')
    .select('tmdb_id, media_type')
    .eq('user_id', user.id)
    .gte('shown_at', new Date(Date.now() - RECENTLY_SHOWN_DAYS * 24 * 60 * 60 * 1000).toISOString())

  const recentlyShownIds = new Set(
    (recentlyShown || []).map((r: any) => `${r.media_type}-${r.tmdb_id}`)
  )

  // Oude "getoond"-rijen opruimen, niet blokkerend voor de rest van de request
  supabase
    .from('shown_recommendations')
    .delete()
    .eq('user_id', user.id)
    .lt('shown_at', new Date(Date.now() - SHOWN_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString())
    .then(() => {})

  if (!favorites || favorites.length === 0) {
    return NextResponse.json({ results: [] })
  }

  // Let op: recentlyShownIds zit hier bewust NIET in. Titels die je al gezien/beoordeeld
  // hebt (favorieten/ratings/watchlist) sluiten we hard uit, maar "recent aanbevolen" is
  // een zachte voorkeur, geen harde uitsluiting — anders kan de kandidatenpool bij een
  // klein smaakprofiel leeglopen na een paar testrondes.
  const excludeIds = new Set([
    ...favorites.map((f) => `${f.media_type}-${f.tmdb_id}`),
    ...(ratings?.map((r) => `${r.media_type}-${r.tmdb_id}`) || []),
    ...(watchlist?.map((w) => `${w.media_type}-${w.tmdb_id}`) || []),
  ])

  const lovedItems = ratings?.filter((r) => r.rating === 'love') || []
  const okItems = modeConfig.includeOkRatings
    ? ratings?.filter((r) => r.rating === 'ok') || []
    : []

  const profileSources = [
    ...favorites.map((f) => ({ tmdb_id: f.tmdb_id, title: f.title, media_type: f.media_type, weight: 1 })),
    ...lovedItems.map((r) => ({ tmdb_id: r.tmdb_id, title: r.title, media_type: r.media_type, weight: 2 })),
    ...okItems.map((r) => ({ tmdb_id: r.tmdb_id, title: r.title, media_type: r.media_type, weight: 0.5 })),
  ]

  const sourceDetails = await Promise.all(
    profileSources.map(async (source) => ({
      ...source,
      ...(await getDetails(source.media_type, source.tmdb_id)),
    }))
  )

  const titleRecommendationLists = await Promise.all(
    sourceDetails.flatMap((source) =>
      [1, 2, 3].map(async (page) => {
        const endpoint = source.media_type === 'tv' ? 'tv' : 'movie'
        const res = await fetch(
          `https://api.themoviedb.org/3/${endpoint}/${source.tmdb_id}/recommendations?language=nl-NL&page=${page}`,
          { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
        )
        const data = await res.json()
        const results = (data.results || []).map((item: any) => ({
          id: item.id,
          title: item.title || item.name,
          poster_path: item.poster_path,
          vote_average: item.vote_average,
          overview: item.overview || '',
          media_type: source.media_type,
          genre_ids: item.genre_ids || [],
        }))
        return { results, weight: source.weight, sourceTitle: source.title }
      })
    )
  )

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
    const ids = genres.slice(0, 3).map((g) => g.id).join(',')
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie'
    const res = await fetch(
      `https://api.themoviedb.org/3/discover/${endpoint}?with_genres=${ids}&sort_by=popularity.desc&vote_count.gte=100&language=nl-NL&page=1`,
      { headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` } }
    )
    const data = await res.json()
    const results = (data.results || []).map((item: any) => ({
      id: item.id,
      title: item.title || item.name,
      poster_path: item.poster_path,
      vote_average: item.vote_average,
      overview: item.overview || '',
      media_type: mediaType,
      genre_ids: item.genre_ids || [],
    }))
    return { results, label: `jouw voorkeur voor ${genres.slice(0, 3).map((g) => g.name).join(', ')}` }
  }

  const [movieGenreResults, tvGenreResults] = await Promise.all([
    discoverByGenres('movie', movieGenres),
    discoverByGenres('tv', tvGenres),
  ])

  const uniqueCollections = new Map<number, string>()
  for (const source of sourceDetails) {
    if (source.media_type === 'movie' && source.collectionId) {
      uniqueCollections.set(source.collectionId, source.collectionName || 'deze collectie')
    }
  }

  const collectionResults = await Promise.all(
    Array.from(uniqueCollections.entries()).map(async ([collectionId, collectionName]) => {
      const parts = await getCollectionParts(collectionId)
      return { results: parts, label: `Onderdeel van ${collectionName}` }
    })
  )

  const scoreMap = new Map<string, any>()
  function addToScoreMap(items: any[], weight: number, sourceLabel: string) {
    for (const item of items) {
      const key = `${item.media_type}-${item.id}`
      if (excludeIds.has(key)) continue
      if (!scoreMap.has(key)) scoreMap.set(key, { ...item, score: 0, basedOn: new Set<string>() })
      const entry = scoreMap.get(key)
      entry.score += weight
      if (sourceLabel) entry.basedOn.add(sourceLabel)
    }
  }
  for (const list of titleRecommendationLists) addToScoreMap(list.results, list.weight, list.sourceTitle)
  addToScoreMap(movieGenreResults.results, modeConfig.discoverWeight, movieGenreResults.label)
  addToScoreMap(tvGenreResults.results, modeConfig.discoverWeight, tvGenreResults.label)
  for (const collection of collectionResults) addToScoreMap(collection.results, COLLECTION_WEIGHT, collection.label)

  const collectionKeys = new Set<string>()
  for (const collection of collectionResults) {
    for (const item of collection.results) {
      const key = `${item.media_type}-${item.id}`
      if (!excludeIds.has(key)) collectionKeys.add(key)
    }
  }

  const allValues = Array.from(scoreMap.values())
  const candidates = allValues

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
      candidate.score += similarity * EMBEDDING_BONUS_WEIGHT
      if (similarity > 0.5) candidate.basedOn.add('vergelijkbare verhaallijn')
    }
  }

  const allScored = candidates.map((item) => ({
    ...item,
    score: Math.pow(Math.log2(1 + item.score), modeConfig.dampingFactor),
    basedOn: Array.from(item.basedOn).slice(0, 3),
  }))

  const forcedMovies = allScored.filter((m) => m.media_type === 'movie' && collectionKeys.has(`movie-${m.id}`))
  const forcedTv = allScored.filter((m) => m.media_type === 'tv' && collectionKeys.has(`tv-${m.id}`))

  const movieGenreIds = movieGenres.map((g) => g.id)
  const tvGenreIds = tvGenres.map((g) => g.id)

  const roundRobinMovies = pickByGenreRoundRobin(
    allScored.filter((m) => m.media_type === 'movie' && !collectionKeys.has(`movie-${m.id}`)),
    movieGenreIds,
    (m) => `movie-${m.id}`,
    (m) => m.genre_ids || [],
    MAX_PER_GENRE,
    recentlyShownIds
  )
  const roundRobinTv = pickByGenreRoundRobin(
    allScored.filter((m) => m.media_type === 'tv' && !collectionKeys.has(`tv-${m.id}`)),
    tvGenreIds,
    (m) => `tv-${m.id}`,
    (m) => m.genre_ids || [],
    MAX_PER_GENRE,
    recentlyShownIds
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
    Math.ceil(modeConfig.longTailSlots / 2),
    recentlyShownIds
  )
  const longTailTv = pickLongTail(
    allScored.filter((m) => m.media_type === 'tv'),
    usedKeys,
    (m) => `tv-${m.id}`,
    Math.floor(modeConfig.longTailSlots / 2),
    recentlyShownIds
  )

  const sorted = [
    ...forcedMovies, ...roundRobinMovies, ...longTailMovies,
    ...forcedTv, ...roundRobinTv, ...longTailTv,
  ]

  const { data: profile } = await supabase
    .from('profiles')
    .select('streaming_services')
    .eq('id', user.id)
    .single()

  const userServices: string[] = profile?.streaming_services || []
  const userSourceIds = new Set(userServices.map((s) => SOURCE_IDS[s]).filter(Boolean))

  if (userSourceIds.size === 0) {
    return NextResponse.json({ results: sorted, mode })
  }

  const filtered = await Promise.all(
    sorted.map(async (item) => {
      const itemSources = await getWatchmodeSources(supabase, item.media_type, item.id)
      const userMatches = itemSources.filter((s: any) => userSourceIds.has(s.source_id))
      if (userMatches.length === 0) return null

      const subMatch = userMatches.find((s: any) => s.type === 'sub')
      const rentMatch = userMatches
        .filter((s: any) => s.type === 'rent')
        .sort((a: any, b: any) => (a.price ?? 999) - (b.price ?? 999))[0]
      const buyMatch = userMatches
        .filter((s: any) => s.type === 'buy')
        .sort((a: any, b: any) => (a.price ?? 999) - (b.price ?? 999))[0]

      const best = subMatch || rentMatch || buyMatch
      if (!best) return null

      let watchOn = best.name
      if (best.type === 'rent') watchOn = `${best.name} · huren${best.price ? ` €${best.price}` : ''}`
      if (best.type === 'buy') watchOn = `${best.name} · kopen${best.price ? ` €${best.price}` : ''}`

      return { ...item, watchOn, watchUrl: best.web_url }
    })
  )

  const available = filtered.filter((m) => m !== null)

  if (available.length > 0) {
    await supabase.from('shown_recommendations').upsert(
      available.map((item: any) => ({
        user_id: user.id,
        tmdb_id: item.id,
        media_type: item.media_type,
        shown_at: new Date().toISOString(),
      })),
      { onConflict: 'user_id,tmdb_id,media_type' }
    )
  }

  return NextResponse.json({ results: available, mode })
}
