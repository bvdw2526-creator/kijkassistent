import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { getCachedDetails, getCreditsBulk, getWatchProvidersBulk, SOURCE_IDS, type MediaType } from '@/lib/recommendationEngine'

const SERVICE_LABELS: Record<string, string> = {
  netflix: 'Netflix',
  videoland: 'Videoland',
  disney_plus: 'Disney+',
  amazon_prime: 'Prime Video',
  hbo_max: 'HBO Max',
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
        ratingCounts: { love: 0, ok: 0, dislike: 0 },
        topGenres: [],
        topActors: [],
        streaming: { lovedTotal: 0, services: [] },
      })
    }

    const movieCount = watched.filter((w) => w.media_type === 'movie').length
    const tvCount = watched.filter((w) => w.media_type === 'tv').length

    const ratingCounts = { love: 0, ok: 0, dislike: 0 }
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

    const detailsByTitle = await Promise.all(
      likedTitles.map((t) => getCachedDetails(supabase, t.media_type, t.tmdb_id))
    )
    const genreCounts = new Map<string, number>()
    for (const details of detailsByTitle) {
      for (const genre of details.genres) {
        genreCounts.set(genre.name, (genreCounts.get(genre.name) || 0) + 1)
      }
    }
    const topGenres = Array.from(genreCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Favoriete acteurs/actrices in dit overzicht gaan over wie je toevallig het vaakst
    // tegenkomt in wat je hebt gezien — dus over alles, ook "niet voor mij"-titels, niet
    // alleen over wat je goed vond.
    const creditsByKey = await getCreditsBulk(
      supabase,
      watched.map((w) => ({ mediaType: w.media_type, tmdbId: w.tmdb_id }))
    )
    const actorCounts = new Map<string, number>()
    for (const w of watched) {
      const credits = creditsByKey.get(`${w.media_type}-${w.tmdb_id}`)
      if (!credits) continue
      for (const actor of credits.cast) {
        actorCounts.set(actor.name, (actorCounts.get(actor.name) || 0) + 1)
      }
    }
    const topActors = Array.from(actorCounts.entries())
      .map(([name, count]) => ({ name, count }))
      // Pas de moeite waard om te tonen als iemand écht vaker dan één keer voorkomt.
      .filter((a) => a.count > 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // "Echt leuk" = favorieten + "zeker leuk"-beoordelingen (niet "was oké"). Alleen
    // abonnements-aanbod (type 'sub') telt: huren/kopen zegt niets over welk abonnement
    // je het best kunt houden.
    const lovedMap = new Map<string, WatchedTitle>()
    for (const f of favorites || []) lovedMap.set(`${f.media_type}-${f.tmdb_id}`, f as WatchedTitle)
    for (const r of ratings || []) {
      if (r.rating === 'love') lovedMap.set(`${r.media_type}-${r.tmdb_id}`, r as WatchedTitle)
    }
    const loved = Array.from(lovedMap.values())

    const providersByKey = await getWatchProvidersBulk(
      supabase,
      loved.map((t) => ({ mediaType: t.media_type, tmdbId: t.tmdb_id }))
    )
    const { data: profile } = await supabase
      .from('profiles')
      .select('streaming_services')
      .eq('id', user.id)
      .single()
    const ownedServices = new Set<string>(profile?.streaming_services || [])

    const streamingServices = Object.entries(SOURCE_IDS)
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

    return NextResponse.json({
      totalWatched: watched.length,
      movieCount,
      tvCount,
      ratingCounts,
      topGenres,
      topActors,
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
