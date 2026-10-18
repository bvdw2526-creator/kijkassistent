import { NextRequest, NextResponse, after } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import {
  getCachedDetailsBulk,
  getCreditsBulk,
  getWatchProvidersBulk,
  SOURCE_IDS,
  RENT_ONLY_SOURCE_IDS,
  StaleCacheRefresher,
  CREDITS_LIVE_LIMIT,
  type MediaType,
} from '@/lib/recommendationEngine'
import { findDislikedGenres } from '@/lib/dislikedGenres'

const SERVICE_LABELS: Record<string, string> = {
  netflix: 'Netflix',
  videoland: 'Videoland',
  disney_plus: 'Disney+',
  amazon_prime: 'Prime Video',
  hbo_max: 'HBO Max',
  apple_tv: 'Apple TV',
  skyshowtime: 'SkyShowtime',
  viaplay: 'Viaplay',
  npo_start: 'NPO Start',
}

// Zelfde reden als bij /api/recommendations-together: bij een koude cache moeten hier
// mogelijk tientallen TMDB-detail- en credits-opzoekingen gebeuren.
export const maxDuration = 60

type WatchedTitle = { tmdb_id: number; title: string; media_type: MediaType }

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'profile-stats', LIMITS.profileStats)
  if (!guard.ok) return guard.response
  const { supabase, user } = guard

  try {
    const [{ data: favorites }, { data: ratings }] = await Promise.all([
      supabase.from('favorite_movies').select('tmdb_id, title, media_type').eq('user_id', user.id),
      supabase.from('ratings').select('tmdb_id, title, media_type, rating').eq('user_id', user.id),
    ])

    // "Gezien" = favorieten + alles wat beoordeeld is — je voegt iets niet als favoriet
    // toe of beoordeelt het pas nadat je het hebt gezien. Gededupliceerd op
    // tmdb_id+media_type, want iets kan zowel favoriet als beoordeeld zijn.
    const watchedMap = new Map<string, WatchedTitle>()
    for (const f of favorites || []) watchedMap.set(`${f.media_type}-${f.tmdb_id}`, f as WatchedTitle)
    for (const r of ratings || []) watchedMap.set(`${r.media_type}-${r.tmdb_id}`, r as WatchedTitle)
    const watched = Array.from(watchedMap.values())

    if (watched.length === 0) {
      return NextResponse.json({
        totalWatched: 0,
        movieCount: 0,
        tvCount: 0,
        ratingCounts: { fav: 0, love: 0, ok: 0, dislike: 0 },
        topGenres: [],
        topActors: [],
        dislikedGenres: [],
        streaming: { lovedTotal: 0, services: [] },
      })
    }

    const movieCount = watched.filter((w) => w.media_type === 'movie').length
    const tvCount = watched.filter((w) => w.media_type === 'tv').length

    // Favorieten staan los van de beoordelingen: een titel is óf favoriet óf beoordeeld (zie de migratie
    // 20261017_favorite_or_rating).
    const ratingCounts = { fav: (favorites || []).length, love: 0, ok: 0, dislike: 0 }
    for (const r of ratings || []) {
      if (r.rating === 'love') ratingCounts.love++
      else if (r.rating === 'ok') ratingCounts.ok++
      else if (r.rating === 'dislike') ratingCounts.dislike++
    }

    // Favoriete genre gaat over waar je van houdt — "niet voor mij"-beoordeelde titels
    // tellen daarom niet mee, favorieten en "was oké" wel.
    const dislikedKeys = new Set(
      (ratings || []).filter((r) => r.rating === 'dislike').map((r) => `${r.media_type}-${r.tmdb_id}`)
    )
    const likedTitles = watched.filter((w) => !dislikedKeys.has(`${w.media_type}-${w.tmdb_id}`))

    // "Echt leuk" = favorieten + "zeker leuk"-beoordelingen (niet "was oké"). Alleen abonnements-aanbod (type 'sub')
    // telt: huren/kopen zegt niets over welk abonnement je het best kunt houden.
    const lovedMap = new Map<string, WatchedTitle>()
    for (const f of favorites || []) lovedMap.set(`${f.media_type}-${f.tmdb_id}`, f as WatchedTitle)
    for (const r of ratings || []) {
      if (r.rating === 'love') lovedMap.set(`${r.media_type}-${r.tmdb_id}`, r as WatchedTitle)
    }
    const loved = Array.from(lovedMap.values())

    // De vier opzoekingen hebben niets met elkaar te maken, dus tegelijk: ze lezen uit de cache en halen bij een koude
    // cache live bij TMDB op, en na elkaar tellen die wachttijden op. Verlopen rijen worden gebruikt en na het antwoord
    // ververst (zie StaleCacheRefresher), zodat de Stats-pagina niet wacht op een golf verlopen gegevens.
    const stale = new StaleCacheRefresher()
    const [detailsByKey, creditsByKey, providersByKey, { data: profile }] = await Promise.all([
      // Alles wat je gezien hebt, ook "niet voor mij": die zijn nodig voor "Niet jouw ding".
      getCachedDetailsBulk(
        supabase,
        watched.map((w) => ({ mediaType: w.media_type, tmdbId: w.tmdb_id })),
        { onStale: stale.onDetails }
      ),
      // Favoriete acteurs/actrices in dit overzicht gaan over wie je toevallig het vaakst tegenkomt in wat je hebt gezien,
      // dus over alles, ook "niet voor mij"-titels.
      getCreditsBulk(
        supabase,
        watched.map((w) => ({ mediaType: w.media_type, tmdbId: w.tmdb_id })),
        { onStale: stale.onCredits, maxLive: CREDITS_LIVE_LIMIT }
      ),
      getWatchProvidersBulk(
        supabase,
        loved.map((t) => ({ mediaType: t.media_type, tmdbId: t.tmdb_id })),
        { onStale: stale.onWatchProviders }
      ),
      supabase.from('profiles').select('streaming_services').eq('id', user.id).single(),
    ])
    // Op naam geteld (film- en seriegenre met dezelfde naam samen); het id gaat mee zodat de app de naam kan vertalen.
    const genreCounts = new Map<string, { id: number; count: number }>()
    for (const t of likedTitles) {
      const details = detailsByKey.get(t.media_type + '-' + t.tmdb_id)
      if (!details) continue
      for (const genre of details.genres) {
        const entry = genreCounts.get(genre.name) ?? { id: genre.id, count: 0 }
        entry.count += 1
        genreCounts.set(genre.name, entry)
      }
    }
    const topGenres = Array.from(genreCounts.entries())
      .map(([name, { id, count }]) => ({ name, id, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const dislikedGenres = findDislikedGenres(
      watched.map((w) => `${w.media_type}-${w.tmdb_id}`),
      dislikedKeys,
      detailsByKey
    )
      .slice(0, 4)
      .map(({ name, disliked, total }) => ({ name, disliked, total }))

    // Per acteur/actrice ook de titels waarin je hem of haar zag: op de Stats-pagina klik je erop door.
    const actors = new Map<number, { id: number; name: string; titles: { id: number; media_type: MediaType; title: string }[] }>()
    for (const w of watched) {
      const credits = creditsByKey.get(`${w.media_type}-${w.tmdb_id}`)
      if (!credits) continue
      for (const actor of credits.cast) {
        const entry = actors.get(actor.id) ?? { id: actor.id, name: actor.name, titles: [] }
        entry.titles.push({ id: w.tmdb_id, media_type: w.media_type, title: w.title })
        actors.set(actor.id, entry)
      }
    }
    const topActors = Array.from(actors.values())
      .map((a) => ({ ...a, count: a.titles.length }))
      // Pas de moeite waard om te tonen als iemand écht vaker dan één keer voorkomt.
      .filter((a) => a.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const ownedServices = new Set<string>(profile?.streaming_services || [])

    // Huuraanbieders (Pathé Thuis) tellen we niet mee: die zeggen niets over welk abonnement je
    // het best kunt houden.
    const streamingServices = Object.entries(SOURCE_IDS)
      .filter(([, providerId]) => !RENT_ONLY_SOURCE_IDS.has(providerId))
      .map(([id, providerId]) => ({
        id,
        label: SERVICE_LABELS[id] ?? id,
        owned: ownedServices.has(id),
        count: loved.filter((t) =>
          (providersByKey.get(`${t.media_type}-${t.tmdb_id}`) || []).some(
            (s) => s.type === 'sub' && s.provider_id === providerId
          )
        ).length,
      }))
      .sort((a, b) => b.count - a.count)

    if (stale.size > 0) {
      after(async () => {
        try {
          console.log('Stats: verlopen gegevens ververst', await stale.refresh(supabase))
        } catch (err) {
          console.error('Stats: verlopen gegevens verversen mislukt:', err)
        }
      })
    }

    return NextResponse.json({
      totalWatched: watched.length,
      movieCount,
      tvCount,
      ratingCounts,
      topGenres,
      topActors,
      dislikedGenres,
      streaming: { lovedTotal: loved.length, services: streamingServices },
    })
  } catch (err) {
    console.error('Kijkprofiel berekenen mislukt:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Onbekende fout bij het berekenen van je kijkprofiel' },
      { status: 500 }
    )
  }
}
