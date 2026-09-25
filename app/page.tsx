'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase, getCurrentUser, authFetch } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import BottomNav from './components/BottomNav'
import MovieCard from './components/MovieCard'
import LegalLinks from './components/LegalLinks'
import PartnerPicks from './components/PartnerPicks'
import DateNight from './components/DateNight'
import { DATENIGHT_ENABLED } from '@/lib/features'
import WeeklyTip from './components/WeeklyTip'
import { btnPrimary, btnSecondary, btnGhost } from './components/ui'
import { CloseIcon, HeartIcon, OkIcon, DislikeIcon, PlusIcon, StarIcon, LogoutIcon } from './components/Icons'

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
  genre_ids?: number[]
  // Titel die nog moet uitkomen: staat tussen de aanbevelingen met een "Binnenkort"-label.
  upcoming?: boolean
  release_date?: string
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

// Plekken (0-gebaseerd) waar titels die nog moeten uitkomen tussen de gewone aanbevelingen komen.
const UPCOMING_SLOTS = [2, 7, 12]

function interleaveUpcoming<T>(base: T[], upcoming: T[]): T[] {
  const out = [...base]
  upcoming.forEach((item, i) => out.splice(Math.min(UPCOMING_SLOTS[i] ?? out.length, out.length), 0, item))
  return out
}

function formatReleaseDate(iso?: string, long = false): string {
  if (!iso) return ''
  return new Date(`${iso}T12:00:00`).toLocaleDateString(
    'nl-NL',
    long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' }
  )
}

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

type TasteMatch = {
  score: number
  genrePercent: number
  storyPercent: number | null
  sharedGenres: string[]
  youMoreGenres: string[]
  partnerMoreGenres: string[]
  sharedTopTitles: number
}

function matchLabel(score: number): string {
  if (score >= 75) return 'Bijna dezelfde smaak'
  if (score >= 55) return 'Jullie passen goed bij elkaar'
  if (score >= 35) return 'Jullie smaken overlappen deels'
  return 'Jullie hebben elk een eigen smaak'
}

