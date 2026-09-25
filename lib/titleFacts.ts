// Weetjes bij een titel, uitsluitend uit gegevens die we zeker weten (TMDB en je eigen smaak).
// Geen verzonnen verhaaltjes: liever geen weetje dan een fout weetje.
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCreditsBulk, type MediaType } from '@/lib/recommendationEngine'

const MAX_FACTS = 2
// Zoveel eigen favorieten/"zeker leuk"-titels (recentste eerst) vergelijken we met de cast.
const LIKED_LIMIT = 50
const CAST_LOOKED_AT = 6

export interface LikedTitle {
  media_type: MediaType
  tmdb_id: number
  title: string
}

export interface TitleFactsInput {
  type: MediaType
  id: number
  // Datum van de eerste release / uitzending (YYYY-MM-DD) en het aantal jaren sinds vandaag zit in de tekst.
  releaseDate: string | null
  budget: number
  revenue: number
  directors: { id: number; name: string }[]
  cast: { id: number; name: string }[]
  collection: { name: string; position: number; total: number } | null
  // Eigen titels met hun mensen, recentste eerst (zonder de titel zelf).
  liked: { title: string; directors: { id: number; name: string }[]; cast: { id: number; name: string }[] }[]
  // Maandag en zondag van de huidige week (YYYY-MM-DD), voor het jubileum.
  weekStart: string
  weekEnd: string
}

