'use client'

import { useEffect, useState } from 'react'
import { supabase, getCurrentUser } from '@/lib/supabase'

type FavoriteGenres = { title: string; genres: { id: number; name: string }[] }

// Waarschuwt als iemand genres uitsluit waar zijn eigen favorieten onder vallen. Dat gebeurt
// vooral als "uitsluiten" wordt gelezen als "dit vind ik leuk": de aanbevelingen worden dan
// bijna leeg, omdat elke titel met een uitgesloten genre wegvalt.
export default function ExcludedGenreWarning({
  excludedGenreIds,
  onAllow,
}: {
  excludedGenreIds: number[]
  onAllow: (genreId: number) => void
}) {
  const [favorites, setFavorites] = useState<FavoriteGenres[]>([])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const user = await getCurrentUser()
      if (!user) return
      // Filteren op user_id is nodig: met een gekoppelde partner geeft de tabel ook diens favorieten terug.
      const { data: favs } = await supabase
        .from('favorite_movies')
        .select('tmdb_id, title, media_type')
        .eq('user_id', user.id)
      if (!favs || favs.length === 0) return

      const detailRows = await Promise.all(
        (['movie', 'tv'] as const).map(async (type) => {
          const ids = favs.filter((f) => f.media_type === type).map((f) => f.tmdb_id)
          if (ids.length === 0) return []
          const { data } = await supabase
            .from('tmdb_details_cache')
            .select('tmdb_id, genres')
            .eq('media_type', type)
            .in('tmdb_id', ids)
          return (data || []).map((row) => ({ key: `${type}-${row.tmdb_id}`, genres: row.genres as { id: number; name: string }[] }))
        })
      )
      const genresByKey = new Map(detailRows.flat().map((row) => [row.key, row.genres]))
      if (cancelled) return
      setFavorites(
        favs
          .map((f) => ({ title: f.title as string, genres: genresByKey.get(`${f.media_type}-${f.tmdb_id}`) ?? [] }))
          .filter((f) => f.genres.length > 0)
      )
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const excluded = new Set(excludedGenreIds)
  const conflicts = new Map<number, { name: string; titles: string[] }>()
  for (const fav of favorites) {
    for (const genre of fav.genres) {
      if (!excluded.has(genre.id)) continue
      const entry = conflicts.get(genre.id) ?? { name: genre.name, titles: [] }
      if (!entry.titles.includes(fav.title)) entry.titles.push(fav.title)
      conflicts.set(genre.id, entry)
    }
  }
  if (conflicts.size === 0) return null

  return (
    <div className="rounded-xl border border-[#E8A33D]/40 bg-[#E8A33D]/5 p-4 mb-6">
      <p className="text-sm font-medium text-[#E8A33D]">Klopt dit? Je favorieten vallen in genres die je hebt uitgesloten</p>
      <p className="text-xs text-[#93A3B5] mt-1 leading-relaxed">
        Uitgesloten genres worden nooit aanbevolen, ook niet als een favoriet erop lijkt. Dat maakt je aanbevelingen erg
        smal. Vink alleen aan wat je écht niet wilt zien.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {Array.from(conflicts.entries()).map(([id, { name, titles }]) => (
          <li key={id} className="flex items-center gap-3 text-sm">
            <span className="flex-1 min-w-0">
              <span className="font-medium">{name}</span>
              <span className="text-[#93A3B5]">
                {' '}
                — {titles.slice(0, 3).join(', ')}
                {titles.length > 3 ? ` en ${titles.length - 3} andere` : ''}
              </span>
            </span>
            <button
              onClick={() => onAllow(id)}
              className="flex-shrink-0 text-xs font-medium rounded-full border border-[#E8A33D] text-[#E8A33D] px-3 py-1.5 touch-manipulation hover:bg-[#E8A33D]/10 transition-colors"
            >
              Weer toestaan
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