function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}`
}

function MatchBar({ label, percent }: { label: string; percent: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#93A3B5] w-16 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-[#212C3B] overflow-hidden">
        <div className="h-full rounded-full bg-[#E8A33D]" style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs text-[#93A3B5] w-9 text-right flex-shrink-0">{percent}%</span>
    </div>
  )
}

// Hoe vaak en hoe snel we vragen of de op de achtergrond samengestelde Samen-lijst klaar is.
const TOGETHER_POLL_MS = 8000
const TOGETHER_MAX_POLLS = 12

// Aantal beste Samen-titels waaruit de "tip van vanavond" wordt gekozen.
const TIP_POOL_SIZE = 5

// Sfeer voor de tip: welke TMDB-genres erbij horen. "alles" filtert niet.
const TIP_MOODS = [
  { id: 'alles', label: 'Alles', genres: null },
  { id: 'spannend', label: 'Spannend', genres: [53, 9648, 80, 28, 27, 10759] },
  { id: 'lachen', label: 'Lachen', genres: [35] },
  { id: 'ontspannen', label: 'Ontspannen', genres: [35, 10749, 10751, 16, 10402, 99] },
  { id: 'emotioneel', label: 'Emotioneel', genres: [18, 10749] },
] as const
type TipMood = (typeof TIP_MOODS)[number]['id']
// De sfeer kiest uit een ruimere groep dan de standaard tip, anders is er zelden een match.
const TIP_MOOD_SEARCH_DEPTH = 15
const NON_TITLE_LABELS = new Set(['vergelijkbare verhaallijn', 'verhaal dat bij jullie allebei past', 'wat jullie samen al waardeerden'])

// Vertaalt de "basedOn"-lijst van een Samen-titel (titels die jullie leuk vonden, plus een paar
// vaste labels) naar één leesbare zin waarom dit de tip is.
function explainTip(basedOn: string[] = []): string {
  const likedTitles = basedOn.filter((b) => !NON_TITLE_LABELS.has(b) && !b.startsWith('jullie gedeelde '))
  const shared = basedOn.find((b) => b.startsWith('jullie gedeelde '))
  const parts: string[] = []
  if (likedTitles.length > 0) parts.push(`Omdat jullie hielden van ${likedTitles.slice(0, 2).join(' en ')}.`)
  else if (shared) parts.push(`Op basis van ${shared}.`)
  if (basedOn.includes('verhaal dat bij jullie allebei past')) parts.push('Het verhaal past bij jullie allebei.')
  return parts.join(' ') || 'Past goed bij jullie allebei.'
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
  const [bookTitles, setBookTitles] = useState<Set<string>>(new Set())
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [tipSkips, setTipSkips] = useState(0)
  const [togetherComputing, setTogetherComputing] = useState(false)
  const [tipMood, setTipMood] = useState<TipMood>('alles')
  const [togetherMatch, setTogetherMatch] = useState<TasteMatch | null>(null)
  const requestIdRef = useRef(0)
  const togetherRequestIdRef = useRef(0)
  const togetherPollsRef = useRef(0)
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
    // De laadfuncties horen bewust niet in de dependencies: ze draaien één keer bij het openen van de pagina.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function loadRecommendations() {
    const requestId = ++requestIdRef.current
    setLoading(true)
    // Zonder try/catch bleef de knop bij een mislukte aanvraag (bv. de verbinding die
    // wordt afgebroken omdat de server te lang bezig was) voor altijd op "Vernieuwen..."
    // staan: de fout gooide loadRecommendations af zonder ooit setLoading(false) te
    // bereiken, en de oude (mogelijk verouderde, al-beoordeelde) lijst bleef zo permanent
    // zichtbaar in plaats van dat er een foutmelding kwam.
    let data: { focused?: Movie[]; balanced?: Movie[]; explore?: Movie[]; error?: string }
    let res: Response
    let userId: string
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setLoading(false)
        return
      }
      userId = session.user.id
      res = await fetch('/api/recommendations', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      data = await res.json()
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setLoading(false)
      setRefreshError(err instanceof Error ? err.message : 'Onbekende fout bij het ophalen van aanbevelingen')
      return
    }
    // Als er intussen een nieuwere aanvraag is gestart (bv. door snel na elkaar
    // te scoren), negeer dit oudere antwoord zodat het niet de verse staat overschrijft.
    if (requestId !== requestIdRef.current) return
    // Bij een fout (bv. te vaak vernieuwd) de bestaande lijst laten staan in plaats van
    // die te vervangen door een lege.
    if (!res.ok || data.error) {
      setLoading(false)
      setRefreshError(data.error || `Vernieuwen mislukt (status ${res.status})`)
      return
    }
    setRefreshError(null)
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
      saveCachedRecommendations(userId, merged)
      return merged
    })
  }

  // Los van loadRecommendations: "Samen" draait op een eigen endpoint (combineert twee
  // smaakprofielen) en heeft dus geen eigen resultaat-cache — een ontbrekende/verouderde
  // koppeling mag nooit de gewone drie tabbladen blokkeren of vertragen.
  // Terwijl de lijst op de achtergrond wordt samengesteld (eerste keer) of vernieuwd (na een
  // wijziging) vragen we rustig opnieuw, tot hij klaar is of we het genoeg geprobeerd hebben.
  function scheduleTogetherRefresh() {
    if (togetherPollsRef.current >= TOGETHER_MAX_POLLS) return
    togetherPollsRef.current += 1
    setTimeout(() => loadTogetherRecommendations(true), TOGETHER_POLL_MS)
  }

  async function loadTogetherRecommendations(isPoll = false) {
    if (!isPoll) togetherPollsRef.current = 0
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
      console.log('loadTogetherRecommendations: klaar', { connected: data.connected, tier: data.tier, items: (data.items || []).length, computing: data.computing, stale: data.stale })
      setTogetherError(null)
      if (data.computing) {
        // Eerste lijst is onderweg: nog niets om te tonen.
        setTogetherComputing(true)
        setTogetherConnected(true)
        setTogetherConnectionId(data.connectionId || null)
        scheduleTogetherRefresh()
        return
      }
      setTogetherComputing(false)
      if (data.stale) scheduleTogetherRefresh()
      setTogetherConnected(!!data.connected)
      setTogetherConnectionId(data.connectionId || null)
      setTogetherTier(data.tier || null)
      setTogetherMatch(data.match ?? null)
      setByMode((current) => ({ ...current, samen: data.items || [] }))
    } catch (err) {
      if (requestId !== togetherRequestIdRef.current) return
      console.error('Samen-aanbevelingen ophalen mislukt:', err)
      setTogetherError(err instanceof Error ? err.message : 'Onbekende fout bij het ophalen van Samen-aanbevelingen')
    }
  }

  // Los van de aanbevelingen zelf: het label verschijnt pas als het (gecachete) antwoord er
  // is, en een mislukte aanvraag laat de popup gewoon zonder label staan.
  function checkBookAdaptation(movie: Movie) {
    const key = `${movie.media_type}-${movie.id}`
    if (bookTitles.has(key)) return
    authFetch(`/api/is-book-adaptation?type=${movie.media_type}&id=${movie.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.isBookAdaptation) setBookTitles((current) => new Set(current).add(key))
      })
      .catch(() => {})
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

    // In Samen gaat "op de watchlist" naar de gezamenlijke lijst ("Onze lijst"), niet naar je eigen.
    if (mode === 'samen') {
      if (!togetherConnectionId) {
        setActionError('Geen actieve koppeling gevonden — herlaad de pagina en probeer opnieuw.')
        return
      }
      const { error: sharedError } = await supabase.from('couple_watchlist').insert({
        connection_id: togetherConnectionId,
        tmdb_id: movie.id,
        media_type: movie.media_type,
        title: movie.title,
        poster_path: movie.poster_path,
        watch_on: movie.watchOn ?? null,
        watch_url: movie.watchUrl ?? null,
        added_by: user.id,
      })
      // 23505 = staat er al op (bv. door je partner): dan is het doel al bereikt.
      if (sharedError && sharedError.code !== '23505') {
        console.error('Op gezamenlijke watchlist zetten mislukt:', sharedError)
        setActionError(`Kon niet op jullie lijst zetten: ${sharedError.message}`)
        return
      }
      removeFromSamen((m) => m.id === movie.id && m.media_type === movie.media_type)
      setSelected(null)
      return
    }

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

  // Zelfde als favoriet maken bij Zoeken: een favoriet is iets wat je al hebt gezien en
  // echt geweldig vond. Verdwijnt daarna uit de aanbevelingen, net als bij een beoordeling.
  async function handleFavorite(movie: Movie) {
    if (!user) return
    if (Date.now() - selectedAtRef.current < GHOST_TAP_GUARD_MS) return
    setActionError(null)
    const { error } = await supabase.from('favorite_movies').insert({
      user_id: user.id,
      tmdb_id: movie.id,
      title: movie.title,
      media_type: movie.media_type,
    })
    if (error) {
      console.error('Favoriet toevoegen mislukt:', error)
      setActionError(`Kon niet als favoriet opslaan: ${error.message}`)
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
        <LegalLinks className="mt-12" />
      </main>
    )
  }

  // Hoogste match% bovenaan, ongeacht de volgorde waarin de aanbevelingsengine ze
  // aanleverde (die mixt met opzet genres door elkaar voor variatie).
  const ordinary = movies.filter((m) => !m.upcoming)
  const movieResults = ordinary.filter((m) => m.media_type === 'movie').sort((a, b) => b.matchPercent - a.matchPercent)
  const tvResults = ordinary.filter((m) => m.media_type === 'tv').sort((a, b) => b.matchPercent - a.matchPercent)
  // Titels die nog moeten uitkomen tellen niet mee in Films (x) / Series (x) en komen tussen de rest.
  const upcomingOfTab = movies.filter((m) => m.upcoming && m.media_type === tab).sort((a, b) => b.matchPercent - a.matchPercent)
  const visible = interleaveUpcoming(tab === 'movie' ? movieResults : tvResults, upcomingOfTab)
  const showSkeleton = loading && movies.length === 0

  // "Tip van vanavond": de beste Samen-titels, en per dag een andere daaruit. De dag en het
  // koppel bepalen het startpunt, dus jullie zien allebei dezelfde tip; "Andere tip" schuift door.
  const rankedForTab = byMode.samen.filter((m) => m.media_type === tab && !m.upcoming).sort((a, b) => b.matchPercent - a.matchPercent)
  const moodGenres = TIP_MOODS.find((m) => m.id === tipMood)?.genres ?? null
  const tipPool = moodGenres
    ? rankedForTab
        .slice(0, TIP_MOOD_SEARCH_DEPTH)
        .filter((m) => (m.genre_ids ?? []).some((g) => (moodGenres as readonly number[]).includes(g)))
        .slice(0, TIP_POOL_SIZE)
    : rankedForTab.slice(0, TIP_POOL_SIZE)
  const localDay = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000)
  const connectionSeed = (togetherConnectionId ?? '').split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  const tipItem = tipPool.length > 0 ? tipPool[(localDay + connectionSeed + tipSkips) % tipPool.length] : null

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

        {DATENIGHT_ENABLED && user && <DateNight showIdle={mode === 'samen'} />}

        {/* Mode-slicer */}
        <div className="flex gap-2 mb-5 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1 [@media(pointer:fine)]:flex-wrap">
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

        {refreshError && (
          <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-4 py-3 mb-5">
            {refreshError}
          </p>
        )}

        {/* De tip van de week staat alleen bij "Verras me": een populaire titel buiten je eigen lijst past daar
            het best. Bij Samen staat de eigen "tip van vanavond". */}
        {mode === 'explore' && (
          <WeeklyTip
            mediaType={tab}
            onRemoved={(id, type) => removeEverywhere((m) => m.id === id && m.media_type === type)}
          />
        )}

        {mode === 'samen' && togetherComputing && byMode.samen.length === 0 && (
          <p className="text-[#93A3B5] border border-dashed border-[#2A3644] rounded-2xl px-4 py-6 mb-5 text-center leading-relaxed">
            Jullie Samen-lijst wordt op de achtergrond samengesteld. Dat duurt de eerste keer even, meestal een minuutje.
            Je hoeft niets te doen: hij verschijnt vanzelf.
          </p>
        )}

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

        {mode === 'samen' && togetherConnected && rankedForTab.length > 0 && (
          <div className="rounded-2xl border border-[#E8A33D]/40 bg-[#E8A33D]/5 p-4 mb-5">
            <p className="font-display text-xs tracking-[0.2em] uppercase text-[#E8A33D] mb-3">
              {tab === 'movie' ? 'Filmtip' : 'Serietip'} van vanavond
            </p>
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 mb-4 [@media(pointer:fine)]:flex-wrap">
              {TIP_MOODS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    setTipMood(m.id)
                    setTipSkips(0)
                  }}
                  className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors touch-manipulation ${
                    tipMood === m.id
                      ? 'border-[#E8A33D] bg-[#E8A33D]/15 text-[#E8A33D]'
                      : 'border-[#2A3644] text-[#93A3B5] hover:border-[#3d4c60]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {!tipItem && (
              <p className="text-sm text-[#93A3B5] leading-relaxed">
                Geen {TIP_MOODS.find((m) => m.id === tipMood)?.label.toLowerCase()} titel gevonden in jullie beste{' '}
                {tab === 'movie' ? 'films' : 'series'}. Probeer een andere sfeer.
              </p>
            )}

            {tipItem && (
              <>
                <button
                  onClick={() => {
                    selectedAtRef.current = Date.now()
                    setActionError(null)
                    setSelected(tipItem)
                    checkBookAdaptation(tipItem)
                  }}
                  className="flex gap-4 w-full text-left touch-manipulation"
                >
                  {tipItem.poster_path ? (
                    <div className="relative w-24 aspect-[2/3] rounded-xl flex-shrink-0 overflow-hidden shadow-lg">
                      <Image
                        src={`https://image.tmdb.org/t/p/w342${tipItem.poster_path}`}
                        alt={tipItem.title}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-24 aspect-[2/3] rounded-xl bg-[#212C3B] flex-shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block font-display text-xl leading-tight">{tipItem.title}</span>
                    <span className="block text-sm text-[#93A3B5] mt-1">
                      {tipItem.media_type === 'tv' ? 'Serie' : 'Film'}
                      {tipItem.watchOn ? ` · ${tipItem.watchOn}` : ''}
                    </span>
                    <span className="block text-sm text-[#F2EFE9]/85 mt-2 leading-relaxed">{explainTip(tipItem.basedOn)}</span>
                  </span>
                </button>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => handleAddToWatchlist(tipItem)} className={`${btnPrimary} flex-1`}>
                    <PlusIcon className="w-4 h-4" />
                    Dit gaan we kijken
                  </button>
                  {tipPool.length > 1 && (
                    <button onClick={() => setTipSkips((n) => n + 1)} className={btnGhost}>
                      Andere tip
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {mode === 'samen' && togetherConnected && togetherMatch && (
          <div className="rounded-2xl border border-[#2A3644] bg-[#1A2330] p-4 mb-5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-medium">Jullie smaakmatch</p>
              <p className="font-display text-3xl text-[#E8A33D] leading-none">{togetherMatch.score}%</p>
            </div>
            <p className="text-sm text-[#93A3B5] mt-1">{matchLabel(togetherMatch.score)}</p>
            <div className="flex flex-col gap-2 mt-4">
              <MatchBar label="Genres" percent={togetherMatch.genrePercent} />
              {togetherMatch.storyPercent !== null && <MatchBar label="Verhalen" percent={togetherMatch.storyPercent} />}
            </div>
            <div className="mt-4 flex flex-col gap-1.5 text-sm text-[#F2EFE9]/85 leading-relaxed">
              {togetherMatch.sharedGenres.length > 0 && (
                <p>Jullie delen je liefde voor {joinNames(togetherMatch.sharedGenres).toLowerCase()}.</p>
              )}
              {(togetherMatch.youMoreGenres.length > 0 || togetherMatch.partnerMoreGenres.length > 0) && (
                <p className="text-[#93A3B5]">
                  {togetherMatch.youMoreGenres.length > 0 && `Jij houdt meer van ${joinNames(togetherMatch.youMoreGenres).toLowerCase()}`}
                  {togetherMatch.youMoreGenres.length > 0 && togetherMatch.partnerMoreGenres.length > 0 && ', '}
                  {togetherMatch.partnerMoreGenres.length > 0 &&
                    `${togetherMatch.youMoreGenres.length > 0 ? 'je partner' : 'Je partner'} meer van ${joinNames(togetherMatch.partnerMoreGenres).toLowerCase()}`}
                  .
                </p>
              )}
              {togetherMatch.sharedTopTitles > 0 && (
                <p className="text-[#93A3B5]">
                  {togetherMatch.sharedTopTitles} {togetherMatch.sharedTopTitles === 1 ? 'titel staat' : 'titels staan'} bij jullie allebei bovenaan.
                </p>
              )}
            </div>
          </div>
        )}

        {mode === 'samen' && togetherConnected && <PartnerPicks mediaType={tab} />}

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
                movie={movie.upcoming ? { ...movie, watchOn: movie.media_type === 'tv' ? 'Nieuwe serie' : 'In de bioscoop' } : movie}
                upcomingLabel={movie.upcoming ? `Binnenkort · ${formatReleaseDate(movie.release_date)}` : undefined}
                priority={i < 4}
                onClick={() => {
                  selectedAtRef.current = Date.now()
                  setActionError(null)
                  setSelected(movie)
                  checkBookAdaptation(movie)
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
                  {selected.upcoming ? (
                    <span className="inline-block mt-2 rounded-full bg-[#52A9A0]/12 text-[#52A9A0] text-xs font-semibold px-2.5 py-1">
                      Binnenkort
                    </span>
                  ) : (
                    <span className="inline-block mt-2 rounded-full bg-[#E8A33D]/12 text-[#E8A33D] text-xs font-semibold px-2.5 py-1">
                      {selected.matchPercent}% match
                    </span>
                  )}
                  {bookTitles.has(`${selected.media_type}-${selected.id}`) && (
                    <span className="inline-block mt-2 ml-1.5 rounded-full bg-[#52A9A0]/12 text-[#52A9A0] text-xs font-medium px-2.5 py-1">
                      Gebaseerd op een boek
                    </span>
                  )}
                  {selected.vote_average > 0 && (
                    <span className="inline-block mt-2 ml-1.5 rounded-full bg-white/5 text-[#93A3B5] text-xs font-medium px-2.5 py-1">
                      ★ {selected.vote_average.toFixed(1)} TMDB
                    </span>
                  )}
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

              {selected.upcoming && (
                <p className="text-sm text-[#52A9A0] mb-6">
                  {selected.media_type === 'tv'
                    ? `Eerste aflevering op ${formatReleaseDate(selected.release_date, true)}.`
                    : `Verschijnt op ${formatReleaseDate(selected.release_date, true)} in de bioscoop.`}{' '}
                  Nog niet te kijken, dus zet hem op je lijst om hem niet te missen.
                </p>
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

              <div className={`grid gap-2 mb-3 ${mode === 'samen' || selected.upcoming ? 'grid-cols-1' : 'grid-cols-2'}`}>
                <button onClick={() => handleAddToWatchlist(selected)} className={btnPrimary}>
                  <PlusIcon className="w-4 h-4" />
                  {mode === 'samen' ? 'Op onze lijst' : 'Op watchlist'}
                </button>
                {/* Favoriet is persoonlijk; in Samen beoordeel je als koppel, dus daar niet. */}
                {mode !== 'samen' && !selected.upcoming && (
                  <button onClick={() => handleFavorite(selected)} className={btnSecondary}>
                    <StarIcon className="w-4 h-4" />
                    Favoriet
                  </button>
                )}
              </div>

              {mode === 'samen' && !selected.upcoming && (
                <p className="text-xs text-[#5E6D80] mb-2 text-center">
                  Dit geldt alleen voor Samen — jouw eigen aanbevelingen blijven ongewijzigd.
                </p>
              )}

              {/* Beoordelen kan pas als je hem gezien hebt, dus niet bij titels die nog moeten uitkomen. */}
              {!selected.upcoming && (
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
              )}

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
