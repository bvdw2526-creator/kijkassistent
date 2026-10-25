import { NextRequest, NextResponse } from 'next/server'
import { guardPublicRequest, LIMITS } from '@/lib/apiGuard'
import { RENT_ONLY_SOURCE_IDS, SOURCE_IDS, monetizationTypesFor, resolveWatchInfo, type MediaType } from '@/lib/recommendationEngine'
import { cacheWriter } from '@/lib/supabaseAdmin'
import { localeFromRequest, serverTranslator, tmdbLanguage } from '@/lib/serverI18n'
import { hasNonLatinTitle, withLatinTitles } from '@/lib/titleFallback'
import { AISLES, STORE_ORDER, TV_GENRE_IDS, aisleFor, type AisleId } from '@/lib/videotheek'

// De openbare videotheek (/videotheek): zonder account door de gangpaden lopen. Per gangpad bekende, goed gewaardeerde
// titels op de diensten die de bezoeker aantikt (zonder keuze: alle diensten). Geen smaak en geen percentage: dat kan pas
// met een account. Slaat niets op over de bezoeker (alleen een gehasht IP-adres voor de ratelimiet).
//
// Zonder `aisle`: alle gangpaden in één keer, de populairste titels (de schappen bij binnenkomst).
// Met `aisle` en `sort`: één gangpad op een andere manier, als de bezoeker onder een bord wisselt:
// - `new`: Nieuw binnen, uitgekomen in het afgelopen jaar, de nieuwste eerst;
// - `top`: Top 10, de best gewaardeerde titels met veel stemmen.
export const maxDuration = 30

type Sort = 'popular' | 'new' | 'top'

// Zoveel doosjes per gangpad.
const PER_AISLE: Record<Sort, number> = { popular: 12, new: 12, top: 10 }
// Van zoveel titels halen we hooguit live bij TMDB op waar ze te zien zijn; de rest komt uit de gedeelde cache.
const WATCH_LIVE_LIMIT = 120

// Per manier: wat TMDB moet sorteren, hoeveel stemmen en welke waardering minimaal (documentaires krijgen minder stemmen),
// en hoeveel pagina's (20 titels per pagina) we ophalen.
const SORTS: Record<Sort, { sortBy: Record<MediaType, string>; minVotes: Record<MediaType, number>; minVotesDocumentary: number; minRating: string; pages: number[] }> = {
  // Bekend genoeg om te herkennen, goed genoeg om aan te raden.
  popular: { sortBy: { movie: 'popularity.desc', tv: 'popularity.desc' }, minVotes: { movie: 200, tv: 80 }, minVotesDocumentary: 30, minRating: '6.5', pages: [1, 2] },
  // De bekendste titels van het afgelopen jaar (op "nieuwste eerst" kwamen vooral onbekende titels binnen); daarna zet de
  // route ze op datum, de nieuwste vooraan. Nieuwe titels hebben nog weinig stemmen, dus een lagere grens.
  new: { sortBy: { movie: 'popularity.desc', tv: 'popularity.desc' }, minVotes: { movie: 30, tv: 15 }, minVotesDocumentary: 10, minRating: '6', pages: [1, 2] },
  // Veel stemmen, zodat een titel met een handvol hoge cijfers niet bovenaan komt. Bij series liggen de cijfers hoger
  // (fans stemmen), dus daar een hogere grens.
  top: { sortBy: { movie: 'vote_average.desc', tv: 'vote_average.desc' }, minVotes: { movie: 1000, tv: 800 }, minVotesDocumentary: 100, minRating: '7', pages: [1, 2] },
}

// Nieuw binnen: uitgekomen in de laatste zoveel dagen. Sommige diensten krijgen films pas later (Videoland had op 25 okt
// 2026 maar 2 actiefilms van het afgelopen jaar): blijven er minder dan NEW_MIN_ITEMS over, dan kijken we
// NEW_DAYS_FALLBACK terug, zodat je toch de nieuwste ziet die er zijn.
const NEW_DAYS = 365
const NEW_DAYS_FALLBACK = 3 * 365
const NEW_MIN_ITEMS = 4

interface RawItem {
  id: number
  title?: string
  name?: string
  poster_path: string | null
  overview?: string
  genre_ids?: number[]
  release_date?: string
  first_air_date?: string
  vote_average?: number
}

