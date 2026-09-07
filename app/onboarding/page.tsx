'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Movie = {
  id: number
  title: string
  poster_path: string | null
  release_date?: string
  media_type: 'movie' | 'tv'
}

export default function Onboarding() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Movie[]>([])
  const [favorites, setFavorites] = useState<Movie[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadFavorites()
  }, [])

  async function loadFavorites() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('favorite_movies')
      .select('tmdb_id, title, media_type')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false })

    if (data) {
      setFavorites(
        data.map((f) => ({
          id: f.tmdb_id,
          title: f.title,
          poster_path: null,
          media_type: f.media_type as 'movie' | 'tv',
        }))
      )
    }
  }

  async function handleSearch() {
    if (!query) return
    setLoading(true)
    const res = await fetch(`/api/search-movies?query=${encodeURIComponent(query)}`)
    const data = await res.json()
    setResults(data.results || [])
    setLoading(false)
  }

  async function addFavorite(movie: Movie) {
    if (favorites.find((f) => f.id === movie.id && f.media_type === movie.media_type)) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('favorite_movies').insert({
      user_id: user.id,
      tmdb_id: movie.id,
      title: movie.title,
      media_type: movie.media_type,
    })
    if (!error) setFavorites([movie, ...favorites])
  }

  async function removeFavorite(movie: Movie) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error } = await supabase
      .from('favorite_movies')
      .delete()
      .eq('user_id', user.id)
      .eq('tmdb_id', movie.id)
      .eq('media_type', movie.media_type)

    if (!error) {
      setFavorites(favorites.filter((f) => !(f.id === movie.id && f.media_type === movie.media_type)))
    }
  }

  const movieFavorites = favorites.filter((f) => f.media_type === 'movie')
  const tvFavorites = favorites.filter((f) => f.media_type === 'tv')

  return (
    <main className="max-w-xl mx-auto px-6 py-10">
      <h1 className="font-display text-2xl mb-1">Films en series die je mooi vond</h1>
      <p className="text-[#9FB0C2] mb-6">Zoek minstens 5 titels, zodat we je smaak leren kennen.</p>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          placeholder="Zoek een film of serie..."
          className="flex-1 bg-[#202B3A] border border-[#3A4A5C] rounded-sm px-3 py-2.5 text-[#F2EFE9] placeholder:text-[#6B7A8C] outline-none focus:border-[#E8A33D] transition-colors"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-[#E8A33D] text-[#171F2B] font-medium rounded-sm px-5 hover:bg-[#F0B457] transition-colors disabled:opacity-50"
        >
          Zoeken
        </button>
      </div>

      {results.length > 0 && (
        <div className="flex flex-col mb-10">
          {results.map((movie, i) => {
            const added = favorites.find((f) => f.id === movie.id && f.media_type === movie.media_type)
            return (
              <div
                key={`${movie.media_type}-${movie.id}`}
                className={`flex items-center gap-3 py-3 ${i !== results.length - 1 ? 'border-b border-dashed border-[#3A4A5C]' : ''}`}
              >
                {movie.poster_path && (
                  <img
                    src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                    alt={movie.title}
                    className="w-10 rounded-sm flex-shrink-0"
                  />
                )}
                <span className="flex-1 text-sm">
                  {movie.title} <span className="text-[#9FB0C2]">({movie.release_date?.slice(0, 4)})</span>{' '}
                  <span className="text-xs text-[#6B7A8C]">{movie.media_type === 'tv' ? 'Serie' : 'Film'}</span>
                </span>
                <button
                  onClick={() => addFavorite(movie)}
                  className={`text-sm rounded-sm px-3 py-1 border transition-colors ${
                    added
                      ? 'border-[#52A9A0] text-[#52A9A0]'
                      : 'border-[#3A4A5C] hover:border-[#E8A33D] hover:text-[#E8A33D]'
                  }`}
                >
                  {added ? 'Toegevoegd' : 'Toevoegen'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <h2 className="font-display text-lg mb-3">Jouw favorieten ({favorites.length})</h2>

      {favorites.length === 0 && (
        <p className="text-[#9FB0C2] text-sm mb-6">Nog geen favorieten toegevoegd.</p>
      )}

      {movieFavorites.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm text-[#9FB0C2] mb-2">Films ({movieFavorites.length})</h3>
          <div className="flex flex-col">
            {movieFavorites.map((movie, i) => (
              <div
                key={`movie-${movie.id}`}
                className={`flex items-center gap-3 py-2.5 ${i !== movieFavorites.length - 1 ? 'border-b border-dashed border-[#3A4A5C]' : ''}`}
              >
                <span className="flex-1 text-sm">{movie.title}</span>
                <button
                  onClick={() => removeFavorite(movie)}
                  className="text-sm text-[#9FB0C2] hover:text-[#C97064] transition-colors"
                >
                  Verwijderen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tvFavorites.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm text-[#9FB0C2] mb-2">Series ({tvFavorites.length})</h3>
          <div className="flex flex-col">
            {tvFavorites.map((movie, i) => (
              <div
                key={`tv-${movie.id}`}
                className={`flex items-center gap-3 py-2.5 ${i !== tvFavorites.length - 1 ? 'border-b border-dashed border-[#3A4A5C]' : ''}`}
              >
                <span className="flex-1 text-sm">{movie.title}</span>
                <button
                  onClick={() => removeFavorite(movie)}
                  className="text-sm text-[#9FB0C2] hover:text-[#C97064] transition-colors"
                >
                  Verwijderen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <a href="/" className="inline-block mt-4 text-[#E8A33D] hover:text-[#F0B457] transition-colors text-sm">
        Naar je aanbevelingen
      </a>
    </main>
  )
}