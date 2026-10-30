'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { supabase, getCurrentUser } from '@/lib/supabase'
import { watchlistAdded } from '@/lib/watchlistCount'
import type { TopItem } from '@/lib/topLists'
import TitleInfoSheet from './TitleInfoSheet'
import BottomNav from './BottomNav'
import { btnPrimary, btnSecondary, card, chip } from './ui'
import { HeartIcon, OkIcon, DislikeIcon, StarIcon, PlusIcon, CheckIcon } from './Icons'
import { tap } from '@/lib/native'

type Rating = 'love' | 'ok' | 'dislike'
type Mark = Rating | 'fav'

// label = sleutel onder "stats" in messages/*.json.
const markStyle: Record<Mark, { label: string; className: string }> = {
  love: { label: 'catLove', className: 'text-accent' },
  ok: { label: 'catOk', className: 'text-teal' },
  dislike: { label: 'catDislike', className: 'text-coral' },
  fav: { label: 'catFav', className: 'text-accent' },
}

// Zelfde keuzes als bij Zoeken.
// label = sleutel onder "title" in messages/*.json.
const RATING_BUTTONS: { rating: Rating; label: 'moreLikeThisRating' | 'rateOk' | 'rateDislike'; tone: 'accent' | 'teal' | 'coral' }[] = [
  { rating: 'love', label: 'moreLikeThisRating', tone: 'accent' },
  { rating: 'ok', label: 'rateOk', tone: 'teal' },
  { rating: 'dislike', label: 'rateDislike', tone: 'coral' },
]

const keyOf = (item: { media_type: string; id: number }) => `${item.media_type}-${item.id}`

function MarkIcon({ mark }: { mark: Mark }) {
  const props = { className: 'w-4 h-4' }
  if (mark === 'love') return <HeartIcon {...props} />
  if (mark === 'ok') return <OkIcon {...props} />
  if (mark === 'dislike') return <DislikeIcon {...props} />
  return <StarIcon {...props} />
}

