'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { supabase, getCurrentUser, authFetch } from '@/lib/supabase'
import BottomNav from '../components/BottomNav'
import PeopleFavorites from '../components/PeopleFavorites'
import TitleInfoSheet, { type TitleInfoItem } from '../components/TitleInfoSheet'
import { btnPrimary, btnSecondary, input, chip, card } from '../components/ui'
import { SearchIcon, PlusIcon, CheckIcon, TrashIcon } from '../components/Icons'
import { BOOK_CLUB_SKIN } from '@/lib/skins'
import { useSkin } from '@/lib/useSkin'

type Movie = {
  id: number
  title: string
  poster_path: string | null
  release_date?: string
  media_type: 'movie' | 'tv'
}

type Rating = 'love' | 'ok' | 'dislike'
type RatedMovie = { id: number; title: string; media_type: 'movie' | 'tv'; rating: Rating; rated_at?: string }

// label = sleutel onder "title" in messages/*.json.
const RATING_BUTTONS: { rating: Rating; label: 'moreLikeThisRating' | 'rateOk' | 'rateDislike'; tone: 'accent' | 'teal' | 'coral' }[] = [
  { rating: 'love', label: 'moreLikeThisRating', tone: 'accent' },
  { rating: 'ok', label: 'rateOk', tone: 'teal' },
  { rating: 'dislike', label: 'rateDislike', tone: 'coral' },
]

// label = sleutel onder "search" in messages/*.json.
const SEGMENTS = [
  { id: 'titels', label: 'segTitles' },
  { id: 'boeken', label: 'segBooks' },
  { id: 'acteurs', label: 'segActors' },
  { id: 'regisseurs', label: 'segDirectors' },
] as const

// Zoveel nog niet beoordeelde titels willen we minstens zien voordat we stoppen met bijladen (zie loadBooks).
const MIN_VISIBLE_BOOKS = 10

