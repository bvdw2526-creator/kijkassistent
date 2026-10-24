// De openbare tip (/tip): iemand zonder account noemt twee tot drie titels die hij (of zij samen) leuk vond, en krijgt de
// titel die het best bij álle genoemde titels past. Alleen op de verhaal-vingerafdruk (title_embeddings_en), want er is
// geen profiel. Bedacht als "kijktip voor samen" voor Instagram (quote-video/kijktip.js), hier voor iedereen.
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getEmbeddingsForItems, SOURCE_IDS, type MediaType } from './recommendationEngine'
import { tmdbLanguage } from './serverI18n'
import type { Locale } from './locale'

export const PUBLIC_TIP_MIN_TITLES = 2
export const PUBLIC_TIP_MAX_TITLES = 3

// Uit de POOL best passende titels (zie blend_neighbors_en) bekijken we er DETAIL_LIMIT bij TMDB; daaruit de tip en
// ALTERNATIVES alternatieven. Bekende titels gaan voor: minstens MIN_VOTES stemmen bij TMDB.
const POOL = 80
const DETAIL_LIMIT = 36
const ALTERNATIVES = 4
const MIN_VOTES: Record<MediaType, number> = { movie: 500, tv: 200 }

// Genres die alleen terugkomen als minstens één van de genoemde titels dat genre ook heeft: wie drie thrillers noemt
// wil geen horror, animatie of realityserie als tip, ook al lijkt het verhaal. (Bij de Instagram-tip bleek horror
// anders hoog te eindigen: Strange Darling bij Gone Girl, Basic Instinct en Se7en.)
const GUARDED_GENRES = new Set([
  27, // horror
  16, // animatie
  99, // documentaire
  10762, // kinderen (series)
  10763, // nieuws
  10764, // reality
  10767, // talkshow
])

// Bij "samen" vallen titels af met een van deze TMDB-trefwoorden: wie een tip voor een avond samen vraagt, wil geen
// scheidingsdrama of film over geweld in een relatie (Marriage Story kwam anders bovenaan bij Palm Springs, La La Land en
// Crazy, Stupid, Love).
const NOT_FOR_TOGETHER = new Set([
  'divorce', 'divorce lawyer', 'infidelity', 'adultery', 'custody battle', 'marriage crisis', 'domestic violence',
  'domestic abuse', 'spousal abuse', 'sexual assault', 'sexual abuse', 'rape',
])

// Kinder- en reclameversies naast de gewone dienst (Netflix Kids naast Netflix) tonen we niet dubbel.
const SIDE_VARIANT = / (kids|with ads|standard with ads|amazon channel)$/i

export interface PublicTipInput {
  media_type: MediaType
  id: number
}

export interface PublicTipProvider {
  name: string
  logo_path: string | null
}

export interface PublicTipItem {
  media_type: MediaType
  id: number
  title: string
  year: string
  poster_path: string | null
  vote_average: number
  vote_count: number
  overview: string
  genres: string[]
  providers: PublicTipProvider[]
  // Of hij op een van de gekozen diensten staat (zonder gekozen diensten: op een abonnement in Nederland).
  available: boolean
  // De genoemde titel waar hij het meest op lijkt.
  closest: string
}

export interface PublicTipResult {
  inputs: { media_type: MediaType; id: number; title: string; poster_path: string | null }[]
  tip: PublicTipItem | null
  alternatives: PublicTipItem[]
}

interface TmdbDetail {
  id: number
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path: string | null
  vote_average: number
  vote_count: number
  overview: string
  genres: { id: number; name: string }[]
  belongs_to_collection?: { id: number } | null
  keywords?: { keywords?: { name: string }[]; results?: { name: string }[] }
  'watch/providers'?: { results?: { NL?: Record<string, { provider_id: number; provider_name: string; logo_path: string | null }[]> } }
}

