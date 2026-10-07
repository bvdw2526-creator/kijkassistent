// Zoeken naar films en series met een vangnet voor tikfouten. TMDB zoekt op hele woorden (of het begin ervan) en kent geen
// tikfouten: "matirx" levert daar niets op. Geeft de gewone zoekopdracht niets, dan proberen we in dezelfde aanroep:
// een schoongemaakte schrijfwijze, de Engelse titel, een vergelijking op gelijkenis met de bekendste titels, en het
// zoeken zonder het laatste woord. Alleen op de server gebruikt.

export interface SearchHit {
  id: number
  title: string
  release_date?: string
  poster_path: string | null
  media_type: 'movie' | 'tv'
}

export interface SearchOutcome {
  results: SearchHit[]
  // Uitleg boven de resultaten als het niet de gewone treffers zijn; null bij een gewone zoekopdracht.
  note: string | null
}

const TMDB = 'https://api.themoviedb.org/3'
const KNOWN_PAGES = 20
const KNOWN_CACHE_SECONDS = 60 * 60 * 24
const MAX_FUZZY = 8
// Minimale gelijkenis (0 tot 1) om als "bedoelde je misschien" te tonen; korte zoektermen moeten scherper kloppen.
const MIN_SIMILARITY = 0.7
const MIN_SIMILARITY_SHORT = 0.8

interface RawTmdbResult {
  id: number
  media_type?: string
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  popularity?: number
}

async function tmdbSearch(query: string, language: string): Promise<SearchHit[]> {
  if (!query) return []
  try {
    const res = await fetch(`${TMDB}/search/multi?query=${encodeURIComponent(query)}&language=${language}`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) return []
    const data = await res.json()
    return ((data.results || []) as RawTmdbResult[])
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .map((item) => ({
        id: item.id,
        title: item.title || item.name || '',
        release_date: item.release_date || item.first_air_date,
        poster_path: item.poster_path ?? null,
        media_type: item.media_type as 'movie' | 'tv',
      }))
  } catch {
    return []
  }
}

// Kleine letters, zonder accenten en leestekens ("Spider-Man" wordt "spider man", "Amélie" wordt "amelie").
export function normalizeQuery(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const withoutArticle = (text: string) => text.replace(/^(the|a|an|de|het|een|le|la|les|der|die|das)\s+/, '')

// Bewerkingsafstand tussen twee teksten, omgezet naar gelijkenis (1 = gelijk, 0 = niets gemeen). Een verwisseling van twee
// letters ("matirx") telt als één fout, want dat is de meest voorkomende tikfout.
function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0
  const la = a.length
  const lb = b.length
  const d: number[][] = Array.from({ length: la + 1 }, (_, i) => {
    const row = new Array<number>(lb + 1).fill(0)
    row[0] = i
    return row
  })
  for (let j = 0; j <= lb; j++) d[0][j] = j
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return 1 - d[la][lb] / Math.max(la, lb)
}

interface KnownTitle {
  hit: SearchHit
  names: string[]
  popularity: number
}

let knownCache: { at: number; list: KnownTitle[] } | null = null

// De bekendste films en series (populair en best beoordeeld), voor de vergelijking op gelijkenis. De TMDB-antwoorden worden
// een dag hergebruikt; hier houden we de verwerkte lijst nog een paar uur in het geheugen.
async function getKnownTitles(): Promise<KnownTitle[]> {
  if (knownCache && Date.now() - knownCache.at < 6 * 60 * 60 * 1000) return knownCache.list
  const requests: Promise<RawTmdbResult[]>[] = []
  for (const type of ['movie', 'tv'] as const) {
    for (const list of ['popular', 'top_rated']) {
      for (let page = 1; page <= KNOWN_PAGES; page++) {
        requests.push(
          fetch(`${TMDB}/${type}/${list}?language=nl-NL&page=${page}`, {
            headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
            next: { revalidate: KNOWN_CACHE_SECONDS },
          })
            .then((res) => (res.ok ? res.json() : { results: [] }))
            .then((data) => ((data.results || []) as RawTmdbResult[]).map((r) => ({ ...r, media_type: type })))
            .catch(() => [] as RawTmdbResult[])
        )
      }
    }
  }
  const unique = new Map<string, KnownTitle>()
  for (const r of (await Promise.all(requests)).flat()) {
    const key = `${r.media_type}-${r.id}`
    if (unique.has(key) || !r.poster_path) continue
    const title = r.title || r.name || ''
    const original = r.original_title || r.original_name || ''
    const names = Array.from(new Set([title, original].map((n) => withoutArticle(normalizeQuery(n))).filter(Boolean)))
    unique.set(key, {
      hit: {
        id: r.id,
        title,
        release_date: r.release_date || r.first_air_date,
        poster_path: r.poster_path ?? null,
        media_type: r.media_type as 'movie' | 'tv',
      },
      names,
      popularity: r.popularity ?? 0,
    })
  }
  const list = Array.from(unique.values())
  if (list.length > 0) knownCache = { at: Date.now(), list }
  return list
}

