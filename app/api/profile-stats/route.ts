import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getCachedDetails, getCreditsBulk, type MediaType } from '@/lib/recommendationEngine'

// Zelfde reden als bij /api/recommendations-together: bij een koude cache moeten hier
// mogelijk tientallen TMDB-detail- en credits-opzoekingen gebeuren.
export const maxDuration = 60

type WatchedTitle = { tmdb_id: number; title: string; media_type: MediaType }

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

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

    return NextResponse.json({
      totalWatched: watched.length,
      movieCount,
      tvCount,
      ratingCounts,
      topGenres,
      topActors,
    })
  } catch (err) {
    console.error('Kijkprofiel berekenen mislukt:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Onbekende fout bij het berekenen van je kijkprofiel' },
      { status: 500 }
    )
  }
}
