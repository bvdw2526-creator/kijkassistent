'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import BottomNav from '../components/BottomNav'
import { card, chip } from '../components/ui'
import { TrashIcon, HeartIcon, OkIcon, DislikeIcon } from '../components/Icons'

type RecommendationMode = 'focused' | 'balanced' | 'explore' | 'samen'

type WatchlistItem = {
  id: number
  title: string
  poster_path: string | null
  media_type: 'movie' | 'tv'
  watchOn: string | null
  watchUrl: string | null
  sourceMode: RecommendationMode | null
}

// Zelfde labels als op de aanbevelingenpagina (app/page.tsx) — hier alleen als platte
// tekst getoond, geen tabblad-navigatie nodig.
const MODE_LABELS: Record<RecommendationMode, string> = {
  focused: 'Puur mijn smaak',
  balanced: 'Mijn smaak, breder',
  explore: 'Verras me',
  samen: 'Samen',
}

export default function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'movie' | 'tv'>('movie')
  const [error, setError] = useState<string | null>(null)

  async function loadWatchlist() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('watchlist')
      .select('tmdb_id, title, poster_path, media_type, watch_on, watch_url, source_mode')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false })

    if (data) {
      setItems(
        data.map((w) => ({
          id: w.tmdb_id,
          title: w.title,
          poster_path: w.poster_path,
          media_type: w.media_type as 'movie' | 'tv',
          watchOn: w.watch_on,
          watchUrl: w.watch_url,
          sourceMode: w.source_mode as RecommendationMode | null,
        }))
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    loadWatchlist()
  }, [])

  async function handleRate(item: WatchlistItem, rating: 'dislike' | 'ok' | 'love') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setError(null)

    const { data: ratingRow, error: ratingError } = await supabase
      .from('ratings')
      .upsert(
        {
          user_id: user.id,
          tmdb_id: item.id,
          title: item.title,
          rating,
          media_type: item.media_type,
        },
        { onConflict: 'user_id,tmdb_id,media_type' }
      )
      .select()

    if (ratingError) {
      console.error('Rating opslaan mislukt:', ratingError)
      setError(`Kon de rating niet opslaan: ${ratingError.message}`)
      return
    }
    if (!ratingRow || ratingRow.length === 0) {
      setError('De rating leek opgeslagen, maar er kwam geen rij terug — waarschijnlijk ontbreekt een UPDATE-policy op de "ratings"-tabel in Supabase (RLS).')
      return
    }

    // .select() erbij zodat een door RLS stilzwijgend genegeerde delete (0 rijen, geen
    // "error") niet ten onrechte als gelukt wordt behandeld — anders staat het item na
    // een refresh gewoon weer op de watchlist.
    const { data: deletedRow, error: deleteError } = await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', user.id)
      .eq('tmdb_id', item.id)
      .eq('media_type', item.media_type)
      .select()

    if (deleteError) {
      console.error('Verwijderen van watchlist mislukt:', deleteError)
      setError(`Kon het item niet van de watchlist verwijderen: ${deleteError.message}`)
      return
    }
    if (!deletedRow || deletedRow.length === 0) {
      setError('Het item leek van de watchlist verwijderd, maar er is geen rij verwijderd — waarschijnlijk ontbreekt een DELETE-policy op de "watchlist"-tabel in Supabase (RLS).')
      return
    }

    setItems((current) => current.filter((i) => !(i.id === item.id && i.media_type === item.media_type)))
  }

  // Alleen van de watchlist af, zonder rating — zo blijft de titel ongewaardeerd en
  // telt hij weer gewoon mee als kandidaat in de aanbevelingscategorieën.
  async function handleRemove(item: WatchlistItem) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setError(null)

    const { data: deletedRow, error: deleteError } = await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', user.id)
      .eq('tmdb_id', item.id)
      .eq('media_type', item.media_type)
      .select()

    if (deleteError) {
      console.error('Verwijderen van watchlist mislukt:', deleteError)
      setError(`Kon het item niet van de watchlist verwijderen: ${deleteError.message}`)
      return
    }
    if (!deletedRow || deletedRow.length === 0) {
      setError('Het item leek van de watchlist verwijderd, maar er is geen rij verwijderd — waarschijnlijk ontbreekt een DELETE-policy op de "watchlist"-tabel in Supabase (RLS).')
      return
    }

    setItems((current) => current.filter((i) => !(i.id === item.id && i.media_type === item.media_type)))
  }

  const movieItems = items.filter((i) => i.media_type === 'movie')
  const tvItems = items.filter((i) => i.media_type === 'tv')
  const visible = tab === 'movie' ? movieItems : tvItems

  return (
    <>
      <main className="max-w-xl mx-auto px-5 pt-6 pb-28">
        <h1 className="font-display text-2xl mb-1">Watchlist</h1>
        <p className="text-[#93A3B5] mb-6">Wat je nog wilt zien.</p>

        {error && (
          <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-6">
            {error}
          </p>
        )}

        <div className="flex gap-1 p-1 rounded-full bg-[#1A2330] border border-[#2A3644] mb-6 w-fit">
          <button
            onClick={() => setTab('movie')}
            className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all touch-manipulation ${
              tab === 'movie' ? 'bg-[#E8A33D] text-[#171F2B]' : 'text-[#93A3B5]'
            }`}
          >
            Films ({movieItems.length})
          </button>
          <button
            onClick={() => setTab('tv')}
            className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all touch-manipulation ${
              tab === 'tv' ? 'bg-[#E8A33D] text-[#171F2B]' : 'text-[#93A3B5]'
            }`}
          >
            Series ({tvItems.length})
          </button>
        </div>

        {loading && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-[#1A2330] animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        )}

        {!loading && visible.length === 0 && (
          <p className="text-[#93A3B5] border border-dashed border-[#2A3644] rounded-2xl px-4 py-10 text-center">
            Nog niets op je watchlist. Voeg iets toe vanuit je aanbevelingen.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {visible.map((item) => (
            <div key={`${item.media_type}-${item.id}`} className={`${card} p-3`}>
              <div className="flex gap-3">
                {item.poster_path ? (
                  <div className="relative w-16 aspect-[2/3] rounded-lg flex-shrink-0 overflow-hidden">
                    <Image
                      src={`https://image.tmdb.org/t/p/w200${item.poster_path}`}
                      alt={item.title}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-16 aspect-[2/3] rounded-lg bg-[#212C3B] flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium leading-tight">{item.title}</p>
                    <button
                      onClick={() => handleRemove(item)}
                      className="text-[#93A3B5] hover:text-[#C97064] transition-colors p-1 -mt-1 -mr-1 flex-shrink-0"
                      aria-label="Verwijderen"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-[#93A3B5] mt-1">
                    {item.sourceMode && <span>{MODE_LABELS[item.sourceMode]}</span>}
                    {item.watchOn && (
                      <>
                        {item.sourceMode && ' · '}
                        {item.watchUrl ? (
                          <a
                            href={item.watchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#E8A33D] hover:text-[#F0B457] transition-colors"
                          >
                            {item.watchOn}
                          </a>
                        ) : (
                          <span className="text-[#E8A33D]">{item.watchOn}</span>
                        )}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap mt-3 pl-[76px]">
                <button
                  onClick={() => handleRate(item, 'love')}
                  className={`${chip(false, 'accent', 'sm')} flex items-center gap-1`}
                >
                  <HeartIcon className="w-3 h-3" /> Zeker
                </button>
                <button
                  onClick={() => handleRate(item, 'ok')}
                  className={`${chip(false, 'teal', 'sm')} flex items-center gap-1`}
                >
                  <OkIcon className="w-3 h-3" /> Oké
                </button>
                <button
                  onClick={() => handleRate(item, 'dislike')}
                  className={`${chip(false, 'coral', 'sm')} flex items-center gap-1`}
                >
                  <DislikeIcon className="w-3 h-3" /> Niet voor mij
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      <BottomNav />
    </>
  )
}
