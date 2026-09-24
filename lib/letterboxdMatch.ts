// Zoekt bij een Letterboxd-film (alleen naam en jaar; er is geen TMDB-nummer) de bijbehorende
// TMDB-titel. Alleen op de server gebruikt, met de TMDB-sleutel.

export interface MatchInput {
  name: string
  year: number | null
}

export interface MatchResult {
  id: number
  title: string
  poster_path: string | null
  release_date: string | null
}

interface TmdbSearchItem {
  id: number
  title: string
  original_title: string
  release_date?: string
  poster_path: string | null
}

// Hoofdletters, accenten en leestekens negeren: "Amélie" en "Amelie", "Se7en" en "Seven"-achtige
// verschillen in schrijfwijze mogen een match niet in de weg zitten.
export function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '')
}

function yearOf(item: TmdbSearchItem): number | null {
  const y = parseInt((item.release_date ?? '').slice(0, 4), 10)
  return Number.isFinite(y) ? y : null
}

async function search(name: string, year: number | null, apiKey: string): Promise<TmdbSearchItem[]> {
  const params = new URLSearchParams({ query: name, include_adult: 'false', language: 'nl-NL' })
  if (year !== null) params.set('year', String(year))
  try {
    const res = await fetch(`https://api.themoviedb.org/3/search/movie?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results || []) as TmdbSearchItem[]
  } catch {
    return []
  }
}

function pick(input: MatchInput, results: TmdbSearchItem[], strict: boolean): TmdbSearchItem | null {
  const wanted = normalizeTitle(input.name)
  let best: { item: TmdbSearchItem; score: number } | null = null
  results.slice(0, 8).forEach((item, index) => {
    const titleMatch = normalizeTitle(item.title) === wanted || normalizeTitle(item.original_title) === wanted
    const cy = yearOf(item)
    const diff = input.year !== null && cy !== null ? Math.abs(cy - input.year) : null
    const yearOk = diff === null ? !strict : diff <= 1
    // Zonder jaarfilter (strict) accepteren we alleen een titel die klopt én een jaar dat past;
    // met jaarfilter volstaat een jaar dat past, ook als de titel in het Nederlands anders heet.
    if (strict ? !(titleMatch && yearOk) : !(yearOk || titleMatch)) return
    const score = (titleMatch ? 100 : 0) + (diff === 0 ? 50 : diff === 1 ? 30 : 0) - index
    if (!best || score > best.score) best = { item, score }
  })
  return best ? (best as { item: TmdbSearchItem; score: number }).item : null
}

export async function matchFilm(input: MatchInput, apiKey: string): Promise<MatchResult | null> {
  let chosen: TmdbSearchItem | null = null

  if (input.year !== null) {
    chosen = pick(input, await search(input.name, input.year, apiKey), false)
  }
  // Letterboxd en TMDB verschillen soms een jaar van elkaar (festival- versus bioscoopjaar), of
  // TMDB kent de titel onder een andere naam: dan zonder jaarfilter zoeken en zelf het jaar toetsen.
  if (!chosen) chosen = pick(input, await search(input.name, null, apiKey), true)

  if (!chosen) return null
  return {
    id: chosen.id,
    title: chosen.title,
    poster_path: chosen.poster_path,
    release_date: chosen.release_date || null,
  }
}