// De bekende titels die het best lijken op wat is getypt. Vergelijkt met de hele titel en met het begin ervan, zodat "harry poter"
// ook "Harry Potter and the Philosopher's Stone" vindt.
async function fuzzyKnown(cleaned: string): Promise<{ hit: SearchHit; score: number }[]> {
  const query = withoutArticle(cleaned)
  if (query.length < 3) return []
  const threshold = query.length <= 5 ? MIN_SIMILARITY_SHORT : MIN_SIMILARITY
  const words = query.split(' ').length
  const scored: { known: KnownTitle; score: number }[] = []
  for (const known of await getKnownTitles()) {
    let best = 0
    for (const name of known.names) {
      best = Math.max(best, similarity(query, name))
      if (name.includes(' ') && words >= 1) best = Math.max(best, similarity(query, name.split(' ').slice(0, words).join(' ')))
    }
    if (best >= threshold) scored.push({ known, score: best })
  }
  return scored
    .sort((a, b) => b.score - a.score || b.known.popularity - a.known.popularity)
    .slice(0, MAX_FUZZY)
    .map((s) => ({ hit: s.known.hit, score: s.score }))
}

// Hoe goed de beste treffer lijkt op wat is getypt (0 tot 1): bepaalt of TMDB's eigen resultaten wel kloppen.
function bestTitleSimilarity(cleaned: string, hits: SearchHit[]): number {
  const query = withoutArticle(cleaned)
  const words = query.split(' ').length
  let best = 0
  for (const hit of hits.slice(0, 5)) {
    const name = withoutArticle(normalizeQuery(hit.title))
    best = Math.max(best, similarity(query, name), similarity(query, name.split(' ').slice(0, words).join(' ')))
  }
  return best
}

// De zoekopdracht van de app: eerst gewoon zoeken; alleen als dat niets oplevert gaan de aanvullende stappen tegelijk.
// Staan er wel treffers van TMDB maar lijken ze nauwelijks op wat is getypt ("breakin bad" geeft "Breaking in Badly"), dan
// zetten we de beste gelijkenis uit onze lijst erboven.
const GOOD_ENOUGH = 0.85
const CLEARLY_BETTER = 0.85
// Een gelijkenis uit onze lijst moet zoveel beter zijn dan wat TMDB gaf, anders houden we TMDB's resultaten.

export async function searchTitles(query: string): Promise<SearchOutcome> {
  const exact = await tmdbSearch(query, 'nl-NL')
  const cleaned = normalizeQuery(query)
  if (exact.length > 0) {
    const exactScore = bestTitleSimilarity(cleaned, exact)
    if (exactScore >= GOOD_ENOUGH) return { results: exact, note: null }
    const close = (await fuzzyKnown(cleaned)).filter((f) => f.score >= CLEARLY_BETTER && f.score >= exactScore + 0.08)
    if (close.length === 0) return { results: exact, note: null }
    const ids = new Set(close.map((c) => `${c.hit.media_type}-${c.hit.id}`))
    return {
      results: [...close.map((c) => c.hit), ...exact.filter((h) => !ids.has(`${h.media_type}-${h.id}`))],
      note: `Bedoelde je misschien: ${close[0].hit.title}? Daaronder staan de andere resultaten voor "${query}".`,
    }
  }

  const words = cleaned.split(' ').filter(Boolean)
  const shortened = words.length >= 2 ? words.slice(0, -1).join(' ') : ''
  const [cleanedNl, cleanedEn, fuzzy, shortenedHits] = await Promise.all([
    cleaned && cleaned !== query.toLowerCase() ? tmdbSearch(cleaned, 'nl-NL') : Promise.resolve([] as SearchHit[]),
    tmdbSearch(cleaned, 'en-US'),
    fuzzyKnown(cleaned),
    shortened ? tmdbSearch(shortened, 'nl-NL') : Promise.resolve([] as SearchHit[]),
  ])

  if (cleanedNl.length > 0) return { results: cleanedNl, note: null }
  if (cleanedEn.length > 0) return { results: cleanedEn, note: null }
  if (fuzzy.length > 0) return { results: fuzzy.map((f) => f.hit), note: `Geen exacte treffers voor "${query}". Bedoelde je misschien:` }
  if (shortenedHits.length > 0) {
    return { results: shortenedHits, note: `Geen exacte treffers voor "${query}". Dit zijn de resultaten voor "${shortened}":` }
  }
  return { results: [], note: `Niets gevonden voor "${query}". Controleer de schrijfwijze of probeer een deel van de titel.` }
}
