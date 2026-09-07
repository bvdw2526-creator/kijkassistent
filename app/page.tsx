'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

type Movie = {
  id: number
  title: string
  poster_path: string | null
  vote_average: number
  score: number
  watchOn?: string
  watchUrl?: string
  media_type: 'movie' | 'tv'
  overview?: string
  basedOn?: string[]
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [movies, setMovies] = useState<Movie[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'movie' | 'tv'>('movie')
  const [selected, setSelected] = useState<Movie | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      if (data.user) loadRecommendations()
      else setLoading(false)
    })
  }, [])

  async function loadRecommendations() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch('/api/recommendations', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    const data = await res.json()
    setMovies(data.results || [])
    setLoading(false)
  }

  async function handleAddToWatchlist(movie: Movie) {
    if (!user) return
    const { error } = await supabase.from('watchlist').insert({
      user_id: user.id,
      tmdb_id: movie.id,
      title: movie.title,
      poster_path: movie.poster_path,
      media_type: movie.media_type,
    })
    if (!error) {
      setMovies((current) => current.filter((m) => m.id !== movie.id))
      setSelected(null)
    }
  }

  async function handleRate(movie: Movie, rating: 'dislike' | 'ok' | 'love') {
    if (!user) return
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
    if (!error) {
      setMovies((current) => current.filter((m) => m.id !== movie.id))
      setSelected(null)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
  }

  if (loading) return <p className="p-8 text-[#9FB0C2]">Laden...</p>

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

      <nav className="flex gap-4 mb-6 text-sm">
        <a href="/onboarding" className="text-[#E8A33D] hover:text-[#F0B457] transition-colors">
          Favorieten toevoegen
        </a>
        <a href="/watchlist" className="text-[#E8A33D] hover:text-[#F0B457] transition-colors">
          Watchlist
        </a>
        <a href="/settings" className="text-[#E8A33D] hover:text-[#F0B457] transition-colors">
          Streamingdiensten
        </a>
      </nav>

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

      {visible.length === 0 && (
        <p className="text-[#9FB0C2] border border-dashed border-[#3A4A5C] rounded-sm px-4 py-6">
          {tab === 'movie'
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
            <button onClick={() => setSelected(movie)} className="flex gap-4 flex-1 text-left min-w-0">
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
                  Match {movie.score}x
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
                  {selected.media_type === 'tv' ? 'Serie' : 'Film'}
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
                className="text-sm bg-[#E8A33D] text-[#171F2B] rounded-sm px-3 py-1.5 hover:bg-[#F0B457] transition-colors font-medium"
              >
                Op watchlist
              </button>
              <button
                onClick={() => handleRate(selected, 'love')}
                className="text-sm border border-[#3A4A5C] rounded-sm px-3 py-1.5 hover:border-[#E8A33D] hover:text-[#E8A33D] transition-colors"
              >
                Zeker meer zoals dit
              </button>
              <button
                onClick={() => handleRate(selected, 'ok')}
                className="text-sm border border-[#3A4A5C] rounded-sm px-3 py-1.5 hover:border-[#52A9A0] hover:text-[#52A9A0] transition-colors"
              >
                Was oké
              </button>
              <button
                onClick={() => handleRate(selected, 'dislike')}
                className="text-sm border border-[#3A4A5C] rounded-sm px-3 py-1.5 hover:border-[#C97064] hover:text-[#C97064] transition-colors"
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