'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type WatchlistItem = {
  id: number
  title: string
  poster_path: string | null
  media_type: 'movie' | 'tv'
}

export default function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'movie' | 'tv'>('movie')

  useEffect(() => {
    loadWatchlist()
  }, [])

  async function loadWatchlist() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('watchlist')
      .select('tmdb_id, title, poster_path, media_type')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false })

    if (data) {
      setItems(
        data.map((w) => ({
          id: w.tmdb_id,
          title: w.title,
          poster_path: w.poster_path,
          media_type: w.media_type as 'movie' | 'tv',
        }))
      )
    }
    setLoading(false)
  }

  async function handleRate(item: WatchlistItem, rating: 'dislike' | 'ok' | 'love') {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { error: ratingError } = await supabase.from('ratings').upsert(
      {
        user_id: user.id,
        tmdb_id: item.id,
        title: item.title,
        rating,
        media_type: item.media_type,
      },
      { onConflict: 'user_id,tmdb_id,media_type' }
    )

    if (!ratingError) {
      await supabase
        .from('watchlist')
        .delete()
        .eq('user_id', user.id)
        .eq('tmdb_id', item.id)
        .eq('media_type', item.media_type)

      setItems((current) => current.filter((i) => !(i.id === item.id && i.media_type === item.media_type)))
    }
  }

  if (loading) return <p className="p-8 text-[#9FB0C2]">Laden...</p>

  const movieItems = items.filter((i) => i.media_type === 'movie')
  const tvItems = items.filter((i) => i.media_type === 'tv')
  const visible = tab === 'movie' ? movieItems : tvItems

  return (
    <main className="max-w-xl mx-auto px-6 py-10">
      <h1 className="font-display text-2xl mb-1">Watchlist</h1>
      <p className="text-[#9FB0C2] mb-6">Wat je nog wilt zien.</p>

      <div className="flex border-b border-[#3A4A5C] mb-6">
        <button
          onClick={() => setTab('movie')}
          className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
            tab === 'movie' ? 'border-[#E8A33D] text-[#E8A33D]' : 'border-transparent text-[#9FB0C2] hover:text-[#F2EFE9]'
          }`}
        >
          Films ({movieItems.length})
        </button>
        <button
          onClick={() => setTab('tv')}
          className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
            tab === 'tv' ? 'border-[#E8A33D] text-[#E8A33D]' : 'border-transparent text-[#9FB0C2] hover:text-[#F2EFE9]'
          }`}
        >
          Series ({tvItems.length})
        </button>
      </div>

      {visible.length === 0 && (
        <p className="text-[#9FB0C2] border border-dashed border-[#3A4A5C] rounded-sm px-4 py-6">
          Nog niets op je watchlist. Voeg iets toe vanuit je aanbevelingen.
        </p>
      )}

      <div className="flex flex-col">
        {visible.map((item, i) => (
          <div
            key={`${item.media_type}-${item.id}`}
            className={`flex gap-4 py-4 ${i !== visible.length - 1 ? 'border-b border-dashed border-[#3A4A5C]' : ''}`}
          >
            {item.poster_path && (
              <img
                src={`https://image.tmdb.org/t/p/w200${item.poster_path}`}
                alt={item.title}
                className="w-16 rounded-sm flex-shrink-0"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-[#9FB0C2] mt-0.5">
                Heb je 'm al gezien? Laat weten wat je ervan vond:
              </p>
              <div className="flex gap-2 mt-2 flex-wrap">
                <button
                  onClick={() => handleRate(item, 'love')}
                  className="text-sm border border-[#3A4A5C] rounded-sm px-3 py-1 hover:border-[#E8A33D] hover:text-[#E8A33D] transition-colors"
                >
                  Zeker meer zoals dit
                </button>
                <button
                  onClick={() => handleRate(item, 'ok')}
                  className="text-sm border border-[#3A4A5C] rounded-sm px-3 py-1 hover:border-[#52A9A0] hover:text-[#52A9A0] transition-colors"
                >
                  Was oké
                </button>
                <button
                  onClick={() => handleRate(item, 'dislike')}
                  className="text-sm border border-[#3A4A5C] rounded-sm px-3 py-1 hover:border-[#C97064] hover:text-[#C97064] transition-colors"
                >
                  Niet voor mij
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <a href="/" className="inline-block mt-8 text-[#E8A33D] hover:text-[#F0B457] transition-colors text-sm">
        Terug naar aanbevelingen
      </a>
    </main>
  )
}