import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { localeFromRequest, tmdbLanguage } from '@/lib/serverI18n'
import { SOURCE_IDS, resolveWatchInfo } from '@/lib/recommendationEngine'
import { withLatinTitles } from '@/lib/titleFallback'

// Alle films en series van één acteur of regisseur, voor de pagina app/persoon/[id]. Per titel: waar hij op je diensten te
// zien is, of je hem al kent (beoordeeld of favoriet, of op je kijklijst) en of hij nog uit moet komen. Raakt de
// aanbevelingen niet.

const CACHE_SECONDS = 60 * 60 * 24
// Talkshows en nieuws zeggen niets over het werk van iemand (zelfde als bij "Bekend van", app/api/person-info).
const EXCLUDED_GENRE_IDS = new Set([10767, 10763])
// Optredens als zichzelf (prijsuitreikingen, documentaires over de maker, gastrollen in shows).
const SELF_CHARACTER = /^(self|himself|herself|themselves|zichzelf)\b/i
// Zoveel titels zonder bewaarde kijkinformatie halen we live op; de rest staat er zonder dienst bij en wordt bij een
// volgende keer aangevuld.
const AVAILABILITY_LIVE_LIMIT = 60

type CreditEntry = {
  id: number
  media_type: 'movie' | 'tv' | 'person'
  title?: string
  name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string | null
  genre_ids?: number[]
  character?: string
  job?: string
}

export type PersonTitle = {
  id: number
  media_type: 'movie' | 'tv'
  title: string
  poster_path: string | null
  release_date: string
  upcoming: boolean
  watchOn: string | null
  status: 'gezien' | 'kijklijst' | null
}

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'title-info', LIMITS.titleInfo)
  if (!guard.ok) return guard.response
  // Taal van de app (cookie of browser): titels, samenvattingen en genres van TMDB in die taal.
  const language = tmdbLanguage(localeFromRequest(request))
  const { supabase, user } = guard

  const id = parseInt(request.nextUrl.searchParams.get('id') || '', 10)
  if (!id) return NextResponse.json({ error: 'Ongeldig id' }, { status: 400 })
  const askedRole = request.nextUrl.searchParams.get('rol')

  try {
    // Zelfde aanroep als app/api/person-info, dus dezelfde bewaarde kopie.
    const res = await fetch(`https://api.themoviedb.org/3/person/${id}?language=${language}&append_to_response=combined_credits`, {
      headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      next: { revalidate: CACHE_SECONDS },
    })
    if (!res.ok) return NextResponse.json({ error: `TMDB gaf status ${res.status}` }, { status: 502 })
    const data = await res.json()

    const directed: CreditEntry[] = (data.combined_credits?.crew || []).filter((c: CreditEntry) => c.job === 'Director')
    const acted: CreditEntry[] = (data.combined_credits?.cast || []).filter((c: CreditEntry) => !SELF_CHARACTER.test(c.character || ''))
    // Als regisseur of als acteur: wat er gevraagd is (bv. vanuit je favoriete regisseurs), anders waar iemand bekend om is.
    // Heeft iemand in die rol niets, dan de andere.
    let role: 'regisseur' | 'acteur' =
      askedRole === 'regisseur' || (askedRole !== 'acteur' && data.known_for_department === 'Directing') ? 'regisseur' : 'acteur'
    if (role === 'regisseur' && directed.length === 0 && acted.length > 0) role = 'acteur'
    if (role === 'acteur' && acted.length === 0 && directed.length > 0) role = 'regisseur'

    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
    const seen = new Set<string>()
    const titles = (role === 'regisseur' ? directed : acted)
      .filter((c): c is CreditEntry & { media_type: 'movie' | 'tv' } => c.media_type === 'movie' || c.media_type === 'tv')
      .filter((c) => !(c.genre_ids || []).some((g) => EXCLUDED_GENRE_IDS.has(g)))
      // Zonder datum is het meestal een aankondiging of gerucht, zonder poster vaak iets heel kleins.
      .filter((c) => (c.release_date || c.first_air_date) && c.poster_path)
      .filter((c) => {
        const key = `${c.media_type}-${c.id}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((c) => {
        const releaseDate = (c.release_date || c.first_air_date)!
        return {
          id: c.id,
          media_type: c.media_type,
          title: c.title || c.name || '',
          poster_path: c.poster_path ?? null,
          release_date: releaseDate,
          upcoming: releaseDate > today,
        }
      })
      // Binnenkort bovenaan (eerstvolgende eerst), daarna de nieuwste eerst.
      .sort((a, b) =>
        a.upcoming !== b.upcoming
          ? Number(b.upcoming) - Number(a.upcoming)
          : a.upcoming
            ? a.release_date.localeCompare(b.release_date)
            : b.release_date.localeCompare(a.release_date)
      )

    const ids = [...new Set(titles.map((t) => t.id))]
    const [{ data: profile }, ratings, favorites, watchlist] = await Promise.all([
      supabase.from('profiles').select('streaming_services').eq('id', user.id).single(),
      supabase.from('ratings').select('tmdb_id, media_type').eq('user_id', user.id).in('tmdb_id', ids),
      supabase.from('favorite_movies').select('tmdb_id, media_type').eq('user_id', user.id).in('tmdb_id', ids),
      supabase.from('watchlist').select('tmdb_id, media_type').eq('user_id', user.id).in('tmdb_id', ids),
    ])
    const keyOf = (r: { media_type: string; tmdb_id: number }) => `${r.media_type}-${r.tmdb_id}`
    const seenKeys = new Set([...(ratings.data || []), ...(favorites.data || [])].map(keyOf))
    const watchlistKeys = new Set((watchlist.data || []).map(keyOf))

    const sourceIds = new Set(((profile?.streaming_services || []) as string[]).map((s) => SOURCE_IDS[s]).filter(Boolean))
    const released = titles.filter((t) => !t.upcoming)
    const watchInfo =
      sourceIds.size > 0 && released.length > 0
        ? await resolveWatchInfo(supabase, released, sourceIds, { maxLive: AVAILABILITY_LIVE_LIMIT })
        : new Map<string, { watchOn: string; watchUrl: string } | null>()

    const items: PersonTitle[] = await withLatinTitles(
      titles.map((t) => {
        const key = `${t.media_type}-${t.id}`
        return {
          ...t,
          watchOn: watchInfo.get(key)?.watchOn ?? null,
          status: seenKeys.has(key) ? 'gezien' : watchlistKeys.has(key) ? 'kijklijst' : null,
        }
      })
    )

    return NextResponse.json({
      name: data.name || '',
      profilePath: data.profile_path || null,
      role,
      hasServices: sourceIds.size > 0,
      items,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Onbekende fout' }, { status: 500 })
  }
}
