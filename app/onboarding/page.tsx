'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase, getCurrentUser } from '@/lib/supabase'
import BottomNav from '../components/BottomNav'
import PeopleFavorites from '../components/PeopleFavorites'
import { btnPrimary, input, chip, card } from '../components/ui'
import { SearchIcon, PlusIcon, CheckIcon, TrashIcon } from '../components/Icons'

type Movie = {
  id: number
  title: string
  poster_path: string | null
  release_date?: string
  media_type: 'movie' | 'tv'
}

type Rating = 'love' | 'ok' | 'dislike'
type RatedMovie = { id: number; title: string; media_type: 'movie' | 'tv'; rating: Rating }

const RATING_BUTTONS: { rating: Rating; label: string; tone: 'accent' | 'teal' | 'coral' }[] = [
  { rating: 'love', label: 'Zeker meer zoals dit', tone: 'accent' },
  { rating: 'ok', label: 'Was oké', tone: 'teal' },
  { rating: 'dislike', label: 'Niet voor mij', tone: 'coral' },
]

const SEGMENTS = [
  { id: 'titels', label: 'Titels' },
  { id: 'acteurs', label: 'Acteurs' },
  { id: 'regisseurs', label: 'Regisseurs' },
] as const

export default function Onboarding() {
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number]['id']>('titels')
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
    const user = await getCurrentUser()
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
    const user = await getCurrentUser()
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
    const user = await getCurrentUser()
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
    const user = await getCurrentUser()
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
    const user = await getCurrentUser()
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
    <>
      <main className="max-w-xl mx-auto px-5 pt-6 pb-28">
        <h1 className="font-display text-2xl mb-1">Zoeken en favorieten</h1>
        <p className="text-[#93A3B5] mb-5 leading-relaxed">
          Voeg favorieten toe en/of geef direct een beoordeling — allebei helpt de aanbevelingen scherper te maken.
        </p>

        <div className="flex gap-1 p-1 rounded-full bg-[#1A2330] border border-[#2A3644] mb-6">
          {SEGMENTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSegment(s.id)}
              className={`flex-1 px-4 py-1.5 text-sm font-medium rounded-full transition-all touch-manipulation ${
                segment === s.id ? 'bg-[#E8A33D] text-[#171F2B]' : 'text-[#93A3B5]'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {segment === 'acteurs' && <PeopleFavorites kind="actor" />}
        {segment === 'regisseurs' && <PeopleFavorites kind="director" />}

        {segment === 'titels' && (
          <>
        {ratingError && (
          <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-6">
            {ratingError}
          </p>
        )}

        <div className="flex gap-2 mb-6">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E6D80]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Zoek een film of serie..."
              className={`${input} pl-10`}
            />
          </div>
          <button onClick={handleSearch} disabled={loading} className={btnPrimary}>
            Zoeken
          </button>
        </div>

        {results.length > 0 && (
          <div className="flex flex-col gap-2 mb-10">
            {results.map((movie) => {
              const added = favorites.find((f) => f.id === movie.id && f.media_type === movie.media_type)
              const currentRating = ratings.get(ratingKey(movie))
              return (
                <div key={`${movie.media_type}-${movie.id}`} className={`${card} p-3`}>
                  <div className="flex items-center gap-3">
                    {movie.poster_path ? (
                      <div className="relative w-11 aspect-[2/3] rounded-lg flex-shrink-0 overflow-hidden">
                        <Image
                          src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                          alt={movie.title}
                          fill
                          sizes="44px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-11 aspect-[2/3] rounded-lg bg-[#212C3B] flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm min-w-0">
                      <span className="block font-medium truncate">{movie.title}</span>
                      <span className="text-xs text-[#93A3B5]">
                        {movie.release_date?.slice(0, 4)} · {movie.media_type === 'tv' ? 'Serie' : 'Film'}
                      </span>
                    </span>
                    <button
                      onClick={() => addFavorite(movie)}
                      className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-all flex-shrink-0 touch-manipulation active:scale-[0.96] ${
                        added ? 'border-[#52A9A0] text-[#52A9A0] bg-[#52A9A0]/12' : 'border-[#2A3644] hover:border-[#E8A33D] hover:text-[#E8A33D]'
                      }`}
                    >
                      {added ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                      Favoriet
                    </button>
                  </div>
                  <div className="flex gap-1.5 flex-wrap mt-3 pl-[56px]">
                    {RATING_BUTTONS.map(({ rating, label, tone }) => (
                      <button
                        key={rating}
                        onClick={() => rateMovie(movie, rating)}
                        className={`${chip(currentRating === rating, tone, "sm")}`}
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
          <p className="text-[#93A3B5] text-sm mb-6">Nog geen favorieten toegevoegd.</p>
        )}

        {movieFavorites.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm text-[#93A3B5] mb-2">Films ({movieFavorites.length})</h3>
            <div className="flex flex-col gap-1.5">
              {movieFavorites.map((movie) => (
                <div key={`movie-${movie.id}`} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                  <span className="flex-1 text-sm truncate">{movie.title}</span>
                  <button
                    onClick={() => removeFavorite(movie)}
                    className="text-[#93A3B5] hover:text-[#C97064] transition-colors p-1"
                    aria-label="Verwijderen"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tvFavorites.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm text-[#93A3B5] mb-2">Series ({tvFavorites.length})</h3>
            <div className="flex flex-col gap-1.5">
              {tvFavorites.map((movie) => (
                <div key={`tv-${movie.id}`} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                  <span className="flex-1 text-sm truncate">{movie.title}</span>
                  <button
                    onClick={() => removeFavorite(movie)}
                    className="text-[#93A3B5] hover:text-[#C97064] transition-colors p-1"
                    aria-label="Verwijderen"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 className="font-display text-lg mb-3">Jouw beoordelingen ({ratedMovies.length})</h2>

        {ratedMovies.length === 0 && (
          <p className="text-[#93A3B5] text-sm mb-6">Nog geen films of series beoordeeld.</p>
        )}

        {RATING_BUTTONS.map(({ rating: groupRating, label: groupLabel }) => {
          const items = ratedMovies.filter((r) => r.rating === groupRating)
          if (items.length === 0) return null
          return (
            <div key={groupRating} className="mb-6">
              <h3 className="text-sm text-[#93A3B5] mb-2">{groupLabel} ({items.length})</h3>
              <div className="flex flex-col gap-1.5">
                {items.map((movie) => (
                  <div key={ratingKey(movie)} className={`${card} flex items-center gap-3 flex-wrap px-4 py-2.5`}>
                    <span className="flex-1 text-sm min-w-[140px] truncate">
                      {movie.title}{' '}
                      <span className="text-xs text-[#5E6D80]">{movie.media_type === 'tv' ? 'Serie' : 'Film'}</span>
                    </span>
                    <div className="flex gap-1.5 flex-wrap items-center">
                      {RATING_BUTTONS.map(({ rating, label, tone }) => (
                        <button
                          key={rating}
                          onClick={() => rateMovie(movie, rating)}
                          className={`${chip(movie.rating === rating, tone, "sm")}`}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        // Zelfde knop nogmaals met de al actieve rating triggert de
                        // "opheffen"-tak in rateMovie hierboven — geen aparte verwijder-
                        // aanroep nodig, gewoon een duidelijker knopje voor diezelfde actie.
                        onClick={() => rateMovie(movie, movie.rating)}
                        className="text-[#93A3B5] hover:text-[#C97064] transition-colors p-1"
                        aria-label="Beoordeling verwijderen"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
          </>
        )}
      </main>

      <BottomNav />
    </>
  )
}
