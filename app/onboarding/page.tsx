'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type Movie = {
  id: number
  title: string
  poster_path: string | null
  release_date?: string
  media_type: 'movie' | 'tv'
}

type Rating = 'love' | 'ok' | 'dislike'
type RatedMovie = { id: number; title: string; media_type: 'movie' | 'tv'; rating: Rating }

const RATING_BUTTONS: { rating: Rating; label: string; activeClass: string; hoverClass: string }[] = [
  { rating: 'love', label: 'Zeker meer zoals dit', activeClass: 'border-[#E8A33D] text-[#E8A33D]', hoverClass: 'hover:border-[#E8A33D] hover:text-[#E8A33D]' },
  { rating: 'ok', label: 'Was oké', activeClass: 'border-[#52A9A0] text-[#52A9A0]', hoverClass: 'hover:border-[#52A9A0] hover:text-[#52A9A0]' },
  { rating: 'dislike', label: 'Niet voor mij', activeClass: 'border-[#C97064] text-[#C97064]', hoverClass: 'hover:border-[#C97064] hover:text-[#C97064]' },
]

export default function Onboarding() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Movie[]>([])
  const [favorites, setFavorites] = useState<Movie[]>([])
  const [ratedMovies, setRatedMovies] = useState<RatedMovie[]>([])
  const [loading, setLoading] = useState(false)
  const [ratingError, setRatingError] = useState<string | null>(null)

  function ratingKey(movie: { id: number; media_type: 'movie' | 'tv' }) {
    return `${movie.media_type}-${movie.id}`
  }

  // Op elk render opnieuw afgeleid uit ratedMovies i.p.v. los bijgehouden — zo kan de
  // lijst (voor het beheer-overzicht) en de snelle lookup (bij zoekresultaten) nooit
  // uit elkaar lopen.
  const ratings = new Map(ratedMovies.map((r) => [ratingKey(r), r.rating]))

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

  async function loadRatings() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('ratings')
      .select('tmdb_id, title, media_type, rating')
      .eq('user_id', user.id)

    if (data) {
      setRatedMovies(
        data.map((r) => ({
          id: r.tmdb_id,
          title: r.title,
          media_type: r.media_type as 'movie' | 'tv',
          rating: r.rating as Rating,
        }))
      )
    }
  }

  useEffect(() => {
    loadFavorites()
    loadRatings()
  }, [])

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
    setRatingError(null)

    const { data, error } = await supabase
      .from('favorite_movies')
      .delete()
      .eq('user_id', user.id)
      .eq('tmdb_id', movie.id)
      .eq('media_type', movie.media_type)
      .select()

    if (error) {
      console.error('Favoriet verwijderen mislukt:', error)
      setRatingError(`Kon favoriet niet verwijderen: ${error.message}`)
      return
    }
    if (!data || data.length === 0) {
      setRatingError(
        'De favoriet leek verwijderd, maar er is geen rij verwijderd — waarschijnlijk ontbreekt een DELETE-policy op de "favorite_movies"-tabel in Supabase (RLS).'
      )
      return
    }
    setFavorites(favorites.filter((f) => !(f.id === movie.id && f.media_type === movie.media_type)))
  }

  async function rateMovie(movie: { id: number; title: string; media_type: 'movie' | 'tv' }, rating: Rating) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setRatingError(null)

    const key = ratingKey(movie)
    const current = ratings.get(key)
    // Nogmaals op dezelfde knop klikken heft de beoordeling weer op.
    if (current === rating) {
      // .select() erbij zodat we zien wélke rij is verwijderd — zonder die check zou een
      // door RLS stilzwijgend genegeerde delete (0 rijen, geen "error") er client-side
      // toch uitzien als gelukt, terwijl de rij in Supabase gewoon blijft bestaan.
      const { data, error } = await supabase
        .from('ratings')
        .delete()
        .eq('user_id', user.id)
        .eq('tmdb_id', movie.id)
        .eq('media_type', movie.media_type)
        .select()
      if (error) {
        console.error('Rating verwijderen mislukt:', error)
        setRatingError(`Kon de rating niet verwijderen: ${error.message}`)
        return
      }
      if (!data || data.length === 0) {
        setRatingError(
          'De rating leek verwijderd, maar er is geen rij verwijderd — waarschijnlijk ontbreekt een DELETE-policy op de "ratings"-tabel in Supabase (RLS).'
        )
        return
      }
      setRatedMovies((prev) => prev.filter((r) => ratingKey(r) !== key))
      return
    }

    // .select() ervoor zorgen dat we de aangepaste/ingevoegde rij terugkrijgen — als die
    // leeg blijft terwijl er geen "error" is, heeft Row Level Security de schrijfactie
    // stilzwijgend tegengehouden (bv. een ontbrekend UPDATE-policy op deze tabel), en
    // zouden we anders ten onrechte denken dat het gelukt is.
    const { data, error } = await supabase
      .from('ratings')
      .upsert(
        {
          user_id: user.id,
          tmdb_id: movie.id,
          title: movie.title,
          rating,
          media_type: movie.media_type,
        },
        { onConflict: 'user_id,tmdb_id,media_type' }
      )
      .select()

    if (error) {
      console.error('Rating opslaan mislukt:', error)
      setRatingError(`Kon de rating niet opslaan: ${error.message}`)
      return
    }
    if (!data || data.length === 0) {
      setRatingError(
        'De rating leek op te slaan, maar er kwam geen rij terug — waarschijnlijk ontbreekt een UPDATE-policy op de "ratings"-tabel in Supabase (RLS).'
      )
      return
    }

    setRatedMovies((prev) => [
      { id: movie.id, title: movie.title, media_type: movie.media_type, rating },
      ...prev.filter((r) => ratingKey(r) !== key),
    ])
  }

  const movieFavorites = favorites.filter((f) => f.media_type === 'movie')
  const tvFavorites = favorites.filter((f) => f.media_type === 'tv')

  return (
    <main className="max-w-xl mx-auto px-6 py-10">
      <h1 className="font-display text-2xl mb-1">Films en series zoeken</h1>
      <p className="text-[#9FB0C2] mb-6">
        Voeg favorieten toe en/of geef direct een beoordeling — allebei helpt de aanbevelingen scherper te maken.
      </p>

      {ratingError && (
        <p className="text-sm text-[#C97064] border border-[#C97064] rounded-sm px-3 py-2 mb-6">
          {ratingError}
        </p>
      )}

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
            const currentRating = ratings.get(ratingKey(movie))
            return (
              <div
                key={`${movie.media_type}-${movie.id}`}
                className={`flex flex-col gap-2 py-3 ${i !== results.length - 1 ? 'border-b border-dashed border-[#3A4A5C]' : ''}`}
              >
                <div className="flex items-center gap-3">
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
                    className={`text-sm rounded-sm px-3 py-1 border transition-colors flex-shrink-0 ${
                      added
                        ? 'border-[#52A9A0] text-[#52A9A0]'
                        : 'border-[#3A4A5C] hover:border-[#E8A33D] hover:text-[#E8A33D]'
                    }`}
                  >
                    {added ? 'Toegevoegd' : 'Toevoegen'}
                  </button>
                </div>
                <div className="flex gap-2 flex-wrap pl-[52px]">
                  {RATING_BUTTONS.map(({ rating, label, activeClass, hoverClass }) => (
                    <button
                      key={rating}
                      onClick={() => rateMovie(movie, rating)}
                      className={`text-xs rounded-sm px-2.5 py-1 border transition-colors ${
                        currentRating === rating ? activeClass : `border-[#3A4A5C] ${hoverClass}`
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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

      <h2 className="font-display text-lg mb-3">Jouw beoordelingen ({ratedMovies.length})</h2>

      {ratedMovies.length === 0 && (
        <p className="text-[#9FB0C2] text-sm mb-6">Nog geen films of series beoordeeld.</p>
      )}

      {RATING_BUTTONS.map(({ rating: groupRating, label: groupLabel }) => {
        const items = ratedMovies.filter((r) => r.rating === groupRating)
        if (items.length === 0) return null
        return (
          <div key={groupRating} className="mb-6">
            <h3 className="text-sm text-[#9FB0C2] mb-2">{groupLabel} ({items.length})</h3>
            <div className="flex flex-col">
              {items.map((movie, i) => (
                <div
                  key={ratingKey(movie)}
                  className={`flex items-center gap-3 py-2.5 flex-wrap ${i !== items.length - 1 ? 'border-b border-dashed border-[#3A4A5C]' : ''}`}
                >
                  <span className="flex-1 text-sm min-w-[140px]">
                    {movie.title}{' '}
                    <span className="text-xs text-[#6B7A8C]">{movie.media_type === 'tv' ? 'Serie' : 'Film'}</span>
                  </span>
                  <div className="flex gap-2 flex-wrap">
                    {RATING_BUTTONS.map(({ rating, label, activeClass, hoverClass }) => (
                      <button
                        key={rating}
                        onClick={() => rateMovie(movie, rating)}
                        className={`text-xs rounded-sm px-2.5 py-1 border transition-colors ${
                          movie.rating === rating ? activeClass : `border-[#3A4A5C] ${hoverClass}`
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      <Link href="/" className="inline-block mt-4 text-[#E8A33D] hover:text-[#F0B457] transition-colors text-sm">
        Naar je aanbevelingen
      </Link>
    </main>
  )
}
