'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase, getCurrentUser, authFetch } from '@/lib/supabase'
import BottomNav from '../components/BottomNav'
import PeopleFavorites from '../components/PeopleFavorites'
import TitleInfoSheet, { type TitleInfoItem } from '../components/TitleInfoSheet'
import { btnPrimary, btnSecondary, input, chip, card } from '../components/ui'
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
  { id: 'boeken', label: 'Boeken' },
  { id: 'binnenkort', label: 'Binnenkort' },
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
  const [infoItem, setInfoItem] = useState<TitleInfoItem | null>(null)
  // Bepaalt welke acties de infopopup toont: voor "binnenkort" heb je de film nog niet
  // gezien, dus daar past "op watchlist" en geen beoordeling of "favoriet".
  const [infoItemKind, setInfoItemKind] = useState<'gezien' | 'binnenkort'>('gezien')

  const [bookResults, setBookResults] = useState<Movie[]>([])
  const [bookType, setBookType] = useState<'movie' | 'tv'>('movie')
  const [bookMineOnly, setBookMineOnly] = useState(false)
  const [bookPage, setBookPage] = useState(1)
  const [bookTotalPages, setBookTotalPages] = useState(1)
  const [bookQuery, setBookQuery] = useState('')
  // Wat er daadwerkelijk is opgezocht — los van wat er nu in de zoekbalk getypt staat.
  const [bookActiveQuery, setBookActiveQuery] = useState('')
  const [bookLoading, setBookLoading] = useState(false)
  const [bookError, setBookError] = useState<string | null>(null)
  // Voorkomt dat een trager, ouder antwoord (bv. na snel wisselen tussen films/series)
  // het nieuwere resultaat overschrijft.
  const bookRequestRef = useRef(0)

  async function loadBooks(type: 'movie' | 'tv', mineOnly: boolean, page: number, q = bookActiveQuery) {
    const requestId = ++bookRequestRef.current
    setBookLoading(true)
    setBookError(null)
    try {
      const res = await authFetch(
        `/api/book-adaptations?type=${type}&page=${page}&mine=${mineOnly ? 1 : 0}&q=${encodeURIComponent(q)}`
      )
      const data = await res.json()
      if (requestId !== bookRequestRef.current) return
      if (!res.ok || data.error) {
        setBookError(data.error || 'Boekverfilmingen laden mislukt')
        setBookLoading(false)
        return
      }
      setBookResults((current) => (page === 1 ? data.results : [...current, ...data.results]))
      setBookPage(data.page)
      setBookTotalPages(data.totalPages)
    } catch (err) {
      if (requestId !== bookRequestRef.current) return
      setBookError(err instanceof Error ? err.message : 'Boekverfilmingen laden mislukt')
    }
    setBookLoading(false)
  }

  function handleBookSearch() {
    const trimmed = bookQuery.trim()
    setBookActiveQuery(trimmed)
    setBookResults([])
    loadBooks(bookType, bookMineOnly, 1, trimmed)
  }

  function openBookSegment() {
    setSegment('boeken')
    if (bookResults.length === 0) loadBooks(bookType, bookMineOnly, 1)
  }

  function changeBookType(type: 'movie' | 'tv') {
    setBookType(type)
    setBookResults([])
    loadBooks(type, bookMineOnly, 1)
  }

  function toggleBookMine() {
    const next = !bookMineOnly
    setBookMineOnly(next)
    setBookResults([])
    loadBooks(bookType, next, 1)
  }

  const [upcomingResults, setUpcomingResults] = useState<Movie[]>([])
  const [upcomingType, setUpcomingType] = useState<'movie' | 'tv'>('movie')
  const [upcomingPage, setUpcomingPage] = useState(1)
  const [upcomingTotalPages, setUpcomingTotalPages] = useState(1)
  const [upcomingLoading, setUpcomingLoading] = useState(false)
  const [upcomingError, setUpcomingError] = useState<string | null>(null)
  const [watchlistKeys, setWatchlistKeys] = useState<Set<string>>(new Set())
  const upcomingRequestRef = useRef(0)

  async function loadWatchlistKeys() {
    const user = await getCurrentUser()
    if (!user) return
    const { data } = await supabase.from('watchlist').select('tmdb_id, media_type').eq('user_id', user.id)
    if (data) setWatchlistKeys(new Set(data.map((w) => `${w.media_type}-${w.tmdb_id}`)))
  }

  async function loadUpcoming(page: number, type = upcomingType) {
    const requestId = ++upcomingRequestRef.current
    setUpcomingLoading(true)
    setUpcomingError(null)
    try {
      const res = await authFetch(`/api/upcoming?type=${type}&page=${page}`)
      const data = await res.json()
      if (requestId !== upcomingRequestRef.current) return
      if (!res.ok || data.error) {
        setUpcomingError(data.error || 'Aankomende films laden mislukt')
        setUpcomingLoading(false)
        return
      }
      setUpcomingResults((current) => (page === 1 ? data.results : [...current, ...data.results]))
      setUpcomingPage(data.page)
      setUpcomingTotalPages(data.totalPages)
    } catch (err) {
      if (requestId !== upcomingRequestRef.current) return
      setUpcomingError(err instanceof Error ? err.message : 'Aankomende films laden mislukt')
    }
    setUpcomingLoading(false)
  }

  function openUpcomingSegment() {
    setSegment('binnenkort')
    if (upcomingResults.length === 0) loadUpcoming(1)
  }

  function changeUpcomingType(type: 'movie' | 'tv') {
    setUpcomingType(type)
    setUpcomingResults([])
    loadUpcoming(1, type)
  }

  async function addToWatchlist(movie: { id: number; title: string; media_type: 'movie' | 'tv'; poster_path?: string | null }) {
    const key = `${movie.media_type}-${movie.id}`
    if (watchlistKeys.has(key)) return
    const user = await getCurrentUser()
    if (!user) return
    const { error } = await supabase.from('watchlist').insert({
      user_id: user.id,
      tmdb_id: movie.id,
      title: movie.title,
      poster_path: movie.poster_path ?? null,
      media_type: movie.media_type,
    })
    if (!error) setWatchlistKeys((current) => new Set(current).add(key))
  }

  function formatReleaseDate(date?: string): string {
    if (!date) return ''
    return new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  // Voor alles behalve "binnenkort": je hebt de titel al gezien (of beoordeeld), dus de
  // popup toont daar gewoon weer favoriet + beoordelen.
  function openInfo(movie: TitleInfoItem) {
    setInfoItemKind('gezien')
    setInfoItem(movie)
  }

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
    loadWatchlistKeys()
  }, [])

  async function handleSearch() {
    if (!query) return
    setLoading(true)
    setRatingError(null)
    const res = await authFetch(`/api/search-movies?query=${encodeURIComponent(query)}`)
    const data = await res.json()
    if (!res.ok) setRatingError(data.error || 'Zoeken mislukt')
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
              onClick={() => {
                if (s.id === 'boeken') openBookSegment()
                else if (s.id === 'binnenkort') openUpcomingSegment()
                else setSegment(s.id)
              }}
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

        {segment === 'binnenkort' && (
          <div>
            <p className="text-[#93A3B5] text-sm mb-4 leading-relaxed">
              {upcomingType === 'movie'
                ? 'Films die de komende maanden in Nederland uitkomen, de populairste eerst.'
                : 'Nieuwe series die de komende maanden voor het eerst uitzenden, de populairste eerst. Een nieuw seizoen van een serie die je al kent, staat hier niet bij.'}
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              <button onClick={() => changeUpcomingType('movie')} className={chip(upcomingType === 'movie', 'accent', 'sm')}>
                Films
              </button>
              <button onClick={() => changeUpcomingType('tv')} className={chip(upcomingType === 'tv', 'accent', 'sm')}>
                Series
              </button>
            </div>
            {upcomingError && (
              <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-4">
                {upcomingError}
              </p>
            )}
            {upcomingLoading && upcomingResults.length === 0 && <p className="text-[#93A3B5] text-sm">Laden...</p>}
            {!upcomingLoading && !upcomingError && upcomingResults.length === 0 && (
              <p className="text-[#93A3B5] text-sm">Niets gevonden.</p>
            )}
            {upcomingResults.length > 0 && (
              <div className="flex flex-col gap-2 mb-4">
                {upcomingResults.map((movie) => {
                  const key = `${movie.media_type}-${movie.id}`
                  const added = watchlistKeys.has(key)
                  return (
                    <div key={key} className={`${card} p-3`}>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setInfoItemKind('binnenkort')
                            setInfoItem(movie)
                          }}
                          className="flex items-center gap-3 flex-1 min-w-0 text-left touch-manipulation"
                        >
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
                              {formatReleaseDate(movie.release_date)} · {movie.media_type === 'tv' ? 'Serie' : 'Film'}
                            </span>
                          </span>
                        </button>
                        <button
                          onClick={() => addToWatchlist(movie)}
                          className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-all flex-shrink-0 touch-manipulation active:scale-[0.96] ${
                            added ? 'border-[#52A9A0] text-[#52A9A0] bg-[#52A9A0]/12' : 'border-[#2A3644] hover:border-[#E8A33D] hover:text-[#E8A33D]'
                          }`}
                        >
                          {added ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                          Watchlist
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {upcomingPage < upcomingTotalPages && upcomingResults.length > 0 && (
              <button
                onClick={() => loadUpcoming(upcomingPage + 1)}
                disabled={upcomingLoading}
                className={`${btnSecondary} w-full mb-6`}
              >
                {upcomingLoading ? 'Laden...' : 'Meer laden'}
              </button>
            )}
          </div>
        )}

        {(segment === 'titels' || segment === 'boeken') && (
          <>
        {ratingError && (
          <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-6">
            {ratingError}
          </p>
        )}

        {segment === 'titels' && (
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
        )}

        {segment === 'boeken' && (
          <div className="mb-6">
            <p className="text-[#93A3B5] text-sm mb-4 leading-relaxed">
              Films en series die op een boek gebaseerd zijn, de populairste eerst. Gebaseerd op TMDB-trefwoorden,
              dus een enkele verfilming kan ontbreken.
            </p>
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E6D80]" />
                <input
                  type="text"
                  value={bookQuery}
                  onChange={(e) => setBookQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBookSearch()}
                  placeholder="Zoek een boekverfilming..."
                  className={`${input} pl-10`}
                />
              </div>
              <button onClick={handleBookSearch} disabled={bookLoading} className={btnPrimary}>
                Zoeken
              </button>
            </div>
            {bookActiveQuery && (
              <p className="text-xs text-[#5E6D80] mb-3">
                Resultaten voor &quot;{bookActiveQuery}&quot; — alleen titels die op een boek gebaseerd zijn. Laat de
                zoekbalk leeg en zoek opnieuw voor de volledige lijst.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => changeBookType('movie')} className={chip(bookType === 'movie', 'accent', 'sm')}>
                Films
              </button>
              <button onClick={() => changeBookType('tv')} className={chip(bookType === 'tv', 'accent', 'sm')}>
                Series
              </button>
              <button onClick={toggleBookMine} className={chip(bookMineOnly, 'teal', 'sm')}>
                Alleen op mijn diensten
              </button>
            </div>
            {bookError && <p className="text-sm text-[#C97064] mt-3">{bookError}</p>}
            {bookLoading && bookResults.length === 0 && <p className="text-[#93A3B5] text-sm mt-4">Laden...</p>}
            {!bookLoading && !bookError && bookResults.length === 0 && (
              <p className="text-[#93A3B5] text-sm mt-4">
                {bookActiveQuery
                  ? 'Geen boekverfilming gevonden met deze titel. Probeer een andere schrijfwijze, of wissel tussen Films en Series.'
                  : 'Niets gevonden. Zet "Alleen op mijn diensten" eens uit.'}
              </p>
            )}
          </div>
        )}

        {(segment === 'titels' ? results : bookResults).length > 0 && (
          <div className="flex flex-col gap-2 mb-10">
            {(segment === 'titels' ? results : bookResults).map((movie) => {
              const added = favorites.find((f) => f.id === movie.id && f.media_type === movie.media_type)
              const currentRating = ratings.get(ratingKey(movie))
              return (
                <div key={`${movie.media_type}-${movie.id}`} className={`${card} p-3`}>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => openInfo(movie)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left touch-manipulation"
                    >
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
                    </button>
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

        {segment === 'boeken' && bookPage < bookTotalPages && bookResults.length > 0 && (
          <button onClick={() => loadBooks(bookType, bookMineOnly, bookPage + 1)} disabled={bookLoading} className={`${btnSecondary} w-full mb-6`}>
            {bookLoading ? 'Laden...' : 'Meer laden'}
          </button>
        )}

        {segment === 'titels' && (
          <>
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
                  <button onClick={() => openInfo(movie)} className="flex-1 text-sm truncate text-left touch-manipulation">
                    {movie.title}
                  </button>
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
                  <button onClick={() => openInfo(movie)} className="flex-1 text-sm truncate text-left touch-manipulation">
                    {movie.title}
                  </button>
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
                    <button
                      onClick={() => openInfo({ id: movie.id, title: movie.title, media_type: movie.media_type })}
                      className="flex-1 text-sm min-w-[140px] truncate text-left touch-manipulation"
                    >
                      {movie.title}{' '}
                      <span className="text-xs text-[#5E6D80]">{movie.media_type === 'tv' ? 'Serie' : 'Film'}</span>
                    </button>
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
          </>
        )}
      </main>

      {infoItem && infoItemKind === 'binnenkort' && (
        <TitleInfoSheet item={infoItem} onClose={() => setInfoItem(null)}>
          {(details) => (
            <button
              onClick={() => addToWatchlist({ ...infoItem, poster_path: details?.posterPath ?? infoItem.poster_path ?? null })}
              className={`${btnPrimary} w-full mb-3`}
            >
              {watchlistKeys.has(`${infoItem.media_type}-${infoItem.id}`) ? (
                <CheckIcon className="w-4 h-4" />
              ) : (
                <PlusIcon className="w-4 h-4" />
              )}
              Op watchlist
            </button>
          )}
        </TitleInfoSheet>
      )}

      {infoItem && infoItemKind === 'gezien' && (
        <TitleInfoSheet item={infoItem} onClose={() => setInfoItem(null)}>
          <button
            onClick={() => addFavorite({ ...infoItem, poster_path: infoItem.poster_path ?? null })}
            className={`${btnPrimary} w-full mb-3`}
          >
            {favorites.some((f) => f.id === infoItem.id && f.media_type === infoItem.media_type) ? (
              <CheckIcon className="w-4 h-4" />
            ) : (
              <PlusIcon className="w-4 h-4" />
            )}
            Favoriet
          </button>
          <div className="flex gap-1.5 flex-wrap">
            {RATING_BUTTONS.map(({ rating, label, tone }) => (
              <button
                key={rating}
                onClick={() => rateMovie(infoItem, rating)}
                className={chip(ratings.get(ratingKey(infoItem)) === rating, tone, 'sm')}
              >
                {label}
              </button>
            ))}
          </div>
        </TitleInfoSheet>
      )}

      <BottomNav />
    </>
  )
}