export interface StoreItem {
  id: number
  media_type: MediaType
  title: string
  poster_path: string | null
  overview: string
  genre_ids: number[]
  release_date: string
  vote_average: number
  watchOn?: string
}

const genresFor = (genres: readonly number[], mediaType: MediaType) =>
  genres.filter((g) => (mediaType === 'tv' ? TV_GENRE_IDS.has(g) : g < 10759 || g === 10770))

const isoDay = (date: Date) => date.toISOString().slice(0, 10)

// Eén gangpad bij TMDB: titels met een van de genres van dat gangpad, zonder de genres van de gangpaden die voorrang
// hebben (zie AISLES in lib/videotheek.ts). Anders komt bij Drama vooral binnen wat ook thriller, actie of romantiek is,
// en verhuist dat allemaal naar die gangpaden: dan bleef Drama (dat achteraan staat) bijna leeg.
// Gedeeld tussen alle bezoekers met dezelfde diensten en taal, en een dag hergebruikt door Next (ruim binnen de zes
// maanden uit de TMDB-voorwaarden).
async function fetchAisle(
  apiKey: string,
  aisleId: AisleId,
  mediaType: MediaType,
  providerIds: number[],
  language: string,
  sort: Sort,
  newDays = NEW_DAYS
): Promise<RawItem[]> {
  const position = AISLES.findIndex((a) => a.id === aisleId)
  if (position < 0) return []
  const genres = genresFor(AISLES[position].genres, mediaType)
  if (genres.length === 0) return []
  const before = genresFor(AISLES.slice(0, position).flatMap((a) => a.genres as readonly number[]), mediaType)
  const how = SORTS[sort]
  const params = new URLSearchParams({
    language,
    include_adult: 'false',
    sort_by: how.sortBy[mediaType],
    with_genres: genres.join('|'),
    'vote_count.gte': String(aisleId === 'documentaire' ? how.minVotesDocumentary : how.minVotes[mediaType]),
    'vote_average.gte': how.minRating,
  })
  if (before.length > 0) params.set('without_genres', before.join(','))
  if (sort === 'new') {
    // Alleen wat al uit is: "nieuwste eerst" zou anders beginnen bij titels die pas volgend jaar verschijnen.
    const today = new Date()
    const from = new Date(today.getTime() - newDays * 24 * 60 * 60 * 1000)
    const field = mediaType === 'movie' ? 'primary_release_date' : 'first_air_date'
    params.set(`${field}.gte`, isoDay(from))
    params.set(`${field}.lte`, isoDay(today))
  }
  if (providerIds.length > 0) {
    params.set('watch_region', 'NL')
    params.set('with_watch_providers', providerIds.join('|'))
    params.set('with_watch_monetization_types', monetizationTypesFor(providerIds))
  }
  const pages = await Promise.all(
    how.pages.map(async (page) => {
      try {
        const res = await fetch(`https://api.themoviedb.org/3/discover/${mediaType}?${params}&page=${page}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
          next: { revalidate: 60 * 60 * 24 },
        })
        if (!res.ok) return [] as RawItem[]
        return ((await res.json()).results || []) as RawItem[]
      } catch {
        return [] as RawItem[]
      }
    })
  )
  return pages.flat()
}

function toItem(raw: RawItem, mediaType: MediaType): StoreItem {
  return {
    id: raw.id,
    media_type: mediaType,
    title: raw.title || raw.name || '',
    poster_path: raw.poster_path,
    overview: raw.overview || '',
    genre_ids: raw.genre_ids || [],
    release_date: (mediaType === 'movie' ? raw.release_date : raw.first_air_date) || '',
    vote_average: Math.round((raw.vote_average ?? 0) * 10) / 10,
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const aisleParam = params.get('aisle')
  const sortParam = params.get('sort')
  // Eén gangpad anders gesorteerd (bij wisselen onder een bord) telt apart: daar tikt een bezoeker vaker op.
  const single = aisleParam !== null && (sortParam === 'new' || sortParam === 'top') && STORE_ORDER.includes(aisleParam as AisleId)
  const guard = single
    ? await guardPublicRequest(request, 'public-videotheek-aisle', LIMITS.publicVideotheekAisle)
    : await guardPublicRequest(request, 'public-videotheek', LIMITS.publicVideotheek)
  if (!guard.ok) return guard.response
  // De gedeelde cache mag alleen de server lezen, daarom via cacheWriter (de verbinding van de server).
  const db = cacheWriter(guard.supabase)

  const locale = localeFromRequest(request)
  const tr = serverTranslator(locale, 'publicVideotheek')
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) return NextResponse.json({ items: [] })

  const mediaType: MediaType = params.get('type') === 'tv' ? 'tv' : 'movie'
  // Zonder keuze: alle abonnementsdiensten die de app kent, dus wat er in Nederland te streamen is (geen titels die
  // alleen nog in de bioscoop draaien of alleen te huur zijn).
  const chosen = (params.get('services') ?? '').split(',').filter((s) => s in SOURCE_IDS)
  const services = chosen.length > 0 ? chosen : Object.keys(SOURCE_IDS).filter((s) => !RENT_ONLY_SOURCE_IDS.has(SOURCE_IDS[s]))
  const providerIds = Array.from(new Set(services.map((s) => SOURCE_IDS[s]))).sort((a, b) => a - b)
  const language = tmdbLanguage(locale)

  // Op welke van de diensten de titel staat, voor de prijssticker. Wat volgens die gegevens nergens op de diensten
  // staat, gaat uit het schap: alleen titels die je echt kunt kijken. Titels in een ander schrift (bv. Hindi of Koreaans)
  // zonder Nederlandse of Engelse titel gaan er ook uit: in een Nederlandse videotheek kun je die rug niet lezen.
  async function onShelf(items: StoreItem[]): Promise<StoreItem[]> {
    const watchInfo = await resolveWatchInfo(db, items, new Set(providerIds), { maxLive: WATCH_LIVE_LIMIT })
    const available = items.flatMap((item) => {
      const info = watchInfo.get(`${item.media_type}-${item.id}`)
      return info ? [{ ...item, watchOn: info.watchOn }] : []
    })
    return (await withLatinTitles(available)).filter((item) => !hasNonLatinTitle(item.title))
  }

  try {
    if (single) {
      const aisleId = aisleParam as AisleId
      const sort = sortParam as Sort
      const shelfFor = async (newDays?: number) => {
        const seen = new Set<number>()
        const raw = await fetchAisle(apiKey, aisleId, mediaType, providerIds, language, sort, newDays)
        return onShelf(raw.filter((r) => r.poster_path && !seen.has(r.id) && seen.add(r.id)).map((r) => toItem(r, mediaType)))
      }
      let shelf = await shelfFor()
      if (sort === 'new' && shelf.length < NEW_MIN_ITEMS) shelf = await shelfFor(NEW_DAYS_FALLBACK)
      shelf = shelf.slice(0, PER_AISLE[sort])
      // Nieuw binnen: de nieuwste vooraan.
      if (sort === 'new') shelf.sort((a, b) => b.release_date.localeCompare(a.release_date))
      return NextResponse.json({ items: shelf })
    }

    const perAisle = await Promise.all(STORE_ORDER.map((id) => fetchAisle(apiKey, id, mediaType, providerIds, language, 'popular')))
    // Elke titel in één gangpad: het gangpad dat volgens de voorrang bij zijn genres hoort, ook als hij via een ander
    // gangpad binnenkwam (een horrorkomedie uit Comedy staat bij Horror).
    const shelves = new Map<AisleId, StoreItem[]>()
    const seen = new Set<number>()
    for (const raw of perAisle.flat()) {
      if (seen.has(raw.id) || !raw.poster_path) continue
      const aisle = aisleFor(raw.genre_ids).id
      const shelf = shelves.get(aisle) ?? []
      if (shelf.length >= PER_AISLE.popular) continue
      seen.add(raw.id)
      shelf.push(toItem(raw, mediaType))
      shelves.set(aisle, shelf)
    }
    return NextResponse.json({ items: await onShelf(STORE_ORDER.flatMap((id) => shelves.get(id) ?? [])) })
  } catch (err) {
    console.error('Openbare videotheek ophalen mislukt:', err)
    return NextResponse.json({ error: tr('errLoad') }, { status: 500 })
  }
}
