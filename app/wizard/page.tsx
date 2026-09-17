'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { btnPrimary, btnGhost, input, card, chip } from '../components/ui'
import {
  SearchIcon,
  PlusIcon,
  CheckIcon,
  TrashIcon,
  ChevronLeftIcon,
  HomeIcon,
  SettingsIcon,
  UsersIcon,
} from '../components/Icons'

const AVAILABLE_SERVICES = [
  { id: 'netflix', label: 'Netflix' },
  { id: 'videoland', label: 'Videoland' },
  { id: 'disney_plus', label: 'Disney+' },
  { id: 'amazon_prime', label: 'Prime Video' },
  { id: 'hbo_max', label: 'HBO Max' },
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

const STEP_LABELS = ['Streaming', 'Favorieten', 'Genres', 'Acteurs', 'Klaar']

export default function Wizard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState(1)
  const [userId, setUserId] = useState<string | null>(null)

  // Stap 1
  const [selectedServices, setSelectedServices] = useState<string[]>([])

  // Stap 2
  const [movieQuery, setMovieQuery] = useState('')
  const [movieResults, setMovieResults] = useState<MovieResult[]>([])
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
      setExcludedGenres(profile?.excluded_genres || [])
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
      setError(`Kon niet opslaan: ${error.message}`)
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
      setError(`Kon niet opslaan: ${error.message}`)
      return
    }
    setStep(4)
  }

  async function handleMovieSearch() {
    if (!movieQuery) return
    setMovieSearchLoading(true)
    const res = await fetch(`/api/search-movies?query=${encodeURIComponent(movieQuery)}`)
    const data = await res.json()
    setMovieResults(data.results || [])
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
      setError(`Kon "${movie.title}" niet toevoegen: ${error.message}`)
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
      setError(`Kon niet verwijderen: ${error.message}`)
      return
    }
    setFavorites(favorites.filter((f) => !(f.id === movie.id && f.media_type === movie.media_type)))
  }

  async function handleActorSearch() {
    if (!actorQuery) return
    setActorSearchLoading(true)
    const res = await fetch(`/api/search-people?query=${encodeURIComponent(actorQuery)}&type=actor`)
    const data = await res.json()
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
      setError(`Kon "${person.name}" niet toevoegen: ${error.message}`)
      return
    }
    setFavoriteActors([{ person_id: person.id, name: person.name, profile_path: person.profile_path }, ...favoriteActors])
  }

  async function removeFavoriteActor(personId: number) {
    if (!userId) return
    setError(null)
    const { error } = await supabase.from('favorite_people').delete().eq('user_id', userId).eq('person_id', personId)
    if (error) {
      setError(`Kon niet verwijderen: ${error.message}`)
      return
    }
    setFavoriteActors(favoriteActors.filter((p) => p.person_id !== personId))
  }

  async function handleDirectorSearch() {
    if (!directorQuery) return
    setDirectorSearchLoading(true)
    const res = await fetch(`/api/search-people?query=${encodeURIComponent(directorQuery)}&type=director`)
    const data = await res.json()
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
      setError(`Kon "${person.name}" niet toevoegen: ${error.message}`)
      return
    }
    setFavoriteDirectors([{ person_id: person.id, name: person.name, profile_path: person.profile_path }, ...favoriteDirectors])
  }

  async function removeFavoriteDirector(personId: number) {
    if (!userId) return
    setError(null)
    const { error } = await supabase.from('favorite_directors').delete().eq('user_id', userId).eq('person_id', personId)
    if (error) {
      setError(`Kon niet verwijderen: ${error.message}`)
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
      setError(`Kon niet afronden: ${error.message}`)
      return
    }
    router.push('/')
  }

  if (loading) {
    return (
      <main className="max-w-sm mx-auto px-5 pt-10 pb-16">
        <div className="h-6 w-32 rounded-lg bg-[#1A2330] animate-skeleton mb-8" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-[#1A2330] animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
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
          <button onClick={() => setStep(step - 1)} className="text-[#93A3B5] hover:text-[#F2EFE9] transition-colors p-1 -ml-1 flex-shrink-0" aria-label="Vorige stap">
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
        )}
        <div className="flex gap-1.5 flex-1">
          {STEP_LABELS.map((_, i) => (
            <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i + 1 <= step ? 'bg-[#E8A33D]' : 'bg-[#2A3644]'}`} />
          ))}
        </div>
      </div>
      <p className="text-xs text-[#5E6D80] mb-8">Stap {step} van {STEP_LABELS.length} — {STEP_LABELS[step - 1]}</p>

      {error && (
        <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-6">
          {error}
        </p>
      )}

      {step === 1 && (
        <div className="flex-1 flex flex-col">
          <h1 className="font-display text-2xl mb-1">Kies je streamingdiensten</h1>
          <p className="text-[#93A3B5] mb-6">Kies je streamingdiensten. Heb je geen streamingdiensten? Kies dan &ldquo;Sla deze stap over&rdquo;.</p>
          <div className="grid grid-cols-2 gap-2 mb-8">
            {AVAILABLE_SERVICES.map((service) => {
              const active = selectedServices.includes(service.id)
              return (
                <button
                  key={service.id}
                  onClick={() => toggleService(service.id)}
                  className={`flex items-center gap-2 text-left rounded-xl border px-4 py-3 transition-all touch-manipulation active:scale-[0.97] ${
                    active ? 'border-[#E8A33D] text-[#E8A33D] bg-[#E8A33D]/10' : 'border-[#2A3644] hover:border-[#3d4c60]'
                  }`}
                >
                  <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-md border transition-all ${active ? 'border-[#E8A33D] bg-[#E8A33D]' : 'border-[#3A4A5C]'}`}>
                    {active && <CheckIcon className="w-3 h-3 text-[#171F2B]" />}
                  </span>
                  <span className="text-sm font-medium">{service.label}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-auto flex flex-col gap-2">
            <button onClick={goToStep2} className={btnPrimary}>Volgende</button>
            <button onClick={() => setStep(2)} className={btnGhost}>Sla deze stap over</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="flex-1 flex flex-col">
          <h1 className="font-display text-2xl mb-1">Kies je favorieten</h1>
          <p className="text-[#93A3B5] mb-1">Kies minimaal {MIN_FAVORITES} films en series die je écht heel leuk vindt. Deze keuzes tellen zwaar mee in de aanbevelingen van je films of series.</p>
          <p className="text-sm font-medium text-[#E8A33D] mb-6">{favorites.length} / {MIN_FAVORITES} gekozen</p>

          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E6D80]" />
              <input
                type="text"
                value={movieQuery}
                onChange={(e) => setMovieQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleMovieSearch()}
                placeholder="Zoek een film of serie..."
                className={`${input} pl-10`}
              />
            </div>
            <button onClick={handleMovieSearch} disabled={movieSearchLoading} className={btnPrimary}>Zoeken</button>
          </div>

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
                      <div className="w-9 aspect-[2/3] rounded-md bg-[#212C3B] flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm min-w-0 truncate">
                      {movie.title} <span className="text-xs text-[#5E6D80]">{movie.release_date?.slice(0, 4)} · {movie.media_type === 'tv' ? 'Serie' : 'Film'}</span>
                    </span>
                    <button
                      onClick={() => addFavoriteMovie(movie)}
                      className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-all flex-shrink-0 touch-manipulation active:scale-[0.96] ${
                        added ? 'border-[#52A9A0] text-[#52A9A0] bg-[#52A9A0]/12' : 'border-[#2A3644] hover:border-[#E8A33D] hover:text-[#E8A33D]'
                      }`}
                    >
                      {added ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                      {added ? 'Toegevoegd' : 'Toevoegen'}
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {favorites.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-6">
              <h3 className="text-sm text-[#93A3B5] mb-1">Jouw favorieten</h3>
              {favorites.map((movie) => (
                <div key={`${movie.media_type}-${movie.id}`} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                  <span className="flex-1 text-sm truncate">{movie.title}</span>
                  <button onClick={() => removeFavoriteMovie(movie)} className="text-[#93A3B5] hover:text-[#C97064] transition-colors p-1" aria-label="Verwijderen">
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
                ? `Nog ${MIN_FAVORITES - favorites.length} te gaan`
                : 'Volgende'}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex-1 flex flex-col">
          <h1 className="font-display text-2xl mb-1">Sluit genres uit</h1>
          <p className="text-[#93A3B5] mb-6">Selecteer hier de genres waar je echt niet van houdt, zodat deze niet meegenomen worden in de aanbevelingen.</p>

          <h3 className="text-sm text-[#93A3B5] mb-2">Films</h3>
          <div className="flex flex-wrap gap-2 mb-5">
            {MOVIE_GENRES.map((genre) => (
              <button key={genre.id} onClick={() => toggleGenre(genre.id)} className={chip(excludedGenres.includes(genre.id), 'coral')}>
                {genre.label}
              </button>
            ))}
          </div>
          <h3 className="text-sm text-[#93A3B5] mb-2">Series</h3>
          <div className="flex flex-wrap gap-2 mb-6">
            {TV_GENRES.map((genre) => (
              <button key={genre.id} onClick={() => toggleGenre(genre.id)} className={chip(excludedGenres.includes(genre.id), 'coral')}>
                {genre.label}
              </button>
            ))}
          </div>

          <div className="mt-auto pt-4 flex flex-col gap-2">
            <button onClick={goToStep4} className={btnPrimary}>Volgende</button>
            <button onClick={() => setStep(4)} className={btnGhost}>Sla deze stap over</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex-1 flex flex-col">
          <h1 className="font-display text-2xl mb-1">Favoriete acteurs &amp; regisseurs</h1>
          <p className="text-[#93A3B5] mb-6">Optioneel — films en series met hen erin komen hoger in je aanbevelingen.</p>

          <h3 className="text-sm text-[#93A3B5] mb-2">Acteurs &amp; actrices</h3>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E6D80]" />
              <input
                type="text"
                value={actorQuery}
                onChange={(e) => setActorQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleActorSearch()}
                placeholder="Zoek een acteur of actrice..."
                className={`${input} pl-10`}
              />
            </div>
            <button onClick={handleActorSearch} disabled={actorSearchLoading} className={btnPrimary}>Zoeken</button>
          </div>
          {actorResults.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-4">
              {actorResults.map((person) => {
                const added = favoriteActors.some((p) => p.person_id === person.id)
                return (
                  <div key={person.id} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                    {person.profile_path ? (
                      <Image src={`https://image.tmdb.org/t/p/w92${person.profile_path}`} alt={person.name} width={32} height={32} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#212C3B] flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm truncate">{person.name}</span>
                    <button
                      onClick={() => addFavoriteActor(person)}
                      className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-all flex-shrink-0 touch-manipulation active:scale-[0.96] ${
                        added ? 'border-[#52A9A0] text-[#52A9A0] bg-[#52A9A0]/12' : 'border-[#2A3644] hover:border-[#E8A33D] hover:text-[#E8A33D]'
                      }`}
                    >
                      {added ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                      {added ? 'Toegevoegd' : 'Toevoegen'}
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
                    <div className="w-8 h-8 rounded-full bg-[#212C3B] flex-shrink-0" />
                  )}
                  <span className="flex-1 text-sm truncate">{person.name}</span>
                  <button onClick={() => removeFavoriteActor(person.person_id)} className="text-[#93A3B5] hover:text-[#C97064] transition-colors p-1" aria-label="Verwijderen">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <h3 className="text-sm text-[#93A3B5] mb-2">Regisseurs</h3>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5E6D80]" />
              <input
                type="text"
                value={directorQuery}
                onChange={(e) => setDirectorQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDirectorSearch()}
                placeholder="Zoek een regisseur..."
                className={`${input} pl-10`}
              />
            </div>
            <button onClick={handleDirectorSearch} disabled={directorSearchLoading} className={btnPrimary}>Zoeken</button>
          </div>
          {directorResults.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-4">
              {directorResults.map((person) => {
                const added = favoriteDirectors.some((p) => p.person_id === person.id)
                return (
                  <div key={person.id} className={`${card} flex items-center gap-3 px-4 py-2.5`}>
                    {person.profile_path ? (
                      <Image src={`https://image.tmdb.org/t/p/w92${person.profile_path}`} alt={person.name} width={32} height={32} className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[#212C3B] flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm truncate">{person.name}</span>
                    <button
                      onClick={() => addFavoriteDirector(person)}
                      className={`flex items-center gap-1 text-xs font-medium rounded-full px-3 py-1.5 border transition-all flex-shrink-0 touch-manipulation active:scale-[0.96] ${
                        added ? 'border-[#52A9A0] text-[#52A9A0] bg-[#52A9A0]/12' : 'border-[#2A3644] hover:border-[#E8A33D] hover:text-[#E8A33D]'
                      }`}
                    >
                      {added ? <CheckIcon className="w-3.5 h-3.5" /> : <PlusIcon className="w-3.5 h-3.5" />}
                      {added ? 'Toegevoegd' : 'Toevoegen'}
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
                    <div className="w-8 h-8 rounded-full bg-[#212C3B] flex-shrink-0" />
                  )}
                  <span className="flex-1 text-sm truncate">{person.name}</span>
                  <button onClick={() => removeFavoriteDirector(person.person_id)} className="text-[#93A3B5] hover:text-[#C97064] transition-colors p-1" aria-label="Verwijderen">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="mt-auto pt-4 flex flex-col gap-2">
            <button onClick={() => setStep(5)} className={btnPrimary}>Volgende</button>
            <button onClick={() => setStep(5)} className={btnGhost}>Sla deze stap over</button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="flex-1 flex flex-col">
          <h1 className="font-display text-2xl mb-1">Je bent er klaar voor</h1>
          <p className="text-[#93A3B5] mb-6">Een paar dingen die handig zijn om te weten.</p>

          <div className="flex flex-col gap-3 mb-8">
            <div className={`${card} p-4 flex gap-3`}>
              <div className="w-9 h-9 rounded-full bg-[#E8A33D]/12 flex items-center justify-center flex-shrink-0">
                <HomeIcon className="w-4.5 h-4.5 text-[#E8A33D]" />
              </div>
              <div>
                <p className="font-medium text-sm mb-1">Voor jou</p>
                <p className="text-sm text-[#93A3B5] leading-relaxed">Drie tabbladen — van &ldquo;Puur mijn smaak&rdquo; tot &ldquo;Verras me&rdquo; — elk met andere aanbevelingen. Beoordeel wat je ziet, hoe meer hoe scherper het wordt.</p>
              </div>
            </div>
            <div className={`${card} p-4 flex gap-3`}>
              <div className="w-9 h-9 rounded-full bg-[#52A9A0]/12 flex items-center justify-center flex-shrink-0">
                <SearchIcon className="w-4.5 h-4.5 text-[#52A9A0]" />
              </div>
              <div>
                <p className="font-medium text-sm mb-1">Zoeken</p>
                <p className="text-sm text-[#93A3B5] leading-relaxed">Hier kun je altijd nog meer favorieten toevoegen of iets direct beoordelen — ook zonder het als favoriet te markeren.</p>
              </div>
            </div>
            <div className={`${card} p-4 flex gap-3`}>
              <div className="w-9 h-9 rounded-full bg-[#93A3B5]/12 flex items-center justify-center flex-shrink-0">
                <SettingsIcon className="w-4.5 h-4.5 text-[#93A3B5]" />
              </div>
              <div>
                <p className="font-medium text-sm mb-1">Instellingen</p>
                <p className="text-sm text-[#93A3B5] leading-relaxed">Streamingdiensten, genres uitsluiten en favoriete acteurs/regisseurs kun je hier altijd nog aanpassen.</p>
              </div>
            </div>
            <div className={`${card} p-4 flex gap-3`}>
              <div className="w-9 h-9 rounded-full bg-[#C97064]/12 flex items-center justify-center flex-shrink-0">
                <UsersIcon className="w-4.5 h-4.5 text-[#C97064]" />
              </div>
              <div>
                <p className="font-medium text-sm mb-1">Samen</p>
                <p className="text-sm text-[#93A3B5] leading-relaxed">Koppel je partner (ook bij Instellingen) om aanbevelingen te zien die jullie allebei goed zouden vinden.</p>
              </div>
            </div>
          </div>

          <div className="mt-auto">
            <button onClick={handleFinish} disabled={finishing} className={`${btnPrimary} w-full`}>
              {finishing ? 'Bezig...' : 'Beginnen'}
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