// De lijst wordt op de server getoond (zodat Google hem leest); ingelogde gebruikers zien er daarbovenop welke titels ze
// al gezien hebben, kunnen een titel beoordelen, als favoriet markeren of op hun kijklijst zetten, en krijgen de
// onderste navigatiebalk. Gezien = beoordeeld of favoriet.
export default function TopList({ items }: { items: TopItem[] }) {
  const [ratings, setRatings] = useState<Map<string, Rating>>(new Map())
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set())
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [open, setOpen] = useState<TopItem | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const t = useTranslations('top')
  const tt = useTranslations('title')
  const ts = useTranslations('stats')

  useEffect(() => {
    let cancelled = false
    getCurrentUser().then(async (user) => {
      if (!user) {
        if (!cancelled) setLoggedIn(false)
        return
      }
      const [ratingRows, favoriteRows, watchlistRows] = await Promise.all([
        supabase.from('ratings').select('tmdb_id, media_type, rating').eq('user_id', user.id),
        supabase.from('favorite_movies').select('tmdb_id, media_type').eq('user_id', user.id),
        supabase.from('watchlist').select('tmdb_id, media_type').eq('user_id', user.id),
      ])
      if (cancelled) return
      setRatings(new Map((ratingRows.data || []).map((r) => [`${r.media_type}-${r.tmdb_id}`, r.rating as Rating])))
      setFavorites(new Set((favoriteRows.data || []).map((f) => `${f.media_type}-${f.tmdb_id}`)))
      setWatchlist(new Set((watchlistRows.data || []).map((w) => `${w.media_type}-${w.tmdb_id}`)))
      setLoggedIn(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const markOf = (item: TopItem): Mark | undefined => ratings.get(keyOf(item)) ?? (favorites.has(keyOf(item)) ? 'fav' : undefined)
  const seen = items.filter((i) => markOf(i)).length

  async function rate(item: TopItem, rating: Rating) {
    tap()
    const user = await getCurrentUser()
    if (!user) return
    setActionError(null)
    const key = keyOf(item)
    // Nogmaals op dezelfde knop klikken heft de beoordeling weer op.
    if (ratings.get(key) === rating) {
      const { data, error } = await supabase
        .from('ratings')
        .delete()
        .eq('user_id', user.id)
        .eq('tmdb_id', item.id)
        .eq('media_type', item.media_type)
        .select()
      if (error || !data || data.length === 0) {
        setActionError(error ? t('errRemoveRatingMsg', { message: error.message }) : t('errRemoveRating'))
        return
      }
      setRatings((current) => {
        const next = new Map(current)
        next.delete(key)
        return next
      })
      return
    }
    const { data, error } = await supabase
      .from('ratings')
      .upsert(
        { user_id: user.id, tmdb_id: item.id, title: item.title, rating, media_type: item.media_type },
        { onConflict: 'user_id,tmdb_id,media_type' }
      )
      .select()
    if (error || !data || data.length === 0) {
      setActionError(error ? t('errSaveRatingMsg', { message: error.message }) : t('errSaveRating'))
      return
    }
    setRatings((current) => new Map(current).set(key, rating))
    // Eén oordeel per titel: een beoordeling vervangt een favoriet (zie de migratie 20261017_favorite_or_rating).
    setFavorites((current) => {
      const next = new Set(current)
      next.delete(key)
      return next
    })
  }

  async function addFavorite(item: TopItem) {
    const key = keyOf(item)
    if (favorites.has(key)) return
    const user = await getCurrentUser()
    if (!user) return
    setActionError(null)
    const { error } = await supabase
      .from('favorite_movies')
      .insert({ user_id: user.id, tmdb_id: item.id, title: item.title, media_type: item.media_type })
    // 23505 = staat al bij je favorieten: dan is het doel al bereikt.
    if (error && error.code !== '23505') {
      setActionError(t('errFavorite', { message: error.message }))
      return
    }
    setFavorites((current) => new Set(current).add(key))
    // En een favoriet vervangt een beoordeling.
    setRatings((current) => {
      const next = new Map(current)
      next.delete(key)
      return next
    })
  }

  async function addToWatchlist(item: TopItem, posterPath: string | null) {
    const key = keyOf(item)
    if (watchlist.has(key)) return
    const user = await getCurrentUser()
    if (!user) return
    setActionError(null)
    const { error } = await supabase.from('watchlist').upsert(
      { user_id: user.id, tmdb_id: item.id, title: item.title, poster_path: posterPath, media_type: item.media_type },
      { onConflict: 'user_id,tmdb_id,media_type', ignoreDuplicates: true }
    )
    if (error) {
      setActionError(t('errWatchlist', { message: error.message }))
      return
    }
    watchlistAdded()
    setWatchlist((current) => new Set(current).add(key))
  }

  return (
    <>
      {loggedIn === true && (
        <div className={`${card} px-4 py-3 mb-5 laptop:max-w-xl`}>
          <p className="text-sm font-medium">
            {t('seenOf', { seen, total: items.length })}
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-line overflow-hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${items.length ? (seen / items.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      {loggedIn === false && (
        <div className={`${card} px-4 py-3 mb-5 laptop:max-w-xl`}>
          <p className="text-sm">
            {t.rich('loggedOut', {
              register: (chunks) => (
                <Link href="/register" className="text-accent underline underline-offset-2">
                  {chunks}
                </Link>
              ),
              login: (chunks) => (
                <Link href="/login" className="text-accent underline underline-offset-2">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
      )}

      {/* Op laptop twee kolommen: 1 tot en met 50 links, de rest rechts. */}
      <ol className="flex flex-col gap-2 laptop:block laptop:columns-2 laptop:gap-3 laptop:[&>li]:break-inside-avoid laptop:[&>li]:mb-2">
        {items.map((item, index) => {
          const mark = markOf(item)
          const row = (
            <>
              <span className="w-8 text-right font-display text-lg text-faint flex-shrink-0">{index + 1}</span>
              <span className="relative w-10 aspect-[2/3] rounded-md overflow-hidden flex-shrink-0 bg-surface-2">
                {item.poster_path && (
                  <Image src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" fill sizes="40px" className="object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-medium truncate">{item.title}</span>
                <span className="block text-xs text-muted mt-0.5">
                  {item.year} · ★ {item.voteAverage.toFixed(1).replace('.', ',')}
                </span>
              </span>
              {mark && (
                <span className={`flex-shrink-0 ${markStyle[mark].className}`} title={ts(markStyle[mark].label)} aria-label={ts(markStyle[mark].label)}>
                  <MarkIcon mark={mark} />
                </span>
              )}
            </>
          )
          return (
            <li key={keyOf(item)}>
              {loggedIn ? (
                <button
                  onClick={() => {
                    setActionError(null)
                    setOpen(item)
                  }}
                  className={`${card} w-full flex items-center gap-3 px-3 py-2.5 touch-manipulation hover:border-line-strong transition-colors`}
                >
                  {row}
                </button>
              ) : (
                <div className={`${card} flex items-center gap-3 px-3 py-2.5`}>{row}</div>
              )}
            </li>
          )
        })}
      </ol>

      {open && (
        <TitleInfoSheet
          item={{ id: open.id, media_type: open.media_type, title: open.title, poster_path: open.poster_path }}
          onClose={() => setOpen(null)}
        >
          {(details) => (
            <>
              {actionError && (
                <p className="text-sm text-coral border border-coral/40 bg-coral/5 rounded-xl px-3.5 py-2.5 mb-3">{actionError}</p>
              )}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={() => addToWatchlist(open, details?.posterPath ?? open.poster_path)} className={btnPrimary}>
                  {watchlist.has(keyOf(open)) ? <CheckIcon className="w-4 h-4" /> : <PlusIcon className="w-4 h-4" />}
                  {tt('addToWatchlist')}
                </button>
                <button onClick={() => addFavorite(open)} className={btnSecondary}>
                  {favorites.has(keyOf(open)) ? <CheckIcon className="w-4 h-4" /> : <PlusIcon className="w-4 h-4" />}
                  {tt('favorite')}
                </button>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {RATING_BUTTONS.map(({ rating, label, tone }) => (
                  <button key={rating} onClick={() => rate(open, rating)} className={chip(ratings.get(keyOf(open)) === rating, tone, 'sm')}>
                    {tt(label)}
                  </button>
                ))}
              </div>
            </>
          )}
        </TitleInfoSheet>
      )}

      {loggedIn === true && (
        <>
          {/* Ruimte onder de lijst, zodat de onderste balk niets afdekt. */}
          <div className="h-24" aria-hidden />
          <BottomNav />
        </>
      )}
    </>
  )
}
