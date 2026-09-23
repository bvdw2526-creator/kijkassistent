'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase, getCurrentUser, authFetch } from '@/lib/supabase'
import TitleInfoSheet, { type TitleInfoItem } from './TitleInfoSheet'
import { btnPrimary, btnSecondary, card, chip } from './ui'
import { PlusIcon, CheckIcon } from './Icons'

type UpcomingItem = { id: number; title: string; poster_path: string | null; release_date?: string; media_type: 'movie' | 'tv' }

function formatReleaseDate(date?: string): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

// Aankomende films en series die nog moeten uitkomen: je hebt ze nog niet kunnen zien, dus de
// enige zinnige actie is "op watchlist" — geen favoriet of beoordeling, zoals bij de rest van Zoeken.
export default function UpcomingList() {
  const [type, setType] = useState<'movie' | 'tv'>('movie')
  const [results, setResults] = useState<UpcomingItem[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [watchlistKeys, setWatchlistKeys] = useState<Set<string>>(new Set())
  const [infoItem, setInfoItem] = useState<TitleInfoItem | null>(null)
  const requestRef = useRef(0)

  async function loadWatchlistKeys() {
    const user = await getCurrentUser()
    if (!user) return
    const { data } = await supabase.from('watchlist').select('tmdb_id, media_type').eq('user_id', user.id)
    if (data) setWatchlistKeys(new Set(data.map((w) => `${w.media_type}-${w.tmdb_id}`)))
  }

  async function load(nextType: 'movie' | 'tv', nextPage: number) {
    const requestId = ++requestRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`/api/upcoming?type=${nextType}&page=${nextPage}`)
      const data = await res.json()
      if (requestId !== requestRef.current) return
      if (!res.ok || data.error) {
        setError(data.error || 'Aankomende titels laden mislukt')
        setLoading(false)
        return
      }
      setResults((current) => (nextPage === 1 ? data.results : [...current, ...data.results]))
      setPage(data.page)
      setTotalPages(data.totalPages)
    } catch (err) {
      if (requestId !== requestRef.current) return
      setError(err instanceof Error ? err.message : 'Aankomende titels laden mislukt')
    }
    setLoading(false)
  }

  useEffect(() => {
    loadWatchlistKeys()
    load('movie', 1)
  }, [])

  function changeType(nextType: 'movie' | 'tv') {
    setType(nextType)
    setResults([])
    load(nextType, 1)
  }

  async function addToWatchlist(item: { id: number; title: string; media_type: 'movie' | 'tv'; poster_path?: string | null }) {
    const key = `${item.media_type}-${item.id}`
    if (watchlistKeys.has(key)) return
    const user = await getCurrentUser()
    if (!user) return
    const { error: insertError } = await supabase.from('watchlist').insert({
      user_id: user.id,
      tmdb_id: item.id,
      title: item.title,
      poster_path: item.poster_path ?? null,
      media_type: item.media_type,
    })
    if (!insertError) setWatchlistKeys((current) => new Set(current).add(key))
  }

  return (
    <div>
      <p className="text-[#93A3B5] mb-4 leading-relaxed">
        {type === 'movie'
          ? 'Films die de komende maanden in Nederland uitkomen, de populairste eerst.'
          : 'Nieuwe series die de komende maanden voor het eerst uitzenden, de populairste eerst. Een nieuw seizoen van een serie die je al kent, staat hier niet bij.'}
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        <button onClick={() => changeType('movie')} className={chip(type === 'movie', 'accent', 'sm')}>Films</button>
        <button onClick={() => changeType('tv')} className={chip(type === 'tv', 'accent', 'sm')}>Series</button>
      </div>

      {error && (
        <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-4">{error}</p>
      )}
      {loading && results.length === 0 && <p className="text-[#93A3B5] text-sm">Laden...</p>}
      {!loading && !error && results.length === 0 && <p className="text-[#93A3B5] text-sm">Niets gevonden.</p>}

      {results.length > 0 && (
        <div className="flex flex-col gap-2 mb-4">
          {results.map((item) => {
            const key = `${item.media_type}-${item.id}`
            const added = watchlistKeys.has(key)
            return (
              <div key={key} className={`${card} p-3`}>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setInfoItem(item)}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left touch-manipulation"
                  >
                    {item.poster_path ? (
                      <div className="relative w-11 aspect-[2/3] rounded-lg flex-shrink-0 overflow-hidden">
                        <Image src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={item.title} fill sizes="44px" className="object-cover" />
                      </div>
                    ) : (
                      <div className="w-11 aspect-[2/3] rounded-lg bg-[#212C3B] flex-shrink-0" />
                    )}
                    <span className="flex-1 text-sm min-w-0">
                      <span className="block font-medium truncate">{item.title}</span>
                      <span className="text-xs text-[#93A3B5]">
                        {formatReleaseDate(item.release_date)} · {item.media_type === 'tv' ? 'Serie' : 'Film'}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => addToWatchlist(item)}
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

      {page < totalPages && results.length > 0 && (
        <button onClick={() => load(type, page + 1)} disabled={loading} className={`${btnSecondary} w-full mb-6`}>
          {loading ? 'Laden...' : 'Meer laden'}
        </button>
      )}

      {infoItem && (
        <TitleInfoSheet item={infoItem} onClose={() => setInfoItem(null)}>
          {(details) => (
            <button
              onClick={() => addToWatchlist({ ...infoItem, poster_path: details?.posterPath ?? infoItem.poster_path ?? null })}
              className={`${btnPrimary} w-full mb-3`}
            >
              {watchlistKeys.has(`${infoItem.media_type}-${infoItem.id}`) ? <CheckIcon className="w-4 h-4" /> : <PlusIcon className="w-4 h-4" />}
              Op watchlist
            </button>
          )}
        </TitleInfoSheet>
      )}
    </div>
  )
}
