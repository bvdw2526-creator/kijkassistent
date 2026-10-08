// Kenmerken van een titel waarvan de smaak leert: trefwoorden/thema's, regisseurs (bij series de bedenkers), tijdperk en
// oorspronkelijke taal. Ze worden uit TMDB gehaald, in de gedeelde cache bewaard (tmdb_features_cache) en samen met de
// smaakbronnen van de gebruiker gebruikt in lib/recommendationEngine.ts. Alleen op de server gebruikt.
import type { SupabaseClient } from '@supabase/supabase-js'

type MediaType = 'movie' | 'tv'

export interface NamedId {
  id: number
  name: string
}

export interface TitleFeatures {
  keywords: NamedId[]
  directors: NamedId[]
  year: number | null
  language: string | null
}

// Trefwoorden, regisseurs, jaar en taal veranderen vrijwel nooit.
const FEATURES_CACHE_MAX_AGE_HOURS = 24 * 30
const CACHE_READ_CHUNK = 200
const LIVE_CHUNK = 25
// Zo lang mag het live ophalen bij één aanroep duren; wat dan niet gehaald is, komt bij een volgende berekening.
const LIVE_BUDGET_MS = 12_000

// Gewicht van elk onderdeel in de eindscore (de leerfactor in de motor schaalt het geheel).
const KEYWORD_WEIGHT = 1.8
const DIRECTOR_WEIGHT = 2
const DECADE_WEIGHT = 1
const LANGUAGE_WEIGHT = 0.5
// Eén titel krijgt hooguit zoveel uit de kenmerken (erbij of eraf), zodat die de rest van de score niet overstemmen.
const FEATURE_SCORE_CAP = 4

// De kenmerken leren van twee kanten: wat je leuk vond telt vóór (met het gewicht uit de motor: favoriet 3, "zeker leuk"
// 2), wat je afkeurde telt ertegen. Zo wordt een trefwoord dat even vaak bij je "oké" en "niet voor mij" voorkomt als bij
// je "zeker leuk" geen pluspunt meer, en telt een regisseur van wie je iets afkeurde minder of zelfs negatief.
// "Niet voor mij" telt even zwaar tegen als "zeker leuk" vóór.
const DISLIKE_AGAINST_WEIGHT = 2
// "Was oké" betekent "niet echt mijn smaak" en telt voor een kwart van een afkeuring tegen, maar niet tegen de regisseur:
// van regisseurs van wie je alleen iets "oké" vond, vond je de volgende titel vaak wél zeker leuk.
// Gemeten (8 okt 2026, twee echte profielen, steeds één titel weglaten): de kans dat een "zeker leuk" hoger scoort dan een
// "niet voor mij" ging van 78,8% naar 80,7% en van 57,3% naar 73,2%; tegenover een "oké" van 69,8% naar 70,9% en van
// 58,1% naar 59,3%.
const OK_AGAINST_WEIGHT = 0.5

// Trefwoorden die over de productie gaan en niet over de inhoud: ze zeggen niets over smaak (een vervolg volgt de reeks al
// via de collectie). Die tellen niet mee en worden nooit als reden getoond.
const STRUCTURAL_KEYWORDS = new Set([
  'sequel',
  'prequel',
  'remake',
  'reboot',
  'spin off',
  'aftercreditsstinger',
  'duringcreditsstinger',
  'midcreditsstinger',
  'woman director',
  'based on true story',
])

// Nederlandse namen voor veelvoorkomende trefwoorden in de uitleg; de rest blijft zoals TMDB het noemt.
const KEYWORD_NL: Record<string, string> = {
  'based on comic': 'stripverhalen',
  superhero: 'superhelden',
  dystopia: 'dystopie',
  'based on novel or book': 'boekverfilmingen',
  'martial arts': 'vechtsport',
  'hand to hand combat': 'vechtscènes',
  'revenge': 'wraak',
  'time travel': 'tijdreizen',
  'artificial intelligence (a.i.)': 'kunstmatige intelligentie',
  'serial killer': 'seriemoordenaars',
  'heist': 'overvallen',
  'post-apocalyptic future': 'de wereld na de ondergang',
  'father daughter relationship': 'vader-dochterrelaties',
  'new york city': 'New York',
  'hero': 'helden',
}
// Zoveel van de best passende trefwoorden telt per titel mee, en ook zoveel van de minst passende.
const KEYWORD_TOP_N = 5

