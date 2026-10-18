'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { supabase, authFetch } from '@/lib/supabase'
import PersonInfoSheet from '../components/PersonInfoSheet'
import ExcludedGenreWarning from '../components/ExcludedGenreWarning'
import ExcludeChip from '../components/ExcludeChip'
import { btnPrimary, btnGhost, input, card } from '../components/ui'
import {
  CloseIcon,
  SearchIcon,
  PlusIcon,
  CheckIcon,
  TrashIcon,
  ChevronLeftIcon,
  HomeIcon,
  SettingsIcon,
  UsersIcon,
  BookmarkIcon,
} from '../components/Icons'

const AVAILABLE_SERVICES = [
  { id: 'netflix', label: 'Netflix' },
  { id: 'videoland', label: 'Videoland' },
  { id: 'disney_plus', label: 'Disney+' },
  { id: 'amazon_prime', label: 'Prime Video' },
  { id: 'hbo_max', label: 'HBO Max' },
  { id: 'apple_tv', label: 'Apple TV' },
  { id: 'skyshowtime', label: 'SkyShowtime' },
  { id: 'viaplay', label: 'Viaplay' },
  { id: 'npo_start', label: 'NPO Start' },
  { id: 'pathe_thuis', label: 'Pathé Thuis (huren)' },
]

const MIN_FAVORITES = 5

// TMDB's vaste genre-lijsten (nl-NL) — zelfde lijst als op de Instellingen-pagina.
const MOVIE_GENRES = [
  { id: 28, label: 'Actie' },
  { id: 12, label: 'Avontuur' },
  { id: 16, label: 'Animatie' },
  { id: 35, label: 'Komedie' },
  { id: 80, label: 'Misdaad' },
  { id: 99, label: 'Documentaire' },
  { id: 18, label: 'Drama' },
  { id: 10751, label: 'Familie' },
  { id: 14, label: 'Fantasy' },
  { id: 36, label: 'Historie' },
  { id: 27, label: 'Horror' },
  { id: 10402, label: 'Muziek' },
  { id: 9648, label: 'Mysterie' },
  { id: 10749, label: 'Romantiek' },
  { id: 878, label: 'Sciencefiction' },
  { id: 10770, label: 'Tv-film' },
  { id: 53, label: 'Thriller' },
  { id: 10752, label: 'Oorlog' },
  { id: 37, label: 'Western' },
]

const TV_GENRES = [
  { id: 10759, label: 'Actie en avontuur' },
  { id: 16, label: 'Animatie' },
  { id: 35, label: 'Komedie' },
  { id: 80, label: 'Misdaad' },
  { id: 99, label: 'Documentaire' },
  { id: 18, label: 'Drama' },
  { id: 10751, label: 'Familie' },
  { id: 10762, label: 'Kids' },
  { id: 9648, label: 'Mysterie' },
  { id: 10763, label: 'Nieuws' },
  { id: 10764, label: 'Reality' },
  { id: 10765, label: 'Sciencefiction en fantasy' },
  { id: 10766, label: 'Soap' },
  { id: 10767, label: 'Talkshow' },
  { id: 10768, label: 'Oorlog en politiek' },
  { id: 37, label: 'Western' },
]

type MovieResult = { id: number; title: string; poster_path: string | null; release_date?: string; media_type: 'movie' | 'tv' }
type FavoriteMovie = { id: number; title: string; media_type: 'movie' | 'tv' }
type PersonResult = { id: number; name: string; profile_path: string | null }
type FavoritePerson = { person_id: number; name: string; profile_path: string | null }

// Sleutels onder "wizard" in messages/*.json.
const STEP_LABELS = ['stepStreaming', 'stepFavorites', 'stepGenres', 'stepActors', 'stepDone'] as const