function dollars(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1).replace('.0', '').replace('.', ',')} miljard`
  return `$${Math.round(amount / 1_000_000)} miljoen`
}

// Pure functie (zonder netwerk), zodat de tekstkeuzes los te testen zijn.
export function buildFacts(input: TitleFactsInput): string[] {
  const facts: string[] = []

  // 1. Jouw eigen link: dezelfde regisseur of acteur in iets wat je zeker leuk vond.
  const directorIds = new Set(input.directors.map((d) => d.id))
  for (const director of input.directors) {
    const shared = input.liked.filter((l) => l.directors.some((d) => d.id === director.id))
    if (shared.length > 0) {
      const names = shared.slice(0, 2).map((s) => s.title)
      facts.push(`Regisseur ${director.name} maakte ook ${names.join(' en ')}, die je leuk ${names.length > 1 ? 'vonden' : 'vond'}.`)
      break
    }
  }
  if (facts.length === 0) {
    const castTop = input.cast.slice(0, CAST_LOOKED_AT).filter((c) => !directorIds.has(c.id))
    let best: { name: string; titles: string[] } | null = null
    for (const actor of castTop) {
      const titles = input.liked.filter((l) => l.cast.some((c) => c.id === actor.id)).map((l) => l.title)
      if (titles.length > 0 && (!best || titles.length > best.titles.length)) best = { name: actor.name, titles }
    }
    if (best) facts.push(`Je kent ${best.name} ook van ${best.titles.slice(0, 2).join(' en ')}, die je leuk ${best.titles.length > 1 ? 'vonden' : 'vond'}.`)
  }

  // 2. Jubileum: valt de verjaardag van de release in deze week?
  if (input.releaseDate && /^\d{4}-\d{2}-\d{2}$/.test(input.releaseDate)) {
    const [year, month, day] = input.releaseDate.split('-').map(Number)
    // Een week die over de jaargrens loopt: de verjaardag kan in het volgende kalenderjaar vallen.
    for (const y of new Set([Number(input.weekStart.slice(0, 4)), Number(input.weekEnd.slice(0, 4))])) {
      const anniversary = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const yearsThen = y - year
      if (yearsThen >= 5 && anniversary >= input.weekStart && anniversary <= input.weekEnd) {
        facts.push(
          input.type === 'tv'
            ? `Deze week ${yearsThen} jaar geleden voor het eerst uitgezonden.`
            : `Deze week ${yearsThen} jaar geleden uitgekomen.`
        )
        break
      }
    }
  }

  // 3. Deel van een reeks.
  if (input.collection && input.collection.total >= 2) {
    facts.push(`${input.collection.position}e film van ${input.collection.total} in ${input.collection.name}.`)
  }

  // 4. Kosten en opbrengst, alleen als TMDB beide cijfers heeft.
  if (input.type === 'movie' && input.budget >= 1_000_000 && input.revenue >= 1_000_000) {
    facts.push(`Kostte ongeveer ${dollars(input.budget)} en bracht wereldwijd ${dollars(input.revenue)} op.`)
  }

  return facts.slice(0, MAX_FACTS)
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function currentWeek(now = new Date()): { start: string; end: string } {
  const local = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' }))
  const monday = new Date(local.getFullYear(), local.getMonth(), local.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const sunday = new Date(monday)
  sunday.setDate(sunday.getDate() + 6)
  return { start: ymd(monday), end: ymd(sunday) }
}

async function tmdb<T>(path: string, apiKey: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api.themoviedb.org/3${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      // Titelgegevens veranderen nauwelijks: een dag lang hergebruiken.
      next: { revalidate: 60 * 60 * 24 },
    })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

interface TmdbDetails {
  release_date?: string
  first_air_date?: string
  budget?: number
  revenue?: number
  belongs_to_collection?: { id: number; name: string } | null
  created_by?: { id: number; name: string }[]
  credits?: {
    cast?: { id: number; name: string }[]
    crew?: { id: number; name: string; job: string }[]
  }
}

export async function getTitleFacts(
  supabase: SupabaseClient,
  userId: string,
  type: MediaType,
  id: number,
  apiKey: string
): Promise<string[]> {
  const details = await tmdb<TmdbDetails>(`/${type}/${id}?language=nl-NL&append_to_response=credits`, apiKey)
  if (!details) return []

  const directors =
    type === 'movie'
      ? (details.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => ({ id: c.id, name: c.name }))
      : (details.created_by ?? []).map((c) => ({ id: c.id, name: c.name }))
  const cast = (details.credits?.cast ?? []).slice(0, 10).map((c) => ({ id: c.id, name: c.name }))

  let collection: TitleFactsInput['collection'] = null
  if (type === 'movie' && details.belongs_to_collection) {
    const parts = await tmdb<{ parts?: { id: number; release_date?: string }[] }>(
      `/collection/${details.belongs_to_collection.id}?language=nl-NL`,
      apiKey
    )
    const released = (parts?.parts ?? []).filter((p) => p.release_date).sort((a, b) => a.release_date!.localeCompare(b.release_date!))
    const position = released.findIndex((p) => p.id === id)
    if (position >= 0 && released.length >= 2) {
      collection = { name: details.belongs_to_collection.name, position: position + 1, total: released.length }
    }
  }

  // Eigen smaak: recentste favorieten en "zeker leuk"-beoordelingen, zonder deze titel zelf.
  const [{ data: favorites }, { data: loved }] = await Promise.all([
    supabase.from('favorite_movies').select('tmdb_id, title, media_type, added_at').eq('user_id', userId).order('added_at', { ascending: false }).limit(LIKED_LIMIT),
    supabase.from('ratings').select('tmdb_id, title, media_type, rated_at').eq('user_id', userId).eq('rating', 'love').order('rated_at', { ascending: false }).limit(LIKED_LIMIT),
  ])
  const seen = new Set<string>([`${type}-${id}`])
  const likedTitles: LikedTitle[] = []
  for (const row of [...(favorites ?? []), ...(loved ?? [])] as { tmdb_id: number; title: string; media_type: MediaType }[]) {
    const key = `${row.media_type}-${row.tmdb_id}`
    if (seen.has(key)) continue
    seen.add(key)
    likedTitles.push({ media_type: row.media_type, tmdb_id: row.tmdb_id, title: row.title })
    if (likedTitles.length >= LIKED_LIMIT) break
  }
  const creditsByKey = likedTitles.length
    ? await getCreditsBulk(supabase, likedTitles.map((t) => ({ mediaType: t.media_type, tmdbId: t.tmdb_id })))
    : new Map()
  const liked = likedTitles.map((t) => {
    const credits = creditsByKey.get(`${t.media_type}-${t.tmdb_id}`)
    return { title: t.title, directors: credits?.directors ?? [], cast: credits?.cast ?? [] }
  })

  const week = currentWeek()
  return buildFacts({
    type,
    id,
    releaseDate: (type === 'movie' ? details.release_date : details.first_air_date) || null,
    budget: details.budget ?? 0,
    revenue: details.revenue ?? 0,
    directors,
    cast,
    collection,
    liked,
    weekStart: week.start,
    weekEnd: week.end,
  })
}