async function tmdbDetail(mediaType: MediaType, id: number, withProviders: boolean, locale: Locale): Promise<TmdbDetail | null> {
  try {
    const extra = withProviders ? '&append_to_response=watch/providers,keywords' : ''
    const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?language=${tmdbLanguage(locale)}${extra}`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: 60 * 60 * 12 },
    })
    return res.ok ? ((await res.json()) as TmdbDetail) : null
  } catch {
    return null
  }
}

// Gelijkenis met alle titels tegelijk, in de database (migratie 20261016_public_tip). Bestaat die functie nog niet, dan
// dezelfde som via embedding_similarities_en_v2 in porties, zoals quote-video/kijktip.js het doet (trager).
async function blend(
  supabase: SupabaseClient,
  vectors: number[][],
  exclude: PublicTipInput[]
): Promise<{ media_type: MediaType; tmdb_id: number; score: number; similarities: number[] }[]> {
  const p_exclude = exclude.map((e) => ({ media_type: e.media_type, tmdb_id: e.id }))
  const { data, error } = await supabase.rpc('blend_neighbors_en', { p_vectors: vectors, p_exclude, p_limit: POOL })
  if (!error) return data ?? []
  console.warn('blend_neighbors_en niet beschikbaar, terugval op porties:', error.message)

  const all: { media_type: MediaType; tmdb_id: number }[] = []
  for (let from = 0; ; from += 1000) {
    const { data: part } = await supabase
      .from('title_embeddings_en')
      .select('media_type, tmdb_id')
      .order('media_type')
      .order('tmdb_id')
      .range(from, from + 999)
    all.push(...((part ?? []) as typeof all))
    if (!part || part.length < 1000) break
  }
  const skip = new Set(p_exclude.map((e) => `${e.media_type}-${e.tmdb_id}`))
  const candidates = all.filter((c) => !skip.has(`${c.media_type}-${c.tmdb_id}`))
  const size = 250
  const parts = []
  for (let i = 0; i < candidates.length; i += size) parts.push(candidates.slice(i, i + size))
  const rows: { media_type: MediaType; tmdb_id: number; similarities: number[] }[] = []
  for (let i = 0; i < parts.length; i += 6) {
    const results = await Promise.all(
      parts.slice(i, i + 6).map((p) => supabase.rpc('embedding_similarities_en_v2', { p_vectors: vectors, p_candidates: p }))
    )
    for (const r of results) rows.push(...((r.data ?? []) as typeof rows))
  }
  return rows
    .map((r) => {
      const mean = r.similarities.reduce((a, b) => a + b, 0) / r.similarities.length
      return { ...r, score: mean + Math.min(...r.similarities) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, POOL)
}

export async function computePublicTip(
  supabase: SupabaseClient,
  inputs: PublicTipInput[],
  services: string[],
  together = false,
  locale: Locale = 'nl'
): Promise<PublicTipResult> {
  const inputDetails = await Promise.all(inputs.map((i) => tmdbDetail(i.media_type, i.id, false, locale)))
  const known = inputs.filter((_, i) => inputDetails[i])
  const details = inputDetails.filter((d): d is TmdbDetail => !!d)
  const inputSummary = known.map((i, k) => ({
    media_type: i.media_type,
    id: i.id,
    title: details[k].title || details[k].name || '',
    poster_path: details[k].poster_path,
  }))

  // Vingerafdrukken van de genoemde titels; ontbreekt er een, dan maakt de motor hem (en bewaart hem in de gedeelde cache).
  const embeddings = await getEmbeddingsForItems(
    supabase,
    known.map((i) => ({ media_type: i.media_type, tmdb_id: i.id, text: '' })),
    'en'
  )
  const withVector = known.filter((i) => (embeddings.get(`${i.media_type}-${i.id}`) ?? []).length > 0)
  if (withVector.length < PUBLIC_TIP_MIN_TITLES) return { inputs: inputSummary, tip: null, alternatives: [] }
  const vectors = withVector.map((i) => embeddings.get(`${i.media_type}-${i.id}`)!)
  const vectorTitles = withVector.map((i) => inputSummary.find((s) => s.media_type === i.media_type && s.id === i.id)!.title)

  const ranked = await blend(supabase, vectors, inputs)

  const inputGenres = new Set(details.flatMap((d) => d.genres.map((g) => g.id)))
  const inputCollections = new Set(details.map((d) => d.belongs_to_collection?.id).filter(Boolean))
  const serviceIds = new Set(services.map((s) => SOURCE_IDS[s]).filter(Boolean))

  const candidates = await Promise.all(
    ranked.slice(0, DETAIL_LIMIT).map(async (r) => ({ r, d: await tmdbDetail(r.media_type, r.tmdb_id, true, locale) }))
  )

  const items: (PublicTipItem & { known: boolean })[] = []
  for (const { r, d } of candidates) {
    if (!d || !d.poster_path) continue
    if (d.belongs_to_collection && inputCollections.has(d.belongs_to_collection.id)) continue
    if (d.genres.some((g) => GUARDED_GENRES.has(g.id) && !inputGenres.has(g.id))) continue
    if (together && (d.keywords?.keywords ?? d.keywords?.results ?? []).some((k) => NOT_FOR_TOGETHER.has(k.name.toLowerCase()))) continue

    const nl = d['watch/providers']?.results?.NL ?? {}
    // NPO Start staat bij TMDB deels onder "ads" of "free"; Pathé Thuis is alleen huren.
    const offers = [...(nl.flatrate ?? []), ...(nl.ads ?? []), ...(nl.free ?? []), ...(serviceIds.has(71) ? nl.rent ?? [] : [])]
    const unique = offers.filter((p, i) => offers.findIndex((q) => q.provider_id === p.provider_id) === i)
    const relevant = serviceIds.size ? unique.filter((p) => serviceIds.has(p.provider_id)) : unique.filter((p) => (nl.flatrate ?? []).includes(p))
    const providers = relevant
      .filter((p) => !SIDE_VARIANT.test(p.provider_name) || !relevant.some((q) => p.provider_name.toLowerCase().startsWith(q.provider_name.toLowerCase() + ' ')))
      .slice(0, 4)
      .map((p) => ({ name: p.provider_name, logo_path: p.logo_path }))

    const closestIndex = r.similarities.indexOf(Math.max(...r.similarities))
    items.push({
      media_type: r.media_type,
      id: r.tmdb_id,
      title: d.title || d.name || '',
      year: (d.release_date || d.first_air_date || '').slice(0, 4),
      poster_path: d.poster_path,
      vote_average: Math.round(d.vote_average * 10) / 10,
      vote_count: d.vote_count,
      overview: d.overview,
      genres: d.genres.slice(0, 3).map((g) => g.name.toLowerCase()),
      providers,
      available: providers.length > 0,
      closest: vectorTitles[closestIndex] ?? '',
      known: d.vote_count >= MIN_VOTES[r.media_type],
    })
  }

  // Volgorde: bekend én te zien, dan te zien, dan bekend, dan de rest; binnen elke groep de beste score eerst.
  const rank = (i: (typeof items)[number]) => (i.available ? 0 : 2) + (i.known ? 0 : 1)
  const ordered = items.map((item, index) => ({ item, index })).sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
  const clean = ordered.map(({ item }) => {
    const { known: _known, ...rest } = item
    void _known
    return rest
  })
  return { inputs: inputSummary, tip: clean[0] ?? null, alternatives: clean.slice(1, 1 + ALTERNATIVES) }
}