export default function Wizard() {
  const router = useRouter()
  const t = useTranslations('wizard')
  const tt = useTranslations('title')
  const tg = useTranslations('genres')
  const tn = useTranslations('nav')
  const ts = useTranslations('search')
  const tp = useTranslations('people')
  const tsv = useTranslations('services')
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(1)
  const [userId, setUserId] = useState<string | null>(null)

  // Stap 1
  const [selectedServices, setSelectedServices] = useState<string[]>([])

  // Stap 2
  const [movieQuery, setMovieQuery] = useState('')
  const [movieResults, setMovieResults] = useState<MovieResult[]>([])
  // Uitleg bij de resultaten als het geen gewone treffers zijn ("Bedoelde je misschien…").
  const [movieSearchNote, setMovieSearchNote] = useState<string | null>(null)
  const [movieSearchLoading, setMovieSearchLoading] = useState(false)
  const [favorites, setFavorites] = useState<FavoriteMovie[]>([])

  // Stap 3
  const [excludedGenres, setExcludedGenres] = useState<number[]>([])

  // Stap 4
  const [actorQuery, setActorQuery] = useState('')
  const [actorResults, setActorResults] = useState<PersonResult[]>([])
  const [actorSearchLoading, setActorSearchLoading] = useState(false)
  const [favoriteActors, setFavoriteActors] = useState<FavoritePerson[]>([])
  const [directorQuery, setDirectorQuery] = useState('')
  const [directorResults, setDirectorResults] = useState<PersonResult[]>([])
  const [directorSearchLoading, setDirectorSearchLoading] = useState(false)
  const [favoriteDirectors, setFavoriteDirectors] = useState<FavoritePerson[]>([])

  const [error, setError] = useState<string | null>(null)
  const [infoPerson, setInfoPerson] = useState<{ kind: 'actor' | 'director'; person: PersonResult } | null>(null)
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUserId(user.id)

      const [{ data: profile }, { data: favs }, { data: people }, { data: directors }] = await Promise.all([
        supabase.from('profiles').select('streaming_services, excluded_genres, onboarding_started_at').eq('id', user.id).single(),
        supabase.from('favorite_movies').select('tmdb_id, title, media_type').eq('user_id', user.id),
        supabase.from('favorite_people').select('person_id, name, profile_path').eq('user_id', user.id),
        supabase.from('favorite_directors').select('person_id, name, profile_path').eq('user_id', user.id),
      ])

      const services = profile?.streaming_services || []
      const favMovies = (favs || []).map((f) => ({ id: f.tmdb_id, title: f.title, media_type: f.media_type as 'movie' | 'tv' }))

      setSelectedServices(services)
      setFavorites(favMovies)
      setExcludedGenres(Array.isArray(profile?.excluded_genres) ? profile.excluded_genres : [])
      setFavoriteActors(people || [])
      setFavoriteDirectors(directors || [])

      if (profile && !profile.onboarding_started_at) {
        await supabase.from('profiles').update({ onboarding_started_at: new Date().toISOString() }).eq('id', user.id)
      }

      // Slim hervatten: al gedaan is meteen overgeslagen, ongeacht hoelang geleden. Stap 3
      // (genres) en stap 4 (acteurs) zijn allebei optioneel en hebben geen betrouwbaar
      // "al gedaan"-signaal (een lege keuze kan ook gewoon een bewuste keuze zijn) — bij
      // voldoende favorieten landen we daarom op stap 3, met een "sla over" binnen handbereik.
      if (services.length === 0) setStep(1)
      else if (favMovies.length < MIN_FAVORITES) setStep(2)
      else setStep(3)

      setLoading(false)
    }
    init()
  }, [router])

  function toggleService(id: string) {
    setSelectedServices((current) => (current.includes(id) ? current.filter((s) => s !== id) : [...current, id]))
  }

  async function goToStep2() {
    if (!userId) return
    setError(null)
    const { error } = await supabase.from('profiles').update({ streaming_services: selectedServices }).eq('id', userId)
    if (error) {
      setError(t('errSave', { message: error.message }))
      return
    }
    setStep(2)
  }

  function toggleGenre(id: number) {
    setExcludedGenres((current) => (current.includes(id) ? current.filter((g) => g !== id) : [...current, id]))
  }

  async function goToStep4() {
    if (!userId) return
    setError(null)
    const { error } = await supabase.from('profiles').update({ excluded_genres: excludedGenres }).eq('id', userId)
    if (error) {
      setError(t('errSave', { message: error.message }))
      return
    }
    setStep(4)
  }

  async function handleMovieSearch() {
    if (!movieQuery) return
    setMovieSearchLoading(true)
    setError(null)
    const res = await authFetch(`/api/search-movies?query=${encodeURIComponent(movieQuery)}`)
    const data = await res.json()
    if (!res.ok) setError(data.error || ts('failed'))
    setMovieResults(data.results || [])
    setMovieSearchNote(data.note ?? null)
    setMovieSearchLoading(false)
  }

  async function addFavoriteMovie(movie: MovieResult) {
    if (!userId) return
    if (favorites.find((f) => f.id === movie.id && f.media_type === movie.media_type)) return
    setError(null)
    const { error } = await supabase.from('favorite_movies').insert({
      user_id: userId,
      tmdb_id: movie.id,
      title: movie.title,
      media_type: movie.media_type,
    })
    if (error) {
      setError(t('errAdd', { title: movie.title, message: error.message }))
      return
    }
    setFavorites([{ id: movie.id, title: movie.title, media_type: movie.media_type }, ...favorites])
  }

  async function removeFavoriteMovie(movie: FavoriteMovie) {
    if (!userId) return
    setError(null)
    const { error } = await supabase
      .from('favorite_movies')
      .delete()
      .eq('user_id', userId)
      .eq('tmdb_id', movie.id)
      .eq('media_type', movie.media_type)
    if (error) {
      setError(t('errRemove', { message: error.message }))
      return
    }
    setFavorites(favorites.filter((f) => !(f.id === movie.id && f.media_type === movie.media_type)))
  }

  async function handleActorSearch() {
    if (!actorQuery) return
    setActorSearchLoading(true)
    setError(null)
    const res = await authFetch(`/api/search-people?query=${encodeURIComponent(actorQuery)}&type=actor`)
    const data = await res.json()
    if (!res.ok) setError(data.error || ts('failed'))
    setActorResults(data.results || [])
    setActorSearchLoading(false)
  }

  async function addFavoriteActor(person: PersonResult) {
    if (!userId) return
    if (favoriteActors.find((p) => p.person_id === person.id)) return
    setError(null)
    const { error } = await supabase.from('favorite_people').insert({
      user_id: userId,
      person_id: person.id,
      name: person.name,
      profile_path: person.profile_path,
    })
    if (error) {
      setError(t('errAdd', { title: person.name, message: error.message }))
      return
    }
    setFavoriteActors([{ person_id: person.id, name: person.name, profile_path: person.profile_path }, ...favoriteActors])
  }

  async function removeFavoriteActor(personId: number) {
    if (!userId) return
    setError(null)
    const { error } = await supabase.from('favorite_people').delete().eq('user_id', userId).eq('person_id', personId)
    if (error) {
      setError(t('errRemove', { message: error.message }))
      return
    }
    setFavoriteActors(favoriteActors.filter((p) => p.person_id !== personId))
  }

  async function handleDirectorSearch() {
    if (!directorQuery) return
    setDirectorSearchLoading(true)
    setError(null)
    const res = await authFetch(`/api/search-people?query=${encodeURIComponent(directorQuery)}&type=director`)
    const data = await res.json()
    if (!res.ok) setError(data.error || ts('failed'))
    setDirectorResults(data.results || [])
    setDirectorSearchLoading(false)
  }

  async function addFavoriteDirector(person: PersonResult) {
    if (!userId) return
    if (favoriteDirectors.find((p) => p.person_id === person.id)) return
    setError(null)
    const { error } = await supabase.from('favorite_directors').insert({
      user_id: userId,
      person_id: person.id,
      name: person.name,
      profile_path: person.profile_path,
    })
    if (error) {
      setError(t('errAdd', { title: person.name, message: error.message }))
      return
    }
    setFavoriteDirectors([{ person_id: person.id, name: person.name, profile_path: person.profile_path }, ...favoriteDirectors])
  }

  async function removeFavoriteDirector(personId: number) {
    if (!userId) return
    setError(null)
    const { error } = await supabase.from('favorite_directors').delete().eq('user_id', userId).eq('person_id', personId)
    if (error) {
      setError(t('errRemove', { message: error.message }))
      return
    }
    setFavoriteDirectors(favoriteDirectors.filter((p) => p.person_id !== personId))
  }

  async function handleFinish() {
    if (!userId) return
    setFinishing(true)
    setError(null)
    const { error } = await supabase.from('profiles').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', userId)
    setFinishing(false)
    if (error) {
      setError(t('errFinish', { message: error.message }))
      return
    }
    router.push('/')
  }

  if (loading) {
    return (
      <main className="max-w-sm mx-auto px-5 pt-10 pb-16">
        <div className="h-6 w-32 rounded-lg bg-surface animate-skeleton mb-8" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-surface animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-xl mx-auto px-5 pt-6 pb-16 min-h-screen flex flex-col">
      {/* Voortgang */}
      <div className="flex items-center gap-2 mb-1">
        {step > 1 && (
          <button onClick={() => setStep(step - 1)} className="text-muted hover:text-foreground transition-colors p-1 -ml-1 flex-shrink-0" aria-label={t('prevStep')}>
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
        )}
        <div className="flex gap-1.5 flex-1">
          {STEP_LABELS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i + 1 <= step ? 'bg-accent' : 'bg-line'}`} />
          ))}
        </div>
      </div>
      <p className="text-xs text-faint mb-8">{t('stepOf', { step, total: STEP_LABELS.length, label: t(STEP_LABELS[step - 1]) })}</p>

      {error && (
        <p className="text-sm text-coral border border-coral/40 bg-coral/5 rounded-xl px-3.5 py-2.5 mb-6">
          {error}
        </p>
      )}

      {step === 1 && (
        <div className="flex-1 flex flex-col">
          <h1 className="font-display text-2xl mb-1">{t('s1Title')}</h1>
          <p className="text-muted mb-6">{t('s1Text')}</p>
          <div className="grid grid-cols-2 gap-2 mb-8">
            {AVAILABLE_SERVICES.map((service) => {
              const active = selectedServices.includes(service.id)
              return (
                <button
                  key={service.id}
                  onClick={() => toggleService(service.id)}
                  className={`flex items-center gap-2 text-left rounded-xl border px-4 py-3 transition-all touch-manipulation active:scale-[0.97] ${
                    active ? 'border-accent text-accent bg-accent/10' : 'border-line hover:border-line-strong'
                  }`}
                >
                  <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-md border transition-all ${active ? 'border-accent bg-accent' : 'border-control'}`}>
                    {active && <CheckIcon className="w-3 h-3 text-on-accent" />}
                  </span>
                  <span className="text-sm font-medium">{service.id === 'pathe_thuis' ? tsv('patheRent') : service.label}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-auto flex flex-col gap-2">
            <button onClick={goToStep2} className={btnPrimary}>{t('next')}</button>
            <button onClick={() => setStep(2)} className={btnGhost}>{t('skip')}</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex-1 flex flex-col">
          <h1 className="font-display text-2xl mb-1">{t('s2Title')}</h1>
          <p className="text-muted mb-1">{t('s2Text', { min: MIN_FAVORITES })}</p>
          <p className="text-sm font-medium text-accent mb-6">{t('chosen', { count: favorites.length, min: MIN_FAVORITES })}</p>

          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
              <input
                type="text"
                value={movieQuery}
                onChange={(e) => setMovieQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMovieSearch()}
                placeholder={ts('placeholder')}
                className={`${input} pl-10`}
              />
            </div>
            <button onClick={handleMovieSearch} disabled={movieSearchLoading} className={btnPrimary}>{ts('button')}</button>
          </div>

          {movieSearchNote && <p className="text-sm text-muted mb-3">{movieSearchNote}</p>}

          {movieResults.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-6">
              {movieResults.map((movie) => {
                const added = favorites.some((f) => f.id === movie.id && f.media_type === movie.media_type)
                return (
                  <div key={`${movie.media_type}-${movie.id}`} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                    {movie.poster_path ? (
                      <div className="relative w-9 aspect-[2/3] rounded-md flex-shrink-0 overflow-hidden">
                        <Image src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`} alt={movie.title} fill sizes="36px" className="object-cover" />
                      </div>
                    ) : (
                      <div className="w-9 aspect-[2/3] rounded-md bg-surface-2 flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm min-w-0 truncate">
                      {movie.title} <span className="text-xs text-faint">{movie.release_date?.slice(0, 4)} · {movie.media_type === 'tv' ? tt('series') : tt('film')}</span>
                    </span>
                    <button
                      onClick={() => addFavoriteMovie(movie)}
                      className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-all flex-shrink-0 touch-manipulation active:scale-[0.96] ${
                        added ? 'border-teal text-teal bg-teal/12' : 'border-line hover:border-accent hover:text-accent'
                      }`}
                    >
                      {added ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                      {added ? t('added') : t('add')}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {favorites.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-6">
              <h3 className="text-sm text-muted mb-1">{t('yourFavorites')}</h3>
              {favorites.map((movie) => (
                <div key={`${movie.media_type}-${movie.id}`} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                  <span className="flex-1 text-sm truncate">{movie.title}</span>
                  <button onClick={() => removeFavoriteMovie(movie)} className="text-muted hover:text-coral transition-colors p-1" aria-label={tt('remove')}>
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto pt-4">
            <button
              onClick={() => setStep(3)}
              disabled={favorites.length < MIN_FAVORITES}
              className={`${btnPrimary} w-full`}
            >
              {favorites.length < MIN_FAVORITES
                ? t('toGo', { count: MIN_FAVORITES - favorites.length })
                : t('next')}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex-1 flex flex-col">
          <h1 className="font-display text-2xl mb-1">{t('s3Title')}</h1>
          <p className="text-muted mb-4">{t('s3Text')}</p>

          <div className="flex items-start gap-3 rounded-xl border border-coral/40 bg-coral/5 p-4 mb-6">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-coral/15 text-coral">
              <CloseIcon className="w-4 h-4" />
            </span>
            <p className="text-sm leading-relaxed">
              {t.rich('s3Warning', { b: (chunks) => <span className="font-medium text-coral">{chunks}</span> })}
            </p>
          </div>

          <h3 className="text-sm text-muted mb-2">{tt('films')}</h3>
          <div className="flex flex-wrap gap-2 mb-5">
            {MOVIE_GENRES.map((genre) => (
              <ExcludeChip key={genre.id} active={excludedGenres.includes(genre.id)} label={tg(`g${genre.id}`)} onClick={() => toggleGenre(genre.id)} />
            ))}
          </div>
          <h3 className="text-sm text-muted mb-2">{tt('seriesPlural')}</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            {TV_GENRES.map((genre) => (
              <ExcludeChip key={genre.id} active={excludedGenres.includes(genre.id)} label={tg(`g${genre.id}`)} onClick={() => toggleGenre(genre.id)} />
            ))}
          </div>

          <p className="text-sm text-muted mb-6">
            {excludedGenres.length === 0
              ? t('noneExcluded')
              : t('excluded', { count: excludedGenres.length })}
          </p>

          <ExcludedGenreWarning excludedGenreIds={excludedGenres} onAllow={toggleGenre} />

          <div className="mt-auto pt-4 flex flex-col gap-2">
            <button onClick={goToStep4} className={btnPrimary}>{t('next')}</button>
            <button onClick={() => setStep(4)} className={btnGhost}>{t('skip')}</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex-1 flex flex-col">
          <h1 className="font-display text-2xl mb-1">{t('s4Title')}</h1>
          <p className="text-muted mb-6">{t('s4Text')}</p>

          <h3 className="text-sm text-muted mb-2">{t('actors')}</h3>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
              <input
                type="text"
                value={actorQuery}
                onChange={(e) => setActorQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleActorSearch()}
                placeholder={tp('actorPlaceholder')}
                className={`${input} pl-10`}
              />
            </div>
            <button onClick={handleActorSearch} disabled={actorSearchLoading} className={btnPrimary}>{ts('button')}</button>
          </div>
          {actorResults.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-4">
              {actorResults.map((person) => {
                const added = favoriteActors.some((p) => p.person_id === person.id)
                return (
                  <div key={person.id} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                    <button onClick={() => setInfoPerson({ kind: 'actor', person })} className="flex items-center gap-3 flex-1 min-w-0 text-left touch-manipulation">
                    {person.profile_path ? (
                      <Image src={`https://image.tmdb.org/t/p/w92${person.profile_path}`} alt={person.name} width={32} height={32} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-surface-2 flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm truncate">{person.name}</span>
                    </button>
                    <button
                      onClick={() => addFavoriteActor(person)}
                      className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-all flex-shrink-0 touch-manipulation active:scale-[0.96] ${
                        added ? 'border-teal text-teal bg-teal/12' : 'border-line hover:border-accent hover:text-accent'
                      }`}
                    >
                      {added ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                      {added ? t('added') : t('add')}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {favoriteActors.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-6">
              {favoriteActors.map((person) => (
                <div key={person.person_id} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                  {person.profile_path ? (
                    <Image src={`https://image.tmdb.org/t/p/w92${person.profile_path}`} alt={person.name} width={32} height={32} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-2 flex-shrink-0" />
                  )}
                  <span className="flex-1 text-sm truncate">{person.name}</span>
                  <button onClick={() => removeFavoriteActor(person.person_id)} className="text-muted hover:text-coral transition-colors p-1" aria-label={tt('remove')}>
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <h3 className="text-sm text-muted mb-2">{t('directors')}</h3>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
              <input
                type="text"
                value={directorQuery}
                onChange={(e) => setDirectorQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDirectorSearch()}
                placeholder={tp('directorPlaceholder')}
                className={`${input} pl-10`}
              />
            </div>
            <button onClick={handleDirectorSearch} disabled={directorSearchLoading} className={btnPrimary}>{ts('button')}</button>
          </div>
          {directorResults.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-4">
              {directorResults.map((person) => {
                const added = favoriteDirectors.some((p) => p.person_id === person.id)
                return (
                  <div key={person.id} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                    <button onClick={() => setInfoPerson({ kind: 'director', person })} className="flex items-center gap-3 flex-1 min-w-0 text-left touch-manipulation">
                    {person.profile_path ? (
                      <Image src={`https://image.tmdb.org/t/p/w92${person.profile_path}`} alt={person.name} width={32} height={32} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-surface-2 flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm truncate">{person.name}</span>
                    </button>
                    <button
                      onClick={() => addFavoriteDirector(person)}
                      className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-all flex-shrink-0 touch-manipulation active:scale-[0.96] ${
                        added ? 'border-teal text-teal bg-teal/12' : 'border-line hover:border-accent hover:text-accent'
                      }`}
                    >
                      {added ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                      {added ? t('added') : t('add')}
                    </button>
                  </div>
                )
              })}
            </div>
          )}
          {favoriteDirectors.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-6">
              {favoriteDirectors.map((person) => (
                <div key={person.person_id} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                  {person.profile_path ? (
                    <Image src={`https://image.tmdb.org/t/p/w92${person.profile_path}`} alt={person.name} width={32} height={32} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-2 flex-shrink-0" />
                  )}
                  <span className="flex-1 text-sm truncate">{person.name}</span>
                  <button onClick={() => removeFavoriteDirector(person.person_id)} className="text-muted hover:text-coral transition-colors p-1" aria-label={tt('remove')}>
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto pt-4 flex flex-col gap-2">
            <button onClick={() => setStep(5)} className={btnPrimary}>{t('next')}</button>
            <button onClick={() => setStep(5)} className={btnGhost}>{t('skip')}</button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="flex-1 flex flex-col">
          <h1 className="font-display text-2xl mb-1">{t('s5Title')}</h1>
          <p className="text-muted mb-6">{t('s5Text')}</p>

          <div className="flex flex-col gap-3 mb-8">
            <div className={`${card} p-4 flex gap-3`}>
              <div className="w-9 h-9 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0">
                <HomeIcon className="w-4.5 h-4.5 text-accent" />
              </div>
              <div>
                <p className="font-medium text-sm mb-1">{tn('forYou')}</p>
                <p className="text-sm text-muted leading-relaxed">{t('tipForYou')}</p>
              </div>
            </div>
            <div className={`${card} p-4 flex gap-3`}>
              <div className="w-9 h-9 rounded-full bg-teal/12 flex items-center justify-center flex-shrink-0">
                <SearchIcon className="w-4.5 h-4.5 text-teal" />
              </div>
              <div>
                <p className="font-medium text-sm mb-1">{tn('search')}</p>
                <p className="text-sm text-muted leading-relaxed">{t('tipSearch')}</p>
              </div>
            </div>
            <div className={`${card} p-4 flex gap-3`}>
              <div className="w-9 h-9 rounded-full bg-muted/12 flex items-center justify-center flex-shrink-0">
                <SettingsIcon className="w-4.5 h-4.5 text-muted" />
              </div>
              <div>
                <p className="font-medium text-sm mb-1">{tn('settings')}</p>
                <p className="text-sm text-muted leading-relaxed">{t('tipSettings')}</p>
              </div>
            </div>
            <div className={`${card} p-4 flex gap-3`}>
              <div className="w-9 h-9 rounded-full bg-accent/12 flex items-center justify-center flex-shrink-0">
                <BookmarkIcon className="w-4.5 h-4.5 text-accent" />
              </div>
              <div>
                <p className="font-medium text-sm mb-1">{t('letterboxdTitle')}</p>
                <p className="text-sm text-muted leading-relaxed">{t('tipLetterboxd')}</p>
              </div>
            </div>
            <div className={`${card} p-4 flex gap-3`}>
              <div className="w-9 h-9 rounded-full bg-coral/12 flex items-center justify-center flex-shrink-0">
                <UsersIcon className="w-4.5 h-4.5 text-coral" />
              </div>
              <div>
                <p className="font-medium text-sm mb-1">{tt('together')}</p>
                <p className="text-sm text-muted leading-relaxed">{t('tipTogether')}</p>
              </div>
            </div>
          </div>

          <div className="mt-auto">
            <button onClick={handleFinish} disabled={finishing} className={`${btnPrimary} w-full`}>
              {finishing ? tt('loadingShort') : t('start')}
            </button>
          </div>
        </div>
      )}

      {infoPerson && (
        <PersonInfoSheet
          person={{ id: infoPerson.person.id, name: infoPerson.person.name, profile_path: infoPerson.person.profile_path }}
          onClose={() => setInfoPerson(null)}
        >
          <button
            onClick={async () => {
              if (infoPerson.kind === 'actor') await addFavoriteActor(infoPerson.person)
              else await addFavoriteDirector(infoPerson.person)
              setInfoPerson(null)
            }}
            className={`${btnPrimary} w-full`}
          >
            <PlusIcon className="w-4 h-4" />
            {tt('favorite')}
          </button>
        </PersonInfoSheet>
      )}
    </main>
  )
}
