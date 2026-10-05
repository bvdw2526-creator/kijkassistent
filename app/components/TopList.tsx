'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase, getCurrentUser } from '@/lib/supabase'
import type { TopItem } from '@/lib/topLists'
import TitleInfoSheet from './TitleInfoSheet'
import BottomNav from './BottomNav'
import { btnPrimary, btnSecondary, card, chip } from './ui'
import { HeartIcon, OkIcon, DislikeIcon, StarIcon, PlusIcon, CheckIcon } from './Icons'

type Rating = 'love' | 'ok' | 'dislike'
type Mark = Rating | 'fav'

const markStyle: Record<Mark, { label: string; className: string }> = {
  love: { label: 'Zeker leuk', className: 'text-[#E8A33D]' },
  ok: { label: 'Was oké', className: 'text-[#52A9A0]' },
  dislike: { label: 'Niet voor mij', className: 'text-[#C97064]' },
  fav: { label: 'Favoriet', className: 'text-[#E8A33D]' },
}

// Zelfde keuzes als bij Zoeken.
const RATING_BUTTONS: { rating: Rating; label: string; tone: 'accent' | 'teal' | 'coral' }[] = [
  { rating: 'love', label: 'Zeker meer zoals dit', tone: 'accent' },
  { rating: 'ok', label: 'Was oké', tone: 'teal' },
  { rating: 'dislike', label: 'Niet voor mij', tone: 'coral' },
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
        setActionError(`Kon de beoordeling niet verwijderen${error ? `: ${error.message}` : '.'}`)
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
      setActionError(`Kon de beoordeling niet opslaan${error ? `: ${error.message}` : '.'}`)
      return
    }
    setRatings((current) => new Map(current).set(key, rating))
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
      setActionError(`Kon niet als favoriet opslaan: ${error.message}`)
      return
    }
    setFavorites((current) => new Set(current).add(key))
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
      setActionError(`Kon niet op de kijklijst zetten: ${error.message}`)
      return
    }
    setWatchlist((current) => new Set(current).add(key))
  }

  return (
    <>
      {loggedIn === true && (
        <div className={`${card} px-4 py-3 mb-5`}>
          <p className="text-sm font-medium">
            Je hebt {seen} van de {items.length} gezien
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-[#2A3644] overflow-hidden">
            <div className="h-full rounded-full bg-[#E8A33D]" style={{ width: `${items.length ? (seen / items.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}
      {loggedIn === false && (
        <div className={`${card} px-4 py-3 mb-5`}>
          <p className="text-sm">
            Wil je zien welke je al gezien hebt en welke bij jou passen?{' '}
            <Link href="/register" className="text-[#E8A33D] underline underline-offset-2">
              Maak een account
            </Link>{' '}
            of{' '}
            <Link href="/login" className="text-[#E8A33D] underline underline-offset-2">
              log in
            </Link>
            .
          </p>
        </div>
      )}

      <ol className="flex flex-col gap-2">
        {items.map((item, index) => {
          const mark = markOf(item)
          const row = (
            <>
              <span className="w-8 text-right font-display text-lg text-[#5E6D80] flex-shrink-0">{index + 1}</span>
              <span className="relative w-10 aspect-[2/3] rounded-md overflow-hidden flex-shrink-0 bg-[#212C3B]">
                {item.poster_path && (
                  <Image src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" fill sizes="40px" className="object-cover" />
                )}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block text-sm font-medium truncate">{item.title}</span>
                <span className="block text-xs text-[#93A3B5] mt-0.5">
                  {item.year} · ★ {item.voteAverage.toFixed(1).replace('.', ',')}
                </span>
              </span>
              {mark && (
                <span className={`flex-shrink-0 ${markStyle[mark].className}`} title={markStyle[mark].label} aria-label={markStyle[mark].label}>
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
                  className={`${card} w-full flex items-center gap-3 px-3 py-2.5 touch-manipulation hover:border-[#3d4c60] transition-colors`}
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
                <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-3">{actionError}</p>
              )}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button onClick={() => addToWatchlist(open, details?.posterPath ?? open.poster_path)} className={btnPrimary}>
                  {watchlist.has(keyOf(open)) ? <CheckIcon className="w-4 h-4" /> : <PlusIcon className="w-4 h-4" />}
                  Op kijklijst
                </button>
                <button onClick={() => addFavorite(open)} className={btnSecondary}>
                  {favorites.has(keyOf(open)) ? <CheckIcon className="w-4 h-4" /> : <PlusIcon className="w-4 h-4" />}
                  Favoriet
                </button>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {RATING_BUTTONS.map(({ rating, label, tone }) => (
                  <button key={rating} onClick={() => rate(open, rating)} className={chip(ratings.get(keyOf(open)) === rating, tone, 'sm')}>
                    {label}
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
