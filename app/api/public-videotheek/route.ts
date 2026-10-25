import { NextRequest, NextResponse } from 'next/server'
import { guardPublicRequest, LIMITS } from '@/lib/apiGuard'
import { RENT_ONLY_SOURCE_IDS, SOURCE_IDS, monetizationTypesFor, resolveWatchInfo, type MediaType } from '@/lib/recommendationEngine'
import { cacheWriter } from '@/lib/supabaseAdmin'
import { localeFromRequest, serverTranslator, tmdbLanguage } from '@/lib/serverI18n'
import { withLatinTitles } from '@/lib/titleFallback'
import { AISLES, STORE_ORDER, TV_GENRE_IDS, aisleFor, type AisleId } from '@/lib/videotheek'

// De openbare videotheek (/videotheek): zonder account door de gangpaden lopen. Per gangpad bekende, goed gewaardeerde
// titels op de diensten die de bezoeker aantikt (zonder keuze: alle diensten). Geen smaak en geen percentage: dat kan pas
// met een account. Slaat niets op over de bezoeker (alleen een gehasht IP-adres voor de ratelimiet).
export const maxDuration = 30

// Zoveel doosjes per gangpad.
const PER_AISLE = 12
// Van zoveel titels halen we hooguit live bij TMDB op waar ze te zien zijn; de rest komt uit de gedeelde cache.
const WATCH_LIVE_LIMIT = 120

// Bekend genoeg om te herkennen, goed genoeg om aan te raden. Documentaires krijgen minder stemmen, dus een lagere grens.
const MIN_VOTES: Record<MediaType, number> = { movie: 200, tv: 80 }
const MIN_VOTES_DOCUMENTARY = 30
const MIN_RATING = '6.5'

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

// Twee pagina's van TMDB per gangpad (40 titels): genoeg om na het wegvallen van titels zonder poster of zonder dienst
// nog een vol schap over te houden.
const PAGES = [1, 2]

const genresFor = (genres: readonly number[], mediaType: MediaType) =>
  genres.filter((g) => (mediaType === 'tv' ? TV_GENRE_IDS.has(g) : g < 10759 || g === 10770))

// Eén gangpad bij TMDB: de populairste titels met een van de genres van dat gangpad, zonder de genres van de gangpaden
// die voorrang hebben (zie AISLES in lib/videotheek.ts). Anders komt bij Drama vooral binnen wat ook thriller, actie of
// romantiek is, en verhuist dat allemaal naar die gangpaden: dan bleef Drama (dat achteraan staat) bijna leeg.
// Gedeeld tussen alle bezoekers met dezelfde diensten en taal, en een dag hergebruikt door Next (ruim binnen de zes
// maanden uit de TMDB-voorwaarden).
async function fetchAisle(apiKey: string, aisleId: AisleId, mediaType: MediaType, providerIds: number[], language: string): Promise<RawItem[]> {
  const position = AISLES.findIndex((a) => a.id === aisleId)
  if (position < 0) return []
  const genres = genresFor(AISLES[position].genres, mediaType)
  if (genres.length === 0) return []
  const before = genresFor(AISLES.slice(0, position).flatMap((a) => a.genres as readonly number[]), mediaType)
  const params = new URLSearchParams({
    language,
    include_adult: 'false',
    sort_by: 'popularity.desc',
    with_genres: genres.join('|'),
    'vote_count.gte': String(aisleId === 'documentaire' ? MIN_VOTES_DOCUMENTARY : MIN_VOTES[mediaType]),
    'vote_average.gte': MIN_RATING,
  })
  if (before.length > 0) params.set('without_genres', before.join(','))
  if (providerIds.length > 0) {
    params.set('watch_region', 'NL')
    params.set('with_watch_providers', providerIds.join('|'))
    params.set('with_watch_monetization_types', monetizationTypesFor(providerIds))
  }
  const pages = await Promise.all(
    PAGES.map(async (page) => {
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

export async function GET(request: NextRequest) {
  const guard = await guardPublicRequest(request, 'public-videotheek', LIMITS.publicVideotheek)
  if (!guard.ok) return guard.response

  const locale = localeFromRequest(request)
  const tr = serverTranslator(locale, 'publicVideotheek')
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) return NextResponse.json({ items: [] })

  const mediaType: MediaType = request.nextUrl.searchParams.get('type') === 'tv' ? 'tv' : 'movie'
  // Zonder keuze: alle abonnementsdiensten die de app kent, dus wat er in Nederland te streamen is (geen titels die
  // alleen nog in de bioscoop draaien of alleen te huur zijn).
  const chosen = (request.nextUrl.searchParams.get('services') ?? '').split(',').filter((s) => s in SOURCE_IDS)
  const services = chosen.length > 0 ? chosen : Object.keys(SOURCE_IDS).filter((s) => !RENT_ONLY_SOURCE_IDS.has(SOURCE_IDS[s]))
  const providerIds = Array.from(new Set(services.map((s) => SOURCE_IDS[s]))).sort((a, b) => a - b)

  try {
    const perAisle = await Promise.all(STORE_ORDER.map((id) => fetchAisle(apiKey, id, mediaType, providerIds, tmdbLanguage(locale))))

    // Elke titel in één gangpad: het gangpad dat volgens de voorrang bij zijn genres hoort, ook als hij via een ander
    // gangpad binnenkwam (een horrorkomedie uit Comedy staat bij Horror).
    const shelves = new Map<AisleId, StoreItem[]>()
    const seen = new Set<number>()
    for (const raw of perAisle.flat()) {
      if (seen.has(raw.id) || !raw.poster_path) continue
      const aisle = aisleFor(raw.genre_ids).id
      const shelf = shelves.get(aisle) ?? []
      if (shelf.length >= PER_AISLE) continue
      seen.add(raw.id)
      shelf.push({
        id: raw.id,
        media_type: mediaType,
        title: raw.title || raw.name || '',
        poster_path: raw.poster_path,
        overview: raw.overview || '',
        genre_ids: raw.genre_ids || [],
        release_date: (mediaType === 'movie' ? raw.release_date : raw.first_air_date) || '',
        vote_average: Math.round((raw.vote_average ?? 0) * 10) / 10,
      })
      shelves.set(aisle, shelf)
    }
    const items = STORE_ORDER.flatMap((id) => shelves.get(id) ?? [])

    // Op welke van de diensten de titel staat, voor de prijssticker. Wat volgens die gegevens nergens op de diensten
    // staat, gaat uit het schap: alleen titels die je echt kunt kijken. De gedeelde cache mag alleen de server lezen,
    // daarom via cacheWriter (de verbinding van de server).
    const watchInfo = await resolveWatchInfo(cacheWriter(guard.supabase), items, new Set(providerIds), { maxLive: WATCH_LIVE_LIMIT })
    const available = items.flatMap((item) => {
      const info = watchInfo.get(`${item.media_type}-${item.id}`)
      return info ? [{ ...item, watchOn: info.watchOn }] : []
    })

    return NextResponse.json({ items: await withLatinTitles(available) })
  } catch (err) {
    console.error('Openbare videotheek ophalen mislukt:', err)
    return NextResponse.json({ error: tr('errLoad') }, { status: 500 })
  }
}
