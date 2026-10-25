import { NextRequest, NextResponse } from 'next/server'
import { guardPublicRequest, LIMITS } from '@/lib/apiGuard'
import { RENT_ONLY_SOURCE_IDS, SOURCE_IDS, resolveWatchInfo, type MediaType } from '@/lib/recommendationEngine'
import { cacheWriter } from '@/lib/supabaseAdmin'
import { localeFromRequest, serverTranslator, tmdbLanguage } from '@/lib/serverI18n'
import { withLatinTitles } from '@/lib/titleFallback'

// "Meer zoals deze" op de openbare videotheek (/videotheek), zonder account. Eenvoudiger dan de versie in de app
// (app/api/more-like-this): geen smaak en geen verhaal-vingerafdrukken (geen AI op TMDB-gegevens voor bezoekers), maar
// TMDB's eigen "lijkt hierop"-lijst, in de volgorde van TMDB, met een paar regels om duidelijke missers weg te laten:
// - minstens één gedeeld genre, waarbij Drama niet meetelt (dat zit bij bijna alles), behalve als de titel zelf alleen
//   drama is;
// - alleen bekende, goed gewaardeerde titels (dezelfde grens als in de schappen);
// - alleen wat op de gekozen diensten staat (zonder keuze: alle abonnementsdiensten);
// - minder dan MIN_ITEMS over: dan liever niets (de pagina meldt dat) dan een rijtje van één of twee.
export const maxDuration = 30

const MAX_ITEMS = 10
const MIN_ITEMS = 3
const MIN_VOTES: Record<MediaType, number> = { movie: 200, tv: 80 }
const MIN_RATING = 6.5
const DRAMA = 18
// TMDB's lijst, twee pagina's (40 titels).
const PAGES = [1, 2]
// Van zoveel kandidaten halen we hooguit live bij TMDB op waar ze te zien zijn.
const WATCH_LIVE_LIMIT = 40

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
  vote_count?: number
}

// Gedeeld tussen alle bezoekers en een dag hergebruikt door Next (ruim binnen de zes maanden uit de TMDB-voorwaarden).
async function tmdb<T>(path: string, apiKey: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 60 * 60 * 24 },
    })
    return res.ok ? ((await res.json()) as T) : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const guard = await guardPublicRequest(request, 'public-videotheek-similar', LIMITS.publicVideotheekSimilar)
  if (!guard.ok) return guard.response

  const locale = localeFromRequest(request)
  const tr = serverTranslator(locale, 'publicVideotheek')
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) return NextResponse.json({ items: [] })
  const params = request.nextUrl.searchParams
  const mediaType: MediaType = params.get('type') === 'tv' ? 'tv' : 'movie'
  const id = parseInt(params.get('id') || '', 10)
  if (!id || id < 1) return NextResponse.json({ error: tr('errLoad') }, { status: 400 })

  const chosen = (params.get('services') ?? '').split(',').filter((s) => s in SOURCE_IDS)
  const services = chosen.length > 0 ? chosen : Object.keys(SOURCE_IDS).filter((s) => !RENT_ONLY_SOURCE_IDS.has(SOURCE_IDS[s]))
  const providerIds = new Set(services.map((s) => SOURCE_IDS[s]))
  const language = tmdbLanguage(locale)

  try {
    const [seed, ...pages] = await Promise.all([
      tmdb<{ genres?: { id: number }[] }>(`${mediaType}/${id}?language=${language}`, apiKey),
      ...PAGES.map((page) => tmdb<{ results?: RawItem[] }>(`${mediaType}/${id}/recommendations?language=${language}&page=${page}`, apiKey)),
    ])
    const seedGenres = (seed?.genres ?? []).map((g) => g.id)
    const coreGenres = seedGenres.some((g) => g !== DRAMA) ? seedGenres.filter((g) => g !== DRAMA) : seedGenres

    const seen = new Set<number>([id])
    const candidates = pages
      .flatMap((page) => page?.results ?? [])
      .filter((item) => {
        if (seen.has(item.id) || !item.poster_path) return false
        seen.add(item.id)
        const genres = item.genre_ids ?? []
        return (
          (coreGenres.length === 0 || genres.some((g) => coreGenres.includes(g))) &&
          (item.vote_count ?? 0) >= MIN_VOTES[mediaType] &&
          (item.vote_average ?? 0) >= MIN_RATING
        )
      })
      .map((item) => ({
        id: item.id,
        media_type: mediaType,
        title: item.title || item.name || '',
        poster_path: item.poster_path,
        overview: item.overview || '',
        genre_ids: item.genre_ids || [],
        release_date: (mediaType === 'movie' ? item.release_date : item.first_air_date) || '',
        vote_average: Math.round((item.vote_average ?? 0) * 10) / 10,
      }))

    // De gedeelde cache met diensten mag alleen de server lezen en schrijven, daarom via cacheWriter.
    const watchInfo = await resolveWatchInfo(cacheWriter(guard.supabase), candidates, providerIds, { maxLive: WATCH_LIVE_LIMIT })
    const items = candidates
      .flatMap((item) => {
        const info = watchInfo.get(`${item.media_type}-${item.id}`)
        return info ? [{ ...item, watchOn: info.watchOn }] : []
      })
      .slice(0, MAX_ITEMS)

    return NextResponse.json({ items: items.length >= MIN_ITEMS ? await withLatinTitles(items) : [] })
  } catch (err) {
    console.error('Openbare videotheek, meer zoals deze mislukt:', err)
    return NextResponse.json({ error: tr('errLoad') }, { status: 500 })
  }
}