function chunked<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function fetchFeaturesLive(mediaType: MediaType, tmdbId: number): Promise<TitleFeatures | null> {
  try {
    const append = mediaType === 'movie' ? 'keywords,credits' : 'keywords'
    const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${tmdbId}?language=en-US&append_to_response=${append}`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
    })
    if (!res.ok) return null
    const data = await res.json()
    // Films leveren "keywords", series "results".
    const keywordList: { id: number; name: string }[] = data.keywords?.keywords || data.keywords?.results || []
    const directors: NamedId[] =
      mediaType === 'movie'
        ? ((data.credits?.crew || []) as { id: number; name: string; job?: string }[])
            .filter((c) => c.job === 'Director')
            .map((c) => ({ id: c.id, name: c.name }))
        : ((data.created_by || []) as { id: number; name: string }[]).map((c) => ({ id: c.id, name: c.name }))
    const date: string = data.release_date || data.first_air_date || ''
    const year = parseInt(date.slice(0, 4), 10)
    return {
      keywords: keywordList.map((k) => ({ id: k.id, name: k.name })),
      directors,
      year: Number.isFinite(year) ? year : null,
      language: data.original_language || null,
    }
  } catch {
    return null
  }
}

// Leest de kenmerken uit de gedeelde cache en haalt hooguit `maxLive` ontbrekende (of verouderde) titels live op, in de
// volgorde van `items`. De rest valt terug op de oude rij of ontbreekt; een volgende berekening vult het aan.
export async function getFeaturesBulk(
  supabase: SupabaseClient,
  items: { media_type: MediaType; tmdb_id: number }[],
  options: { maxLive: number }
): Promise<Map<string, TitleFeatures>> {
  const result = new Map<string, TitleFeatures>()
  const stale = new Map<string, TitleFeatures>()
  const cutoffMs = Date.now() - FEATURES_CACHE_MAX_AGE_HOURS * 60 * 60 * 1000

  type Row = { tmdb_id: number; keywords: NamedId[]; directors: NamedId[]; year: number | null; language: string | null; fetched_at: string }
  for (const mediaType of ['movie', 'tv'] as const) {
    const ids = [...new Set(items.filter((i) => i.media_type === mediaType).map((i) => i.tmdb_id))]
    const parts = await Promise.all(
      chunked(ids, CACHE_READ_CHUNK).map((part) =>
        supabase
          .from('tmdb_features_cache')
          .select('tmdb_id, keywords, directors, year, language, fetched_at')
          .eq('media_type', mediaType)
          .in('tmdb_id', part)
      )
    )
    for (const part of parts) {
      for (const row of (part.data || []) as Row[]) {
        const key = `${mediaType}-${row.tmdb_id}`
        const features: TitleFeatures = { keywords: row.keywords, directors: row.directors, year: row.year, language: row.language }
        stale.set(key, features)
        if (new Date(row.fetched_at).getTime() >= cutoffMs) result.set(key, features)
      }
    }
  }

  const missing = new Map<string, { media_type: MediaType; tmdb_id: number }>()
  for (const item of items) {
    const key = `${item.media_type}-${item.tmdb_id}`
    if (!result.has(key) && !missing.has(key)) missing.set(key, item)
  }
  const toFetch = Array.from(missing.entries()).slice(0, Math.max(0, options.maxLive))

  const started = Date.now()
  for (const part of chunked(toFetch, LIVE_CHUNK)) {
    if (Date.now() - started > LIVE_BUDGET_MS) break
    const done = await Promise.all(
      part.map(async ([key, item]) => ({ key, item, features: await fetchFeaturesLive(item.media_type, item.tmdb_id) }))
    )
    const upserts = done
      .filter((d) => d.features !== null)
      .map((d) => ({
        media_type: d.item.media_type,
        tmdb_id: d.item.tmdb_id,
        keywords: d.features!.keywords,
        directors: d.features!.directors,
        year: d.features!.year,
        language: d.features!.language,
        fetched_at: new Date().toISOString(),
      }))
    if (upserts.length > 0) await supabase.from('tmdb_features_cache').upsert(upserts, { onConflict: 'media_type,tmdb_id' })
    for (const d of done) if (d.features) result.set(d.key, d.features)
  }

  // Niet (op tijd) opgehaald: de oude rij is beter dan niets.
  for (const [key, features] of stale) if (!result.has(key)) result.set(key, features)
  return result
}

export interface FeatureTaste {
  // Het totale gewicht van wat je leuk vond; alle kenmerken worden daar tegen afgezet.
  total: number
  // Per kenmerk: gewicht vóór (wat je leuk vond) min gewicht tegen (wat je afkeurde of "oké" vond). Kan negatief zijn.
  keywordWeight: Map<number, number>
  directorWeight: Map<number, number>
  decadeWeight: Map<number, number>
  languageWeight: Map<string, number>
  // Hoe onderscheidend een trefwoord is: veelvoorkomende trefwoorden ("vervolg", "moord") zeggen weinig.
  idf: Map<number, number>
}

const decadeOf = (year: number) => Math.floor(year / 10) * 10

// Bouwt het smaakprofiel uit de kenmerken van de titels die je leuk vond (met hun gewicht), afgezet tegen die van wat je
// afkeurde en "oké" vond (zie DISLIKE_AGAINST_WEIGHT en OK_AGAINST_WEIGHT). Zonder afkeuringen en "oké" is het precies
// het oude profiel. `universe` zijn alle titels waarvan we kenmerken hebben (bronnen en kandidaten); daaruit volgt hoe
// vaak elk trefwoord voorkomt.
export function buildFeatureTaste(
  liked: { features: TitleFeatures; weight: number }[],
  against: { disliked: TitleFeatures[]; ok: TitleFeatures[] },
  universe: TitleFeatures[]
): FeatureTaste {
  const taste: FeatureTaste = {
    total: 0,
    keywordWeight: new Map(),
    directorWeight: new Map(),
    decadeWeight: new Map(),
    languageWeight: new Map(),
    idf: new Map(),
  }
  const add = <K>(map: Map<K, number>, key: K, weight: number) => map.set(key, (map.get(key) ?? 0) + weight)
  const count = (features: TitleFeatures, weight: number, directorWeight: number) => {
    for (const k of features.keywords) add(taste.keywordWeight, k.id, weight)
    if (directorWeight !== 0) for (const d of features.directors) add(taste.directorWeight, d.id, directorWeight)
    if (features.year) add(taste.decadeWeight, decadeOf(features.year), weight)
    if (features.language) add(taste.languageWeight, features.language, weight)
  }
  for (const { features, weight } of liked) {
    taste.total += weight
    count(features, weight, weight)
  }
  for (const features of against.disliked) count(features, -DISLIKE_AGAINST_WEIGHT, -DISLIKE_AGAINST_WEIGHT)
  for (const features of against.ok) count(features, -OK_AGAINST_WEIGHT, 0)
  const documentFrequency = new Map<number, number>()
  for (const f of universe) for (const k of f.keywords) documentFrequency.set(k.id, (documentFrequency.get(k.id) ?? 0) + 1)
  const n = Math.max(1, universe.length)
  for (const [id, df] of documentFrequency) taste.idf.set(id, Math.max(0, Math.log(n / df)))
  return taste
}

// Score van één titel tegen je smaak, plus korte redenen voor in de uitleg ("regisseur …", "het thema …").
export function scoreTitleFeatures(taste: FeatureTaste, f: TitleFeatures): { score: number; labels: string[] } {
  if (taste.total <= 0) return { score: 0, labels: [] }

  const values = f.keywords
    .filter((k) => !STRUCTURAL_KEYWORDS.has(k.name.toLowerCase()))
    .map((k) => ({ k, value: ((taste.keywordWeight.get(k.id) ?? 0) / taste.total) * (taste.idf.get(k.id) ?? 0) }))
  // De best passende trefwoorden tellen erbij, de minst passende (vooral bij wat je afkeurde) eraf.
  const matches = values.filter((m) => m.value > 0).sort((a, b) => b.value - a.value)
  const misses = values.filter((m) => m.value < 0).sort((a, b) => a.value - b.value)
  const keywordScore = [...matches.slice(0, KEYWORD_TOP_N), ...misses.slice(0, KEYWORD_TOP_N)].reduce((sum, m) => sum + m.value, 0)

  // Een regisseur van wie je twee "zeker leuk" hebt (4 punten) telt volledig; van één favoriet (3) driekwart, van één
  // "zeker leuk" de helft. Keurde je iets van hem of haar af, dan gaat dat eraf; twee afkeuringen tellen volledig negatief.
  // Bij meerdere regisseurs telt degene met het duidelijkste oordeel.
  const directorMatches = f.directors
    .map((d) => ({ d, w: taste.directorWeight.get(d.id) ?? 0 }))
    .filter((m) => m.w !== 0)
    .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
  const directorScore = directorMatches.length > 0 ? Math.max(-1, Math.min(1, directorMatches[0].w / 4)) : 0

  const decadeScore = f.year ? (taste.decadeWeight.get(decadeOf(f.year)) ?? 0) / taste.total : 0
  const languageScore = f.language ? (taste.languageWeight.get(f.language) ?? 0) / taste.total : 0

  const labels: string[] = []
  if (directorMatches.length > 0 && directorMatches[0].w >= 2) labels.push(`regisseur ${directorMatches[0].d.name}`)
  // Alleen een trefwoord noemen dat echt opvalt: veel van je favorieten hebben het en weinig andere titels.
  if (matches.length > 0 && matches[0].value >= 0.15) {
    const name = matches[0].k.name
    labels.push(`${KEYWORD_NL[name.toLowerCase()] ?? name}`)
  }

  const score = KEYWORD_WEIGHT * keywordScore + DIRECTOR_WEIGHT * directorScore + DECADE_WEIGHT * decadeScore + LANGUAGE_WEIGHT * languageScore
  return { score: Math.max(-FEATURE_SCORE_CAP, Math.min(FEATURE_SCORE_CAP, score)), labels }
}
