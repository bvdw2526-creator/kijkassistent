'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase, getCurrentUser } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import BottomNav from './components/BottomNav'
import MovieCard from './components/MovieCard'
import { btnPrimary, btnGhost } from './components/ui'
import { CloseIcon, HeartIcon, OkIcon, DislikeIcon, PlusIcon, LogoutIcon } from './components/Icons'

type Movie = {
  id: number
  title: string
  poster_path: string | null
  vote_average: number
  score: number
  matchPercent: number
  watchOn?: string
  watchUrl?: string
  media_type: 'movie' | 'tv'
  overview?: string
  basedOn?: string[]
}

type RecommendationMode = 'focused' | 'balanced' | 'explore' | 'samen'
type TogetherTier = 'intersection' | 'fallback' | 'empty' | 'none'

const MODE_LABELS: Record<RecommendationMode, { label: string; hint: string }> = {
  focused: { label: 'Puur mijn smaak', hint: 'Alleen wat ik echt leuk vind' },
  balanced: { label: 'Mijn smaak, breder', hint: 'Leuk + oké vind ik' },
  explore: { label: 'Verras me', hint: 'Doe maar wat aanbevelingen' },
  samen: { label: 'Samen', hint: 'Wat we allebei leuk zouden vinden' },
}

const EMPTY_RESULTS: Record<RecommendationMode, Movie[]> = { focused: [], balanced: [], explore: [], samen: [] }

const RECOMMENDATIONS_CACHE_KEY_PREFIX = 'kijkassistent:recommendations:'

// Toont bij het openen van de app meteen de vorige aanbevelingen (uit localStorage) in
// plaats van een lege "Laden..."-pagina, terwijl er op de achtergrond wordt ververst.
// Dat voelt lokaal aan, ook al draait de eigenlijke berekening nog steeds op de server.
function loadCachedRecommendations(userId: string): Record<RecommendationMode, Movie[]> | null {
  try {
    const raw = localStorage.getItem(RECOMMENDATIONS_CACHE_KEY_PREFIX + userId)
    if (!raw) return null
    // Spread over EMPTY_RESULTS zodat een cache van vóór de "Samen"-tab (zonder dat
    // veld) niet crasht op een undefined array. "Samen" wordt hier altijd leeg
    // teruggegeven, ook als er ooit per ongeluk toch iets voor is opgeslagen (zie
    // saveCachedRecommendations): die lijst hoort te komen van een verse
    // loadTogetherRecommendations()-aanroep, mét een bijbehorende, actuele
    // togetherConnectionId — nooit uit een verouderde cache, anders kun je een tikje op
    // "Niet voor ons" geven vóórdat de echte koppeling opnieuw is opgehaald.
    return { ...EMPTY_RESULTS, ...JSON.parse(raw), samen: [] }
  } catch {
    return null
  }
}

function saveCachedRecommendations(userId: string, data: Record<RecommendationMode, Movie[]>) {
  try {
    // "Samen" bewust nooit meecachen — zie loadCachedRecommendations hierboven.
    localStorage.setItem(RECOMMENDATIONS_CACHE_KEY_PREFIX + userId, JSON.stringify({ ...data, samen: [] }))
  } catch {
    // Privénavigatie of volle quota — dan cachen we gewoon niet, geen probleem.
  }
}

function PosterSkeletonGrid() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="aspect-[2/3] rounded-xl bg-[#1A2330] animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
      ))}
    </div>
  )
}

// Na deze termijn stoppen we met verplicht naar de wizard doorsturen als iemand 'm nooit
// heeft afgemaakt — de app blijft dan gewoon bruikbaar (met een niet-opdringerig
// "maak je profiel af"-hintje bij Instellingen) in plaats van iemand voor altijd vast te
// houden op een onboarding die hij kennelijk niet wil afronden.
const ONBOARDING_FORCE_DAYS = 5

