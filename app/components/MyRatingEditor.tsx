'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { supabase, getCurrentUser } from '@/lib/supabase'
import { chip } from './ui'

export type Mark = 'fav' | 'love' | 'ok' | 'dislike'

const MARKS: { mark: Mark; label: 'catFav' | 'catLove' | 'catOk' | 'catDislike'; tone: 'accent' | 'teal' | 'coral' }[] = [
  { mark: 'fav', label: 'catFav', tone: 'accent' },
  { mark: 'love', label: 'catLove', tone: 'accent' },
  { mark: 'ok', label: 'catOk', tone: 'teal' },
  { mark: 'dislike', label: 'catDislike', tone: 'coral' },
]

// "Jouw oordeel" in de infopopup op de Stats-pagina: je huidige oordeel aanpassen of weghalen. Eén oordeel per titel:
// favoriet maken haalt een beoordeling weg en andersom; dat regelt de database zelf (migratie 20261017_favorite_or_rating).
// onChanged laat de Stats-pagina zijn cijfers opnieuw ophalen.
export default function MyRatingEditor({
  item,
  onChanged,
}: {
  item: { id: number; media_type: 'movie' | 'tv'; title: string }
  onChanged?: () => void
}) {
  const t = useTranslations('stats')
  // undefined = nog aan het laden, null = geen oordeel.
  const [mark, setMark] = useState<Mark | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCurrentUser().then(async (user) => {
      if (!user) return
      const [{ data: rating }, { data: favorite }] = await Promise.all([
        supabase.from('ratings').select('rating').eq('user_id', user.id).eq('tmdb_id', item.id).eq('media_type', item.media_type).maybeSingle(),
        supabase.from('favorite_movies').select('tmdb_id').eq('user_id', user.id).eq('tmdb_id', item.id).eq('media_type', item.media_type).maybeSingle(),
      ])
      if (cancelled) return
      setMark(favorite ? 'fav' : ((rating?.rating as Mark | undefined) ?? null))
    })
    return () => {
      cancelled = true
    }
  }, [item.id, item.media_type])

  async function choose(next: Mark) {
    if (busy || next === mark) return
    const user = await getCurrentUser()
    if (!user) return
    setBusy(true)
    setError(false)
    const { error: saveError } =
      next === 'fav'
        ? await supabase
            .from('favorite_movies')
            .insert({ user_id: user.id, tmdb_id: item.id, title: item.title, media_type: item.media_type })
            // 23505 = staat al bij je favorieten: dan is het doel al bereikt.
            .then((res) => (res.error?.code === '23505' ? { ...res, error: null } : res))
        : await supabase
            .from('ratings')
            .upsert(
              { user_id: user.id, tmdb_id: item.id, title: item.title, rating: next, media_type: item.media_type },
              { onConflict: 'user_id,tmdb_id,media_type' }
            )
    setBusy(false)
    if (saveError) {
      setError(true)
      return
    }
    setMark(next)
    onChanged?.()
  }

  async function remove() {
    if (busy || !mark) return
    const user = await getCurrentUser()
    if (!user) return
    setBusy(true)
    setError(false)
    const match = { user_id: user.id, tmdb_id: item.id, media_type: item.media_type }
    const [{ error: ratingError }, { error: favoriteError }] = await Promise.all([
      supabase.from('ratings').delete().match(match),
      supabase.from('favorite_movies').delete().match(match),
    ])
    setBusy(false)
    if (ratingError || favoriteError) {
      setError(true)
      return
    }
    setMark(null)
    onChanged?.()
  }

  if (mark === undefined) return null

  return (
    <div className="mb-4">
      <p className="text-sm font-medium mb-2">{t('yourRating')}</p>
      <div className="flex gap-1.5 flex-wrap items-center">
        {MARKS.map(({ mark: m, label, tone }) => (
          <button key={m} onClick={() => choose(m)} disabled={busy} aria-pressed={mark === m} className={chip(mark === m, tone, 'sm')}>
            {t(label)}
          </button>
        ))}
      </div>
      {mark ? (
        <button
          onClick={remove}
          disabled={busy}
          className="mt-2.5 text-xs text-muted hover:text-coral transition-colors touch-manipulation"
        >
          {t('removeRating')}
        </button>
      ) : (
        <p className="mt-2.5 text-xs text-faint">{t('notRated')}</p>
      )}
      {error && <p className="mt-2 text-xs text-coral">{t('ratingFailed')}</p>}
    </div>
  )
}
