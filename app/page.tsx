'use client'

import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

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
    // veld) niet crasht op een undefined array.
    return { ...EMPTY_RESULTS, ...JSON.parse(raw) }
  } catch {
    return null
  }
}

function saveCachedRecommendations(userId: string, data: Record<RecommendationMode, Movie[]>) {
  try {
    localStorage.setItem(RECOMMENDATIONS_CACHE_KEY_PREFIX + userId, JSON.stringify(data))
  } catch {
    // Privénavigatie of volle quota — dan cachen we gewoon niet, geen probleem.
  }
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [byMode, setByMode] = useState<Record<RecommendationMode, Movie[]>>(EMPTY_RESULTS)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'movie' | 'tv'>('movie')
  const [selected, setSelected] = useState<Movie | null>(null)
  const [mode, setMode] = useState<RecommendationMode>('balanced')
  const [togetherConnected, setTogetherConnected] = useState<boolean | null>(null)
  const [togetherTier, setTogetherTier] = useState<TogetherTier | null>(null)
  const [togetherError, setTogetherError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const togetherRequestIdRef = useRef(0)
  const selectedAtRef = useRef(0)
  // Mobiele browsers wachten na een tik nog ~300ms af of het een dubbele tik (zoom)
  // wordt. Tikt iemand snel twee keer op dezelfde plek, dan opent de eerste tik deze
  // popup en landt de tweede op de knop die daar nu staat. Deze guard negeert taps op
  // de actieknoppen vlak na het openen, zodat zo'n ghost-tap niet meteen een actie triggert.
  const GHOST_TAP_GUARD_MS = 400

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) {
        const cached = loadCachedRecommendations(data.user.id)
        if (cached) {
          setByMode(cached)
          setLoading(false)
        }
        loadRecommendations()
        loadTogetherRecommendations()
      } else {
        setLoading(false)
      }
    })
  }, [])

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

  async function handleAddToWatchlist(movie: Movie) {
    if (!user) return
    if (Date.now() - selectedAtRef.current < GHOST_TAP_GUARD_MS) return
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
    if (!error) {
      removeEverywhere((m) => m.id === movie.id && m.media_type === movie.media_type)
      setSelected(null)
    }
  }

  async function handleRate(movie: Movie, rating: 'dislike' | 'ok' | 'love') {
    if (!user) return
    if (Date.now() - selectedAtRef.current < GHOST_TAP_GUARD_MS) return
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
      return
    }
    removeEverywhere((m) => m.id === movie.id && m.media_type === movie.media_type)
    setSelected(null)
    // Je score telt mee in de aanbevelingen voor andere films; op de achtergrond
    // verversen zodat dat effect zichtbaar wordt zonder dat je zelf hoeft te vernieuwen.
    loadRecommendations()
    if (togetherConnected) loadTogetherRecommendations()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
  }

  const movies = byMode[mode]

  if (loading && movies.length === 0) {
    return (
      <p className="p-8 text-[#9FB0C2]">
        Laden... de allereerste keer (of na nieuwe favorieten/beoordelingen) duurt dit door alle TMDB-opzoekingen wat langer, daarna gaat het sneller.
      </p>
    )
  }

  if (!user) {
    return (
      <main className="max-w-md mx-auto px-6 py-16">
        <h1 className="font-display text-3xl mb-2">Kijkassistent</h1>
        <p className="text-[#9FB0C2] mb-6">
          Persoonlijke films- en series-aanbevelingen, op basis van wat jij mooi vindt.
        </p>
        <a
          href="/login"
          className="inline-block bg-[#E8A33D] text-[#171F2B] px-5 py-2.5 rounded-sm font-medium hover:bg-[#F0B457] transition-colors"
        >
          Log in of registreer
        </a>
      </main>
    )
  }

  const movieResults = movies.filter((m) => m.media_type === 'movie')
  const tvResults = movies.filter((m) => m.media_type === 'tv')
  const visible = tab === 'movie' ? movieResults : tvResults

  return (
    <main className="max-w-xl mx-auto px-6 py-10">
      <header className="flex items-baseline justify-between mb-1">
        <h1 className="font-display text-2xl">Voor jou</h1>
        <button onClick={handleLogout} className="text-sm text-[#9FB0C2] hover:text-[#F2EFE9] transition-colors">
          Uitloggen
        </button>
      </header>
      <p className="text-[#9FB0C2] mb-6">Wat bij jouw smaak past, nu te zien</p>

      <nav className="flex gap-4 mb-6 text-sm items-center">
        <a href="/onboarding" className="text-[#E8A33D] hover:text-[#F0B457] transition-colors">
          Favorieten en beoordelingen
        </a>
        <a href="/watchlist" className="text-[#E8A33D] hover:text-[#F0B457] transition-colors">
          Watchlist
        </a>
        <a href="/settings" className="text-[#E8A33D] hover:text-[#F0B457] transition-colors">
          Instellingen
        </a>
        <button
          onClick={() => {
            loadRecommendations()
            loadTogetherRecommendations()
          }}
          disabled={loading}
          className="ml-auto text-sm text-[#9FB0C2] hover:text-[#F2EFE9] transition-colors disabled:opacity-50"
        >
          {loading ? 'Vernieuwen...' : 'Vernieuw aanbevelingen'}
        </button>
      </nav>

      {/* Mode-slicer, ticket-stub stijl */}
      <div className="flex gap-3 mb-8">
        {(Object.keys(MODE_LABELS) as RecommendationMode[]).map((m) => {
          const active = mode === m
          return (
            <button
              key={m}
              onClick={() => handleModeChange(m)}
              className={`flex-1 text-left px-3 py-2.5 rounded-sm border transition-colors ${
                active
                  ? 'border-[#E8A33D] bg-[#E8A33D]/10'
                  : 'border-dashed border-[#3A4A5C] hover:border-[#9FB0C2]'
              }`}
              style={{
                borderStyle: active ? 'solid' : 'dashed',
              }}
            >
              <p className={`text-sm font-medium ${active ? 'text-[#E8A33D]' : 'text-[#F2EFE9]'}`}>
                {MODE_LABELS[m].label}
              </p>
              <p className="text-xs text-[#9FB0C2] mt-0.5">{MODE_LABELS[m].hint}</p>
            </button>
          )
        })}
      </div>

      {/* Tijdelijke debug-regel om te zien of byMode.samen daadwerkelijk gevuld is bij
          deze render, i.p.v. te moeten gokken op eventueel verouderde console-logs. */}
      <p className="text-xs text-[#6B7A8C] mb-2">
        debug: mode={mode} · samen={byMode.samen.length} · connected={String(togetherConnected)} · tier={togetherTier ?? 'null'}
      </p>

      <div className="flex border-b border-[#3A4A5C] mb-6">
        <button
          onClick={() => setTab('movie')}
          className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
            tab === 'movie' ? 'border-[#E8A33D] text-[#E8A33D]' : 'border-transparent text-[#9FB0C2] hover:text-[#F2EFE9]'
          }`}
        >
          Films ({movieResults.length})
        </button>
        <button
          onClick={() => setTab('tv')}
          className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
            tab === 'tv' ? 'border-[#E8A33D] text-[#E8A33D]' : 'border-transparent text-[#9FB0C2] hover:text-[#F2EFE9]'
          }`}
        >
          Series ({tvResults.length})
        </button>
      </div>

      {loading && (
        <p className="text-sm text-[#9FB0C2] mb-4">Nieuwe aanbevelingen laden...</p>
      )}

      {mode === 'samen' && togetherError && (
        <p className="text-sm text-[#C97064] border border-[#C97064] rounded-sm px-3 py-2 mb-4">
          Samen-aanbevelingen laden mislukt: {togetherError}
        </p>
      )}

      {mode === 'samen' && togetherConnected === false && (
        <p className="text-[#9FB0C2] border border-dashed border-[#3A4A5C] rounded-sm px-4 py-6 mb-4">
          Je hebt nog geen partner gekoppeld.{' '}
          <a href="/settings" className="text-[#E8A33D] hover:text-[#F0B457] transition-colors">
            Koppel er een bij Instellingen
          </a>{' '}
          om samen aanbevelingen te zien.
        </p>
      )}

      {mode === 'samen' && togetherConnected && togetherTier === 'fallback' && visible.length > 0 && (
        <p className="text-sm text-[#9FB0C2] border border-dashed border-[#3A4A5C] rounded-sm px-4 py-3 mb-4">
          Nog geen titel gevonden die bij jullie allebei al in de aanbevelingen stond — dit
          zijn suggesties op basis van jullie gecombineerde genresmaak, iets minder zeker.
        </p>
      )}

      {!loading && visible.length === 0 && !(mode === 'samen' && togetherConnected === false) && (
        <p className="text-[#9FB0C2] border border-dashed border-[#3A4A5C] rounded-sm px-4 py-6">
          {mode === 'samen'
            ? 'Nog geen gedeelde aanbevelingen gevonden. Voeg allebei favorieten/beoordelingen toe voor betere matches.'
            : tab === 'movie'
              ? 'Geen filmaanbevelingen gevonden op jouw streamingdiensten. Voeg favoriete films toe of pas je diensten aan.'
              : 'Geen serie-aanbevelingen gevonden op jouw streamingdiensten. Voeg favoriete series toe of pas je diensten aan.'}
        </p>
      )}

      <div className="flex flex-col">
        {visible.map((movie, i) => (
          <div
            key={`${movie.media_type}-${movie.id}`}
            className={`flex gap-4 py-4 ${i !== visible.length - 1 ? 'border-b border-dashed border-[#3A4A5C]' : ''}`}
          >
            <button
              onClick={() => {
                selectedAtRef.current = Date.now()
                setSelected(movie)
              }}
              className="flex gap-4 flex-1 text-left min-w-0 touch-manipulation"
            >
              {movie.poster_path && (
                <img
                  src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`}
                  alt={movie.title}
                  className="w-16 rounded-sm flex-shrink-0"
                />
              )}
              <div className="min-w-0">
                <p className="font-medium hover:text-[#E8A33D] transition-colors">{movie.title}</p>
                <p className="text-sm text-[#9FB0C2] mt-0.5">
                  {movie.matchPercent}% match
                  {movie.watchOn && <span className="text-[#E8A33D]"> · {movie.watchOn}</span>}
                </p>
              </div>
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-[#1F2937] border border-[#3A4A5C] rounded-sm max-w-md w-full p-6 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex gap-4 mb-4">
              {selected.poster_path && (
                <img
                  src={`https://image.tmdb.org/t/p/w200${selected.poster_path}`}
                  alt={selected.title}
                  className="w-20 rounded-sm flex-shrink-0"
                />
              )}
              <div>
                <h2 className="font-display text-xl">{selected.title}</h2>
                <p className="text-sm text-[#9FB0C2] mt-1">
                  {selected.media_type === 'tv' ? 'Serie' : 'Film'} · {selected.matchPercent}% match
                  {selected.watchOn && <span className="text-[#E8A33D]"> · {selected.watchOn}</span>}
                </p>
              </div>
            </div>

            {selected.overview && (
              <p className="text-sm text-[#F2EFE9] leading-relaxed mb-4">{selected.overview}</p>
            )}

            {selected.basedOn && selected.basedOn.length > 0 && (
              <p className="text-sm text-[#9FB0C2] mb-6">
                Aanbevolen omdat je hield van: <span className="text-[#E8A33D]">{selected.basedOn.join(', ')}</span>
              </p>
            )}

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleAddToWatchlist(selected)}
                className="text-sm bg-[#E8A33D] text-[#171F2B] rounded-sm px-3 py-1.5 hover:bg-[#F0B457] transition-colors font-medium touch-manipulation"
              >
                Op watchlist
              </button>
              <button
                onClick={() => handleRate(selected, 'love')}
                className="text-sm border border-[#3A4A5C] rounded-sm px-3 py-1.5 hover:border-[#E8A33D] hover:text-[#E8A33D] transition-colors touch-manipulation"
              >
                Zeker meer zoals dit
              </button>
              <button
                onClick={() => handleRate(selected, 'ok')}
                className="text-sm border border-[#3A4A5C] rounded-sm px-3 py-1.5 hover:border-[#52A9A0] hover:text-[#52A9A0] transition-colors touch-manipulation"
              >
                Was oké
              </button>
              <button
                onClick={() => handleRate(selected, 'dislike')}
                className="text-sm border border-[#3A4A5C] rounded-sm px-3 py-1.5 hover:border-[#C97064] hover:text-[#C97064] transition-colors touch-manipulation"
              >
                Niet voor mij
              </button>
            </div>

            <button
              onClick={() => setSelected(null)}
              className="text-sm text-[#9FB0C2] hover:text-[#F2EFE9] transition-colors mt-4"
            >
              Sluiten
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
