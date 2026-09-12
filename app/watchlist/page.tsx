'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type RecommendationMode = 'focused' | 'balanced' | 'explore'

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

  if (loading) return <p className="p-8 text-[#9FB0C2]">Laden...</p>

  const movieItems = items.filter((i) => i.media_type === 'movie')
  const tvItems = items.filter((i) => i.media_type === 'tv')
  const visible = tab === 'movie' ? movieItems : tvItems

  return (
    <main className="max-w-xl mx-auto px-6 py-10">
      <h1 className="font-display text-2xl mb-1">Watchlist</h1>
      <p className="text-[#9FB0C2] mb-6">Wat je nog wilt zien.</p>

      {error && (
        <p className="text-sm text-[#C97064] border border-[#C97064] rounded-sm px-3 py-2 mb-6">
          {error}
        </p>
      )}

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
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium">{item.title}</p>
                <button
                  onClick={() => handleRemove(item)}
                  className="text-sm text-[#9FB0C2] hover:text-[#C97064] transition-colors flex-shrink-0"
                >
                  Verwijderen
                </button>
              </div>
              <p className="text-sm text-[#9FB0C2] mt-0.5">
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
              <p className="text-sm text-[#9FB0C2] mt-1">
                Heb je &apos;m al gezien? Laat weten wat je ervan vond:
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

      <Link href="/" className="inline-block mt-8 text-[#E8A33D] hover:text-[#F0B457] transition-colors text-sm">
        Terug naar aanbevelingen
      </Link>
    </main>
  )
}