export default function Onboarding() {
  const t = useTranslations('search')
  const tt = useTranslations('title')
  const skin = useSkin()
  const [segment, setSegment] = useState<(typeof SEGMENTS)[number]['id']>('titels')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Movie[]>([])
  // Uitleg bij de resultaten als het geen gewone treffers zijn ("Bedoelde je misschien…").
  const [searchNote, setSearchNote] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Movie[]>([])
  const [ratedMovies, setRatedMovies] = useState<RatedMovie[]>([])
  const [loading, setLoading] = useState(false)
  const [ratingError, setRatingError] = useState<string | null>(null)
  const [infoItem, setInfoItem] = useState<TitleInfoItem | null>(null)
  const [watchlistKeys, setWatchlistKeys] = useState<Set<string>>(new Set())

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
  // Standaard staan in de Boeken-lijst alleen titels die je nog niet hebt afgehandeld (beoordeeld, favoriet of op je
  // kijklijst). Met deze schakelaar zie je ze er weer bij.
  const [bookShowKnown, setBookShowKnown] = useState(false)
  // Actuele waarden voor loadBooks, dat soms op een verouderde render doorloopt (zie het bijladen hieronder).
  const knownKeysRef = useRef<Set<string>>(new Set())
  const bookShowKnownRef = useRef(false)
  const bookResultsRef = useRef<Movie[]>([])
  // Voorkomt dat een trager, ouder antwoord (bv. na snel wisselen tussen films/series)
  // het nieuwere resultaat overschrijft.
  const bookRequestRef = useRef(0)

  async function loadBooks(type: 'movie' | 'tv', mineOnly: boolean, page: number, q = bookActiveQuery, carried?: Movie[]) {
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
        setBookError(data.error || t('booksLoadFailed'))
        setBookLoading(false)
        return
      }
      const merged: Movie[] = page === 1 ? data.results : [...(carried ?? bookResultsRef.current), ...data.results]
      setBookResults(merged)
      setBookPage(data.page)
      setBookTotalPages(data.totalPages)
      // Staat er na het wegfilteren van wat je al kent bijna niets meer, dan halen we de volgende pagina er direct bij,
      // zodat je niet op "Meer laden" hoeft te drukken voor een lijst die op het eerste gezicht leeg lijkt.
      if (!q && !bookShowKnownRef.current && data.page < data.totalPages) {
        const visible = merged.filter((m) => !knownKeysRef.current.has(`${m.media_type}-${m.id}`)).length
        if (visible < MIN_VISIBLE_BOOKS) {
          loadBooks(type, mineOnly, data.page + 1, q, merged)
          return
        }
      }
    } catch (err) {
      if (requestId !== bookRequestRef.current) return
      setBookError(err instanceof Error ? err.message : t('booksLoadFailed'))
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

  function ratingKey(movie: { id: number; media_type: 'movie' | 'tv' }) {
    return `${movie.media_type}-${movie.id}`
  }

  // Op elk render opnieuw afgeleid uit ratedMovies i.p.v. los bijgehouden — zo kan de
  // lijst (voor het beheer-overzicht) en de snelle lookup (bij zoekresultaten) nooit
  // uit elkaar lopen.
  const ratings = new Map(ratedMovies.map((r) => [ratingKey(r), r.rating]))

  // Wat je al hebt afgehandeld: favoriet, beoordeeld of op je kijklijst.
  const knownKeys = new Set([...favorites.map(ratingKey), ...ratedMovies.map(ratingKey), ...watchlistKeys])
  useEffect(() => {
    knownKeysRef.current = knownKeys
    bookShowKnownRef.current = bookShowKnown
    bookResultsRef.current = bookResults
  })

  // Met de Boekenclub-skin aan staan de boekverfilmingen vooraan, en opent Zoeken daar meteen. Ook via de link "Alle
  // boekverfilmingen" in de Boekenclub-rij op Voor jou (?segment=boeken). Eén keer per bezoek, daarna kies je zelf.
  const bookFirst = skin === BOOK_CLUB_SKIN
  const segments = bookFirst ? [...SEGMENTS].sort((a, b) => Number(b.id === 'boeken') - Number(a.id === 'boeken')) : SEGMENTS
  const booksOpenedRef = useRef(false)
  useEffect(() => {
    if (booksOpenedRef.current) return
    const asked = new URLSearchParams(window.location.search).get('segment') === 'boeken'
    if (!asked && !bookFirst) return
    // Net na het tekenen, niet tijdens het effect zelf: zo wisselt de pagina één keer van onderdeel. Pas dan "geopend"
    // onthouden: React kan een effect bij het ontwikkelen meteen weer afbreken en opnieuw draaien.
    const timer = setTimeout(() => {
      booksOpenedRef.current = true
      openBookSegment()
    }, 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- eenmalig zodra bekend is welke skin aan staat
  }, [bookFirst])
  // Bij een zoekopdracht tonen we alles (zoek je een titel die je al beoordeeld hebt, dan wil je die gewoon zien).
  const hideKnownBooks = !bookShowKnown && !bookActiveQuery
  const visibleBooks = hideKnownBooks ? bookResults.filter((m) => !knownKeys.has(ratingKey(m))) : bookResults
  const hiddenBookCount = bookResults.length - visibleBooks.length

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
      .select('tmdb_id, title, media_type, rating, rated_at')
      .eq('user_id', user.id)

    if (data) {
      setRatedMovies(
        data.map((r) => ({
          id: r.tmdb_id,
          title: r.title,
          media_type: r.media_type as 'movie' | 'tv',
          rating: r.rating as Rating,
          rated_at: r.rated_at ?? undefined,
        }))
      )
    }
  }

  async function loadWatchlistKeys() {
    const user = await getCurrentUser()
    if (!user) return
    const { data } = await supabase.from('watchlist').select('tmdb_id, media_type').eq('user_id', user.id)
    if (data) setWatchlistKeys(new Set(data.map((w) => `${w.media_type}-${w.tmdb_id}`)))
  }

  // Zet een titel op je kijklijst (kan ook als je hem nog niet hebt gezien).
  async function addToWatchlist(item: { id: number; title: string; media_type: 'movie' | 'tv'; poster_path?: string | null }) {
    const key = `${item.media_type}-${item.id}`
    if (watchlistKeys.has(key)) return
    const user = await getCurrentUser()
    if (!user) return
    setRatingError(null)
    const { error } = await supabase.from('watchlist').upsert(
      { user_id: user.id, tmdb_id: item.id, title: item.title, poster_path: item.poster_path ?? null, media_type: item.media_type },
      { onConflict: 'user_id,tmdb_id,media_type', ignoreDuplicates: true }
    )
    if (error) {
      setRatingError(t('errWatchlist', { message: error.message }))
      return
    }
    setWatchlistKeys((current) => new Set(current).add(key))
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
    if (!res.ok) setRatingError(data.error || t('failed'))
    setResults(data.results || [])
    setSearchNote(data.note ?? null)
    setLoading(false)
  }

  // Nogmaals op Favoriet tikken haalt de favoriet weer weg, net als bij de beoordelingsknoppen.
  async function toggleFavorite(movie: Movie) {
    if (favorites.find((f) => f.id === movie.id && f.media_type === movie.media_type)) {
      await removeFavorite(movie)
      return
    }
    const user = await getCurrentUser()
    if (!user) return
    const { error } = await supabase.from('favorite_movies').insert({
      user_id: user.id,
      tmdb_id: movie.id,
      title: movie.title,
      media_type: movie.media_type,
    })
    if (!error) {
      setFavorites([movie, ...favorites])
      // Eén oordeel per titel: de favoriet vervangt een beoordeling (zie de migratie 20261017_favorite_or_rating).
      setRatedMovies((prev) => prev.filter((r) => ratingKey(r) !== ratingKey(movie)))
    }
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
      setRatingError(t('errRemoveFavorite', { message: error.message }))
      return
    }
    if (!data || data.length === 0) {
      // Waarschijnlijk een ontbrekende DELETE-policy op favorite_movies (RLS).
      setRatingError(t('errNoRowDeleted'))
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
        setRatingError(t('errRemoveRating', { message: error.message }))
        return
      }
      if (!data || data.length === 0) {
        // Waarschijnlijk een ontbrekende DELETE-policy op ratings (RLS).
        setRatingError(t('errNoRowDeleted'))
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
      setRatingError(t('errSaveRating', { message: error.message }))
      return
    }
    if (!data || data.length === 0) {
      // Waarschijnlijk een ontbrekende UPDATE-policy op ratings (RLS).
      setRatingError(t('errNoRowSaved'))
      return
    }

    setRatedMovies((prev) => [
      { id: movie.id, title: movie.title, media_type: movie.media_type, rating, rated_at: new Date().toISOString() },
      ...prev.filter((r) => ratingKey(r) !== key),
    ])
    // Eén oordeel per titel: een beoordeling vervangt een favoriet (de database haalt hem weg, zie de migratie
    // 20261017_favorite_or_rating), dus ook hier uit de lijst.
    setFavorites((prev) => prev.filter((f) => !(f.id === movie.id && f.media_type === movie.media_type)))
  }

  const movieFavorites = favorites.filter((f) => f.media_type === 'movie')
  const tvFavorites = favorites.filter((f) => f.media_type === 'tv')

  return (
    <>
      <main className="max-w-xl laptop:max-w-5xl mx-auto px-5 pt-6 pb-28">
        <h1 className="font-display text-2xl mb-1">{t('heading')}</h1>
        <p className="text-muted mb-5 leading-relaxed">
          {t('intro')}
        </p>

        <Link
          href="/top-100"
          className={`${card} flex items-center justify-between gap-3 px-4 py-3 mb-5 laptop:max-w-xl hover:border-line-strong transition-colors`}
        >
          <span>
            <span className="block text-sm font-medium">{t('topTitle')}</span>
            <span className="block text-xs text-muted mt-0.5">{t('topSub')}</span>
          </span>
          <span aria-hidden className="text-muted text-lg">›</span>
        </Link>

        <div className="flex gap-1 p-1 rounded-full bg-surface border border-line mb-6 laptop:max-w-xl">
          {segments.map((s) => (
            <button
              key={s.id}
              onClick={() => (s.id === 'boeken' ? openBookSegment() : setSegment(s.id))}
              className={`flex-1 px-4 py-1.5 text-sm font-medium rounded-full transition-all touch-manipulation ${
                segment === s.id ? 'bg-accent text-on-accent' : 'text-muted'
              }`}
            >
              {t(s.label)}
            </button>
          ))}
        </div>

        {segment === 'acteurs' && <PeopleFavorites kind="actor" />}
        {segment === 'regisseurs' && <PeopleFavorites kind="director" />}

        {(segment === 'titels' || segment === 'boeken') && (
          <>
        {ratingError && (
          <p className="text-sm text-coral border border-coral/40 bg-coral/5 rounded-xl px-3.5 py-2.5 mb-6">
            {ratingError}
          </p>
        )}

        {segment === 'titels' && (
        <div className="flex gap-2 mb-6 laptop:max-w-xl">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('placeholder')}
              className={`${input} pl-10`}
            />
          </div>
          <button onClick={handleSearch} disabled={loading} className={btnPrimary}>
            {t('button')}
          </button>
        </div>
        )}

        {segment === 'boeken' && (
          <div className="mb-6">
            <p className="text-muted text-sm mb-4 leading-relaxed laptop:max-w-2xl">
              {t('booksIntro')}
            </p>
            <div className="flex gap-2 mb-4 laptop:max-w-xl">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
                <input
                  type="text"
                  value={bookQuery}
                  onChange={(e) => setBookQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleBookSearch()}
                  placeholder={t('booksPlaceholder')}
                  className={`${input} pl-10`}
                />
              </div>
              <button onClick={handleBookSearch} disabled={bookLoading} className={btnPrimary}>
                {t('button')}
              </button>
            </div>
            {bookActiveQuery && (
              <p className="text-xs text-faint mb-3">
                {t('booksResultsFor', { query: bookActiveQuery })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => changeBookType('movie')} className={chip(bookType === 'movie', 'accent', 'sm')}>
                {tt('films')}
              </button>
              <button onClick={() => changeBookType('tv')} className={chip(bookType === 'tv', 'accent', 'sm')}>
                {tt('seriesPlural')}
              </button>
              <button onClick={toggleBookMine} className={chip(bookMineOnly, 'teal', 'sm')}>
                {t('booksMineOnly')}
              </button>
              {!bookActiveQuery && (hiddenBookCount > 0 || bookShowKnown) && (
                <button onClick={() => setBookShowKnown((v) => !v)} className={chip(bookShowKnown, 'teal', 'sm')}>
                  {bookShowKnown ? t('booksShowKnown') : t('booksShowKnownCount', { count: hiddenBookCount })}
                </button>
              )}
            </div>
            {bookError && <p className="text-sm text-coral mt-3">{bookError}</p>}
            {bookLoading && visibleBooks.length === 0 && <p className="text-muted text-sm mt-4">{tt('loadingShort')}</p>}
            {!bookLoading && !bookError && bookResults.length > 0 && visibleBooks.length === 0 && (
              <p className="text-muted text-sm mt-4">
                {bookPage < bookTotalPages
                  ? t('booksAllDonePage')
                  : t('booksAllDone')}
              </p>
            )}
            {!bookLoading && !bookError && bookResults.length === 0 && (
              <p className="text-muted text-sm mt-4">
                {bookActiveQuery
                  ? t('booksNoMatch')
                  : t('booksNothing')}
              </p>
            )}
          </div>
        )}

        {segment === 'titels' && searchNote && <p className="text-sm text-muted mb-3">{searchNote}</p>}

        {(segment === 'titels' ? results : visibleBooks).length > 0 && (
          <div className="flex flex-col gap-2 mb-10 laptop:grid laptop:grid-cols-2">
            {(segment === 'titels' ? results : visibleBooks).map((movie) => {
              const added = favorites.find((f) => f.id === movie.id && f.media_type === movie.media_type)
              const currentRating = ratings.get(ratingKey(movie))
              return (
                <div key={`${movie.media_type}-${movie.id}`} className={`${card} p-3`}>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setInfoItem(movie)}
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
                      <div className="w-11 aspect-[2/3] rounded-lg bg-surface-2 flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm min-w-0">
                      <span className="block font-medium truncate">{movie.title}</span>
                      <span className="text-xs text-muted">
                        {movie.release_date?.slice(0, 4)} · {movie.media_type === 'tv' ? tt('series') : tt('film')}
                      </span>
                    </span>
                    </button>
                    <button
                      onClick={() => toggleFavorite(movie)}
                      className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-all flex-shrink-0 touch-manipulation active:scale-[0.96] ${
                        added ? 'border-teal text-teal bg-teal/12' : 'border-line hover:border-accent hover:text-accent'
                      }`}
                    >
                      {added ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                      {tt('favorite')}
                    </button>
                  </div>
                  <div className="flex gap-1.5 flex-wrap mt-3 pl-[56px]">
                    {RATING_BUTTONS.map(({ rating, label, tone }) => (
                      <button
                        key={rating}
                        onClick={() => rateMovie(movie, rating)}
                        className={`${chip(currentRating === rating, tone, "sm")}`}
                      >
                        {tt(label)}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {segment === 'boeken' && bookPage < bookTotalPages && bookResults.length > 0 && !bookActiveQuery && (
          <button onClick={() => loadBooks(bookType, bookMineOnly, bookPage + 1)} disabled={bookLoading} className={`${btnSecondary} w-full mb-6`}>
            {bookLoading ? tt('loadingShort') : t('loadMore')}
          </button>
        )}

        {segment === 'titels' && (
          <>
        <h2 className="font-display text-lg mb-3">{t('yourFavorites', { count: favorites.length })}</h2>

        {favorites.length === 0 && (
          <p className="text-muted text-sm mb-6">{t('noFavorites')}</p>
        )}

        {movieFavorites.length > 0 && (
          <div className="mb-6">
            <h3 className="text-sm text-muted mb-2">{t('filmsCount', { count: movieFavorites.length })}</h3>
            <div className="flex flex-col gap-1.5 laptop:grid laptop:grid-cols-2">
              {movieFavorites.map((movie) => (
                <div key={`movie-${movie.id}`} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                  <button onClick={() => setInfoItem(movie)} className="flex-1 text-sm truncate text-left touch-manipulation">
                    {movie.title}
                  </button>
                  <button
                    onClick={() => removeFavorite(movie)}
                    className="text-muted hover:text-coral transition-colors p-1"
                    aria-label={tt('remove')}
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
            <h3 className="text-sm text-muted mb-2">{t('seriesCount', { count: tvFavorites.length })}</h3>
            <div className="flex flex-col gap-1.5 laptop:grid laptop:grid-cols-2">
              {tvFavorites.map((movie) => (
                <div key={`tv-${movie.id}`} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                  <button onClick={() => setInfoItem(movie)} className="flex-1 text-sm truncate text-left touch-manipulation">
                    {movie.title}
                  </button>
                  <button
                    onClick={() => removeFavorite(movie)}
                    className="text-muted hover:text-coral transition-colors p-1"
                    aria-label={tt('remove')}
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <h2 className="font-display text-lg mb-3">{t('yourRatings', { count: ratedMovies.length })}</h2>

        {ratedMovies.length === 0 && (
          <p className="text-muted text-sm mb-6">{t('noRatings')}</p>
        )}

        {ratedMovies.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-6 laptop:grid laptop:grid-cols-2">
            {/* De laatst beoordeelde bovenaan; de gekozen beoordeling staat aangevinkt in elke rij. */}
            {[...ratedMovies]
              .sort((a, b) => (b.rated_at ?? '').localeCompare(a.rated_at ?? ''))
              .map((movie) => (
                <div key={ratingKey(movie)} className={`${card} flex items-center gap-3 flex-wrap px-4 py-2.5`}>
                  <button
                    onClick={() => setInfoItem({ id: movie.id, title: movie.title, media_type: movie.media_type })}
                    className="flex-1 text-sm min-w-[140px] truncate text-left touch-manipulation"
                  >
                    {movie.title}{' '}
                    <span className="text-xs text-faint">{movie.media_type === 'tv' ? tt('series') : tt('film')}</span>
                  </button>
                  <div className="flex gap-1.5 flex-wrap items-center">
                    {RATING_BUTTONS.map(({ rating, label, tone }) => (
                      <button
                        key={rating}
                        onClick={() => rateMovie(movie, rating)}
                        className={`${chip(movie.rating === rating, tone, 'sm')}`}
                      >
                        {tt(label)}
                      </button>
                    ))}
                    <button
                      // Zelfde knop nogmaals met de al actieve rating triggert de
                      // "opheffen"-tak in rateMovie hierboven — geen aparte verwijder-
                      // aanroep nodig, gewoon een duidelijker knopje voor diezelfde actie.
                      onClick={() => rateMovie(movie, movie.rating)}
                      className="text-muted hover:text-coral transition-colors p-1"
                      aria-label={t('removeRating')}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
          </>
        )}
          </>
        )}
      </main>

      {infoItem && (
        <TitleInfoSheet item={infoItem} onClose={() => setInfoItem(null)}>
          {(details) => (
            <>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  onClick={() => addToWatchlist({ ...infoItem, poster_path: details?.posterPath ?? infoItem.poster_path ?? null })}
                  className={btnPrimary}
                >
                  {watchlistKeys.has(`${infoItem.media_type}-${infoItem.id}`) ? (
                    <CheckIcon className="w-4 h-4" />
                  ) : (
                    <PlusIcon className="w-4 h-4" />
                  )}
                  {tt('addToWatchlist')}
                </button>
                <button onClick={() => toggleFavorite({ ...infoItem, poster_path: infoItem.poster_path ?? null })} className={btnSecondary}>
                  {favorites.some((f) => f.id === infoItem.id && f.media_type === infoItem.media_type) ? (
                    <CheckIcon className="w-4 h-4" />
                  ) : (
                    <PlusIcon className="w-4 h-4" />
                  )}
                  {tt('favorite')}
                </button>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {RATING_BUTTONS.map(({ rating, label, tone }) => (
                  <button
                    key={rating}
                    onClick={() => rateMovie(infoItem, rating)}
                    className={chip(ratings.get(ratingKey(infoItem)) === rating, tone, 'sm')}
                  >
                    {tt(label)}
                  </button>
                ))}
              </div>
            </>
          )}
        </TitleInfoSheet>
      )}

      <BottomNav />
    </>
  )
}