// Blijft "true" zodra er één keer écht is opgehaald in deze bladwijzer-sessie (SPA — dus
// niet bij elke keer terugnavigeren naar "Voor jou", wél weer bij een volledige herlaad).
// Zonder deze guard zou elke keer tussen tabbladen wisselen en terugkomen op "Voor jou"
// opnieuw de volledige aanbevelingspijplijn aanroepen, terwijl er al geldige gecachete
// data in localStorage staat — dat voelde aan als "alles ververst steeds", terwijl er een
// aparte, handmatige "Vernieuwen"-knop voor is bedoeld.
let hasFetchedThisSession = false

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [byMode, setByMode] = useState<Record<RecommendationMode, Movie[]>>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'movie' | 'tv'>('movie')
  const [selected, setSelected] = useState<Movie | null>(null)
  const [mode, setMode] = useState<RecommendationMode>('balanced')
  const [togetherConnected, setTogetherConnected] = useState<boolean | null>(null)
  const [togetherTier, setTogetherTier] = useState<TogetherTier | null>(null)
  const [togetherError, setTogetherError] = useState<string | null>(null)
  const [togetherConnectionId, setTogetherConnectionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const togetherRequestIdRef = useRef(0)
  const selectedAtRef = useRef(0)
  // Mobiele browsers wachten na een tik nog ~300ms af of het een dubbele tik (zoom)
  // wordt. Tikt iemand snel twee keer op dezelfde plek, dan opent de eerste tik deze
  // popup en landt de tweede op de knop die daar nu staat. Deze guard negeert taps op
  // de actieknoppen vlak na het openen, zodat zo'n ghost-tap niet meteen een actie triggert.
  const GHOST_TAP_GUARD_MS = 400

  useEffect(() => {
    getCurrentUser().then(async (currentUser) => {
      setUser(currentUser)
      if (currentUser) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed_at, onboarding_started_at')
          .eq('id', currentUser.id)
          .single()

        if (profile && !profile.onboarding_completed_at) {
          const startedAt = profile.onboarding_started_at ? new Date(profile.onboarding_started_at).getTime() : null
          const daysSinceStart = startedAt ? (Date.now() - startedAt) / (1000 * 60 * 60 * 24) : 0
          if (startedAt === null || daysSinceStart <= ONBOARDING_FORCE_DAYS) {
            router.push('/wizard')
            return
          }
        }

        const cached = loadCachedRecommendations(currentUser.id)
        if (cached) {
          setByMode(cached)
          setLoading(false)
        }
        if (!hasFetchedThisSession) {
          hasFetchedThisSession = true
          loadRecommendations()
          loadTogetherRecommendations()
        } else if (!cached) {
          // Geen sessievlag-cache-mismatch: wel al "gefetcht" deze sessie, maar deze tab
          // heeft zelf nog niets — dan alsnog ophalen in plaats van leeg te laten staan.
          loadRecommendations()
          loadTogetherRecommendations()
        }
      } else {
        setLoading(false)
      }
    })
  }, [router])

  async function loadRecommendations() {
    const requestId = ++requestIdRef.current
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/recommendations', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    // Als er intussen een nieuwere aanvraag is gestart (bv. door snel na elkaar
    // te scoren), negeer dit oudere antwoord zodat het niet de verse staat overschrijft.
    if (requestId !== requestIdRef.current) return
    const fresh = {
      focused: data.focused || [],
      balanced: data.balanced || [],
      explore: data.explore || [],
    }
    setLoading(false)
    // "Samen" (fresh.samen ontbreekt hier bewust) mag niet worden overschreven met een
    // lege lijst — behoud wat loadTogetherRecommendations daar eventueel al in zette.
    setByMode((current) => {
      const merged = { ...current, ...fresh }
      saveCachedRecommendations(session.user.id, merged)
      return merged
    })
  }

  // Los van loadRecommendations: "Samen" draait op een eigen endpoint (combineert twee
  // smaakprofielen) en heeft dus geen eigen resultaat-cache — een ontbrekende/verouderde
  // koppeling mag nooit de gewone drie tabbladen blokkeren of vertragen.
  async function loadTogetherRecommendations() {
    const requestId = ++togetherRequestIdRef.current
    console.log('loadTogetherRecommendations: gestart')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      console.warn('loadTogetherRecommendations: geen actieve sessie, kan niet ophalen')
      if (requestId === togetherRequestIdRef.current) {
        setTogetherError('Geen actieve sessie gevonden — herlaad de pagina en probeer opnieuw.')
      }
      return
    }
    try {
      const res = await fetch('/api/recommendations-together', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (requestId !== togetherRequestIdRef.current) {
        console.warn('loadTogetherRecommendations: verouderde aanvraag genegeerd (er liep al een nieuwere)')
        return
      }
      if (!res.ok || data.error) {
        console.error('Samen-aanbevelingen ophalen mislukt:', data.error)
        setTogetherError(data.error || `Onbekende fout (status ${res.status})`)
        return
      }
      // Nuttig om even in de devtools-console te bekijken als "Samen" leeg blijft:
      // laat zien of het aan een lege doorsnede/fallback ligt, of aan het wegfilteren
      // op streamingdiensten daarna.
      console.log('loadTogetherRecommendations: klaar', { connected: data.connected, tier: data.tier, items: (data.items || []).length, debug: data.debug })
      setTogetherError(null)
      setTogetherConnected(!!data.connected)
      setTogetherConnectionId(data.connectionId || null)
      setTogetherTier(data.tier || null)
      setByMode((current) => ({ ...current, samen: data.items || [] }))
    } catch (err) {
      if (requestId !== togetherRequestIdRef.current) return
      console.error('Samen-aanbevelingen ophalen mislukt:', err)
      setTogetherError(err instanceof Error ? err.message : 'Onbekende fout bij het ophalen van Samen-aanbevelingen')
    }
  }

  function handleModeChange(nextMode: RecommendationMode) {
    setMode(nextMode)
  }

  function removeEverywhere(movieKey: (m: Movie) => boolean) {
    setByMode((current) => ({
      focused: current.focused.filter((m) => !movieKey(m)),
      balanced: current.balanced.filter((m) => !movieKey(m)),
      explore: current.explore.filter((m) => !movieKey(m)),
      samen: current.samen.filter((m) => !movieKey(m)),
    }))
  }

  function removeFromSamen(movieKey: (m: Movie) => boolean) {
    setByMode((current) => ({ ...current, samen: current.samen.filter((m) => !movieKey(m)) }))
  }

  async function handleAddToWatchlist(movie: Movie) {
    if (!user) return
    if (Date.now() - selectedAtRef.current < GHOST_TAP_GUARD_MS) return
    setActionError(null)
    const { error } = await supabase.from('watchlist').insert({
      user_id: user.id,
      tmdb_id: movie.id,
      title: movie.title,
      poster_path: movie.poster_path,
      media_type: movie.media_type,
      watch_on: movie.watchOn ?? null,
      watch_url: movie.watchUrl ?? null,
      source_mode: mode,
    })
    if (error) {
      console.error('Op watchlist zetten mislukt:', error)
      setActionError(`Kon niet op de watchlist zetten: ${error.message}`)
      return
    }
    removeEverywhere((m) => m.id === movie.id && m.media_type === movie.media_type)
    setSelected(null)
  }

  async function handleRate(movie: Movie, rating: 'dislike' | 'ok' | 'love') {
    if (!user) return
    if (Date.now() - selectedAtRef.current < GHOST_TAP_GUARD_MS) return
    setActionError(null)
    const movieKey = (m: Movie) => m.id === movie.id && m.media_type === movie.media_type

    // In de Samen-tab beoordeel je vanuit het koppel, niet vanuit jezelf: "niet voor
    // mij" hier betekent "dit past niet bij ons", niet per se "dit vind ik zelf niet
    // leuk" (en omgekeerd kan "zeker leuk" hier ook een compromis zijn, geen puur
    // persoonlijke smaak). Dit raakt daarom uitsluitend couple_ratings — nooit je eigen
    // ratings-profiel — zodat een titel die jij zelf wél (of juist niet) waardeert
    // gewoon op basis van je eigen smaak in je persoonlijke tabbladen kan blijven
    // verschijnen, los van wat er in Samen mee gebeurt.
    if (mode === 'samen') {
      if (!togetherConnectionId) {
        setActionError('Geen actieve koppeling gevonden — herlaad de pagina en probeer opnieuw.')
        return
      }
      const { error } = await supabase.from('couple_ratings').upsert(
        {
          connection_id: togetherConnectionId,
          tmdb_id: movie.id,
          media_type: movie.media_type,
          title: movie.title,
          rating,
          rated_by: user.id,
        },
        { onConflict: 'connection_id,tmdb_id,media_type' }
      )
      if (error) {
        console.error('Koppel-beoordeling opslaan mislukt:', error)
        setActionError(
          `Kon de beoordeling niet opslaan: ${error.message}. Is de migratie "couple_ratings" al uitgevoerd in Supabase?`
        )
        return
      }
      removeFromSamen(movieKey)
      setSelected(null)
      return
    }

    const { error } = await supabase.from('ratings').upsert(
      {
        user_id: user.id,
        tmdb_id: movie.id,
        title: movie.title,
        rating,
        media_type: movie.media_type,
      },
      { onConflict: 'user_id,tmdb_id,media_type' }
    )
    if (error) {
      console.error('Rating opslaan mislukt:', error)
      setActionError(`Kon de beoordeling niet opslaan: ${error.message}`)
      return
    }

    // Geen automatische loadRecommendations()/loadTogetherRecommendations() meer hier:
    // die herberekent bij een cache-miss (wat na elke rating het geval is, want je
    // ratings zitten in de cache-signature) de volledige, zware aanbevelingspijplijn op
    // Vercel — dat voelde aan alsof de ratingknop zelf traag reageerde. De net beoordeelde
    // titel verdwijnt al direct uit de lijst (hieronder); voor bijgewerkte aanbevelingen
    // die je nieuwste smaak meewegen is er de handmatige "Vernieuwen"-knop.
    removeEverywhere(movieKey)
    setSelected(null)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
  }

  const movies = byMode[mode]

  if (loading && movies.length === 0 && !user) {
    return (
      <main className="max-w-xl mx-auto px-6 py-10">
        <PosterSkeletonGrid />
      </main>
    )
  }

  if (!user && !loading) {
    return (
      <main className="min-h-screen flex flex-col justify-center max-w-md mx-auto px-6 py-16">
        <p className="font-display text-sm tracking-[0.2em] uppercase text-[#E8A33D] mb-3">Kijkassistent</p>
        <h1 className="font-display text-4xl leading-tight mb-3">
          Weten wat je vanavond gaat kijken.
        </h1>
        <p className="text-[#93A3B5] mb-8 leading-relaxed">
          Persoonlijke films- en series-aanbevelingen, op basis van wat jij mooi vindt.
        </p>
        <a href="/login" className={btnPrimary}>
          Log in of registreer
        </a>
      </main>
    )
  }

  // Hoogste match% bovenaan, ongeacht de volgorde waarin de aanbevelingsengine ze
  // aanleverde (die mixt met opzet genres door elkaar voor variatie).
  const movieResults = movies.filter((m) => m.media_type === 'movie').sort((a, b) => b.matchPercent - a.matchPercent)
  const tvResults = movies.filter((m) => m.media_type === 'tv').sort((a, b) => b.matchPercent - a.matchPercent)
  const visible = tab === 'movie' ? movieResults : tvResults
  const showSkeleton = loading && movies.length === 0

  return (
    <>
      <main className="max-w-xl mx-auto px-5 pt-6 pb-28">
        <header className="flex items-center justify-between mb-5">
          <div>
            <p className="font-display text-xs tracking-[0.2em] uppercase text-[#E8A33D]">Kijkassistent</p>
            <h1 className="font-display text-2xl mt-0.5">Voor jou</h1>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-[#93A3B5] hover:text-[#F2EFE9] transition-colors px-3 py-2 rounded-full hover:bg-white/5"
          >
            <LogoutIcon className="w-4 h-4" />
          </button>
        </header>

        {/* Mode-slicer */}
        <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
          {(Object.keys(MODE_LABELS) as RecommendationMode[]).map((m) => {
            const active = mode === m
            return (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`flex-shrink-0 text-left px-4 py-2.5 rounded-2xl border transition-all touch-manipulation active:scale-[0.97] ${
                  active
                    ? 'border-[#E8A33D] bg-[#E8A33D]/10'
                    : 'border-[#2A3644] hover:border-[#3d4c60]'
                }`}
              >
                <p className={`text-sm font-semibold ${active ? 'text-[#E8A33D]' : 'text-[#F2EFE9]'}`}>
                  {MODE_LABELS[m].label}
                </p>
                <p className="text-[11px] text-[#93A3B5] mt-0.5 whitespace-nowrap">{MODE_LABELS[m].hint}</p>
              </button>
            )
          })}
        </div>

        <div className="flex items-center justify-between mb-5">
          <div className="flex gap-1 p-1 rounded-full bg-[#1A2330] border border-[#2A3644]">
            <button
              onClick={() => setTab('movie')}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all touch-manipulation ${
                tab === 'movie' ? 'bg-[#E8A33D] text-[#171F2B]' : 'text-[#93A3B5]'
              }`}
            >
              Films ({movieResults.length})
            </button>
            <button
              onClick={() => setTab('tv')}
              className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all touch-manipulation ${
                tab === 'tv' ? 'bg-[#E8A33D] text-[#171F2B]' : 'text-[#93A3B5]'
              }`}
            >
              Series ({tvResults.length})
            </button>
          </div>
          <button
            onClick={() => {
              loadRecommendations()
              loadTogetherRecommendations()
            }}
            disabled={loading}
            className="text-xs font-medium text-[#93A3B5] hover:text-[#F2EFE9] transition-colors disabled:opacity-50"
          >
            {loading ? 'Vernieuwen...' : 'Vernieuwen'}
          </button>
        </div>

        {mode === 'samen' && togetherError && (
          <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-4 py-3 mb-5">
            Samen-aanbevelingen laden mislukt: {togetherError}
          </p>
        )}

        {mode === 'samen' && togetherConnected === false && (
          <p className="text-[#93A3B5] border border-dashed border-[#2A3644] rounded-2xl px-4 py-6 mb-5 text-center">
            Je hebt nog geen partner gekoppeld.{' '}
            <a href="/settings" className="text-[#E8A33D] hover:text-[#F0B457] transition-colors">
              Koppel er een bij Instellingen
            </a>{' '}
            om samen aanbevelingen te zien.
          </p>
        )}

        {mode === 'samen' && togetherConnected && togetherTier === 'fallback' && visible.length > 0 && (
          <p className="text-sm text-[#93A3B5] border border-dashed border-[#2A3644] rounded-2xl px-4 py-3 mb-5">
            Nog geen titel gevonden die bij jullie allebei al in de aanbevelingen stond — dit
            zijn suggesties op basis van jullie gecombineerde genresmaak, iets minder zeker.
          </p>
        )}

        {showSkeleton && <PosterSkeletonGrid />}

        {!showSkeleton && visible.length === 0 && !(mode === 'samen' && togetherConnected === false) && (
          <p className="text-[#93A3B5] border border-dashed border-[#2A3644] rounded-2xl px-4 py-10 text-center leading-relaxed">
            {mode === 'samen'
              ? 'Nog geen gedeelde aanbevelingen gevonden. Voeg allebei favorieten/beoordelingen toe voor betere matches.'
              : tab === 'movie'
                ? 'Geen filmaanbevelingen gevonden op jouw streamingdiensten. Voeg favoriete films toe of pas je diensten aan.'
                : 'Geen serie-aanbevelingen gevonden op jouw streamingdiensten. Voeg favoriete series toe of pas je diensten aan.'}
          </p>
        )}

        {!showSkeleton && visible.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {visible.map((movie, i) => (
              <MovieCard
                key={`${movie.media_type}-${movie.id}`}
                movie={movie}
                priority={i < 4}
                onClick={() => {
                  selectedAtRef.current = Date.now()
                  setActionError(null)
                  setSelected(movie)
                }}
              />
            ))}
          </div>
        )}
      </main>

      <BottomNav />

      {selected && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 animate-fade-in"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full sm:max-w-md bg-[#1A2330] border border-[#2A3644] rounded-t-3xl sm:rounded-3xl max-h-[88vh] overflow-y-auto animate-sheet-up sm:animate-pop-in safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-[#3A4A5C]" />
            </div>

            <div className="p-6">
              <div className="flex gap-4 mb-4">
                {selected.poster_path ? (
                  <div className="relative w-24 aspect-[2/3] rounded-xl flex-shrink-0 shadow-lg overflow-hidden">
                    <Image
                      src={`https://image.tmdb.org/t/p/w200${selected.poster_path}`}
                      alt={selected.title}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-24 aspect-[2/3] rounded-xl bg-[#212C3B] flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <h2 className="font-display text-xl leading-tight">{selected.title}</h2>
                  <p className="text-sm text-[#93A3B5] mt-1.5">
                    {selected.media_type === 'tv' ? 'Serie' : 'Film'}
                  </p>
                  <span className="inline-block mt-2 rounded-full bg-[#E8A33D]/12 text-[#E8A33D] text-xs font-semibold px-2.5 py-1">
                    {selected.matchPercent}% match
                  </span>
                  {selected.watchOn && (
                    <span className="inline-block mt-2 ml-1.5 rounded-full bg-white/5 text-[#93A3B5] text-xs font-medium px-2.5 py-1">
                      {selected.watchOn}
                    </span>
                  )}
                </div>
              </div>

              {selected.overview && (
                <p className="text-sm text-[#F2EFE9]/90 leading-relaxed mb-4">{selected.overview}</p>
              )}

              {selected.basedOn && selected.basedOn.length > 0 && (
                <p className="text-sm text-[#93A3B5] mb-6">
                  Aanbevolen omdat je hield van: <span className="text-[#E8A33D]">{selected.basedOn.join(', ')}</span>
                </p>
              )}

              {actionError && (
                <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-3">
                  {actionError}
                </p>
              )}

              <button onClick={() => handleAddToWatchlist(selected)} className={`${btnPrimary} w-full mb-3`}>
                <PlusIcon className="w-4 h-4" />
                Op watchlist
              </button>

              {mode === 'samen' && (
                <p className="text-xs text-[#5E6D80] mb-2 text-center">
                  Dit geldt alleen voor Samen — jouw eigen aanbevelingen blijven ongewijzigd.
                </p>
              )}

              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleRate(selected, 'love')}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-[#2A3644] bg-[#1A2330] py-3 text-[#F2EFE9] transition-all active:scale-[0.97] touch-manipulation hover:border-[#E8A33D] hover:text-[#E8A33D]"
                >
                  <HeartIcon className="w-4 h-4" />
                  <span className="text-xs font-medium">{mode === 'samen' ? 'Zeker, samen' : 'Zeker'}</span>
                </button>
                <button
                  onClick={() => handleRate(selected, 'ok')}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-[#2A3644] bg-[#1A2330] py-3 text-[#F2EFE9] transition-all active:scale-[0.97] touch-manipulation hover:border-[#52A9A0] hover:text-[#52A9A0]"
                >
                  <OkIcon className="w-4 h-4" />
                  <span className="text-xs font-medium">{mode === 'samen' ? 'Oké, samen' : 'Was oké'}</span>
                </button>
                <button
                  onClick={() => handleRate(selected, 'dislike')}
                  className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-[#2A3644] bg-[#1A2330] py-3 text-[#F2EFE9] transition-all active:scale-[0.97] touch-manipulation hover:border-[#C97064] hover:text-[#C97064]"
                >
                  <DislikeIcon className="w-4 h-4" />
                  <span className="text-xs font-medium">{mode === 'samen' ? 'Niet voor ons' : 'Niet voor mij'}</span>
                </button>
              </div>

              <button
                onClick={() => setSelected(null)}
                className={`${btnGhost} w-full mt-3`}
              >
                <CloseIcon className="w-4 h-4" />
                Sluiten
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
