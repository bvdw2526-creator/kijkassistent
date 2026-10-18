'use client'

import { Suspense, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { supabase, getCurrentUser, authFetch } from '@/lib/supabase'
import BottomNav from '../../components/BottomNav'
import MovieCard from '../../components/MovieCard'
import TitleInfoSheet, { type TitleInfoItem } from '../../components/TitleInfoSheet'
import { btnPrimary, btnSecondary, chip } from '../../components/ui'
import { ChevronLeftIcon, PlusIcon, CheckIcon } from '../../components/Icons'
import type { PersonTitle } from '../../api/person-titles/route'

// Alle films en series van één acteur of regisseur (zie app/api/person-titles). Bereikbaar vanuit de popup van een persoon
// (Zoeken, je favoriete acteurs en regisseurs) en vanuit de uitleg bij een aanbeveling op Voor jou.

type Rating = 'love' | 'ok' | 'dislike'
// label = sleutel onder "title" in messages/*.json.
const RATING_BUTTONS: { rating: Rating; label: 'moreLikeThisRating' | 'rateOk' | 'rateDislike'; tone: 'accent' | 'teal' | 'coral' }[] = [
  { rating: 'love', label: 'moreLikeThisRating', tone: 'accent' },
  { rating: 'ok', label: 'rateOk', tone: 'teal' },
  { rating: 'dislike', label: 'rateDislike', tone: 'coral' },
]

type Data = {
  name: string
  profilePath: string | null
  role: 'acteur' | 'regisseur'
  hasServices: boolean
  items: PersonTitle[]
}

function formatReleaseDate(iso: string, locale: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function PersonPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const askedRole = useSearchParams().get('rol')
  const t = useTranslations('personPage')
  const tt = useTranslations('title')
  const th = useTranslations('home')
  const ts = useTranslations('search')
  const locale = useLocale()
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)
  const [tab, setTab] = useState<'movie' | 'tv'>('movie')
  // Standaard alles: je ziet het hele oeuvre en zet het filter aan als je iets wilt kijken.
  const [mineOnly, setMineOnly] = useState(false)
  const [selected, setSelected] = useState<PersonTitle | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [ratings, setRatings] = useState<Map<string, Rating>>(new Map())

  useEffect(() => {
    let cancelled = false
    getCurrentUser().then((user) => {
      if (cancelled) return
      setLoggedIn(!!user)
      if (!user) return
      const role = askedRole === 'regisseur' || askedRole === 'acteur' ? `&rol=${askedRole}` : ''
      authFetch(`/api/person-titles?id=${id}${role}`)
        .then((res) => res.json())
        .then((result) => {
          if (cancelled) return
          if (result.error) setError(result.error)
          else {
            setData(result)
            // Begin op series als iemand vooral series heeft gemaakt.
            const movies = result.items.filter((t: PersonTitle) => t.media_type === 'movie').length
            if (movies === 0 && result.items.length > 0) setTab('tv')
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : t('loadFailed'))
        })
    })
    return () => {
      cancelled = true
    }
  }, [id, askedRole])

  const keyOf = (item: { media_type: string; id: number }) => `${item.media_type}-${item.id}`

  function setStatus(item: PersonTitle, status: PersonTitle['status']) {
    setData((current) =>
      current ? { ...current, items: current.items.map((x) => (keyOf(x) === keyOf(item) ? { ...x, status } : x)) } : current
    )
  }

  async function addToWatchlist(item: PersonTitle) {
    if (item.status === 'kijklijst') return
    const user = await getCurrentUser()
    if (!user) return
    setActionError(null)
    const { error: insertError } = await supabase.from('watchlist').upsert(
      {
        user_id: user.id,
        tmdb_id: item.id,
        title: item.title,
        poster_path: item.poster_path,
        media_type: item.media_type,
        watch_on: item.watchOn,
      },
      { onConflict: 'user_id,tmdb_id,media_type', ignoreDuplicates: true }
    )
    if (insertError) {
      setActionError(t('errWatchlist', { message: insertError.message }))
      return
    }
    if (item.status !== 'gezien') setStatus(item, 'kijklijst')
  }

  async function addFavorite(item: PersonTitle) {
    const user = await getCurrentUser()
    if (!user) return
    setActionError(null)
    const { error: insertError } = await supabase
      .from('favorite_movies')
      .insert({ user_id: user.id, tmdb_id: item.id, title: item.title, media_type: item.media_type })
    // 23505 = staat er al: dan is het doel al bereikt.
    if (insertError && insertError.code !== '23505') {
      setActionError(t('errFavorite', { message: insertError.message }))
      return
    }
    // Eén oordeel per titel: de favoriet vervangt een beoordeling (zie de migratie 20261017_favorite_or_rating).
    setRatings((current) => {
      const next = new Map(current)
      next.delete(keyOf(item))
      return next
    })
    setStatus(item, 'gezien')
  }

  async function rate(item: PersonTitle, rating: Rating) {
    const user = await getCurrentUser()
    if (!user) return
    setActionError(null)
    const { error: upsertError } = await supabase
      .from('ratings')
      .upsert(
        { user_id: user.id, tmdb_id: item.id, title: item.title, rating, media_type: item.media_type },
        { onConflict: 'user_id,tmdb_id,media_type' }
      )
    if (upsertError) {
      setActionError(t('errRating', { message: upsertError.message }))
      return
    }
    setRatings((current) => new Map(current).set(keyOf(item), rating))
    setStatus(item, 'gezien')
  }

  const items = data?.items ?? []
  const filtered = mineOnly ? items.filter((x) => x.watchOn) : items
  const movies = filtered.filter((x) => x.media_type === 'movie')
  const shows = filtered.filter((x) => x.media_type === 'tv')
  const visible = tab === 'movie' ? movies : shows

  if (loggedIn === false) {
    return (
      <main className="max-w-md mx-auto px-6 py-16">
        <p className="text-muted mb-6">{t('loginToSee')}</p>
        <Link href="/login" className={btnPrimary}>
          {t('login')}
        </Link>
      </main>
    )
  }

  return (
    <>
      <main className="max-w-xl laptop:max-w-5xl mx-auto px-5 pt-6 pb-28">
        <button
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
          className="flex items-center gap-1 text-sm text-muted hover:text-foreground transition-colors mb-4 -ml-1 touch-manipulation"
        >
          <ChevronLeftIcon className="w-4 h-4" />
          {t('back')}
        </button>

        <header className="flex items-center gap-4 mb-5">
          {data?.profilePath ? (
            <div className="relative w-16 aspect-[2/3] rounded-xl overflow-hidden flex-shrink-0 shadow-lg">
              <Image src={`https://image.tmdb.org/t/p/w185${data.profilePath}`} alt={data.name} fill sizes="64px" className="object-cover" />
            </div>
          ) : (
            <div className="w-16 aspect-[2/3] rounded-xl bg-surface-2 flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="font-display text-xs tracking-[0.2em] uppercase text-accent">
              {data ? (data.role === 'regisseur' ? t('director') : t('actor')) : ' '}
            </p>
            <h1 className="font-display text-2xl mt-0.5 leading-tight">{data?.name || ' '}</h1>
            {data && (
              <p className="text-sm text-muted mt-1">
                {t('titles', { count: items.length })}
              </p>
            )}
          </div>
        </header>

        {error && (
          <p className="text-sm text-coral border border-coral/40 bg-coral/5 rounded-xl px-4 py-3 mb-5">{t('loadFailedMsg', { error })}</p>
        )}

        {data && (
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <div className="flex gap-1 p-1 rounded-full bg-surface border border-line">
              <button
                onClick={() => setTab('movie')}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all touch-manipulation ${
                  tab === 'movie' ? 'bg-accent text-on-accent' : 'text-muted'
                }`}
              >
                {th('filmsCount', { count: movies.length })}
              </button>
              <button
                onClick={() => setTab('tv')}
                className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all touch-manipulation ${
                  tab === 'tv' ? 'bg-accent text-on-accent' : 'text-muted'
                }`}
              >
                {th('seriesCount', { count: shows.length })}
              </button>
            </div>
            {data.hasServices && (
              <button onClick={() => setMineOnly((v) => !v)} className={chip(mineOnly, 'teal', 'sm')}>
                {ts('booksMineOnly')}
              </button>
            )}
          </div>
        )}

        {!data && !error && (
          <div className="grid grid-cols-2 sm:grid-cols-3 laptop:grid-cols-5 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-xl bg-surface animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        )}

        {data && visible.length === 0 && (
          <p className="text-muted border border-dashed border-line rounded-2xl px-4 py-10 text-center leading-relaxed">
            {mineOnly
              ? t(tab === 'movie' ? 'noneOnServicesFilms' : 'noneOnServicesSeries')
              : t(tab === 'movie' ? 'noneFilms' : 'noneSeries')}
          </p>
        )}

        {visible.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 laptop:grid-cols-5 gap-3">
            {visible.map((item, i) => (
              <MovieCard
                key={keyOf(item)}
                movie={item}
                priority={i < 4}
                hideMatch
                upcomingLabel={item.upcoming ? tt('upcomingOn', { date: formatReleaseDate(item.release_date, locale) }) : undefined}
                badge={item.status === 'gezien' ? t('seen') : item.status === 'kijklijst' ? t('onWatchlist') : undefined}
                onClick={() => {
                  setActionError(null)
                  setSelected(item)
                }}
              />
            ))}
          </div>
        )}
      </main>

      {selected && (
        <TitleInfoSheet item={selected as TitleInfoItem} onClose={() => setSelected(null)}>
          {actionError && (
            <p className="text-sm text-coral border border-coral/40 bg-coral/5 rounded-xl px-3.5 py-2.5 mb-3">{actionError}</p>
          )}
          <div className={`grid gap-2 mb-3 ${selected.upcoming ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <button onClick={() => addToWatchlist(selected)} className={btnPrimary}>
              {data?.items.find((x) => keyOf(x) === keyOf(selected))?.status === 'kijklijst' ? (
                <CheckIcon className="w-4 h-4" />
              ) : (
                <PlusIcon className="w-4 h-4" />
              )}
              {tt('addToWatchlist')}
            </button>
            {!selected.upcoming && (
              <button onClick={() => addFavorite(selected)} className={btnSecondary}>
                <PlusIcon className="w-4 h-4" />
                {tt('favorite')}
              </button>
            )}
          </div>
          {!selected.upcoming && (
            <div className="flex gap-1.5 flex-wrap">
              {RATING_BUTTONS.map(({ rating, label, tone }) => (
                <button
                  key={rating}
                  onClick={() => rate(selected, rating)}
                  className={chip(ratings.get(keyOf(selected)) === rating, tone, 'sm')}
                >
                  {tt(label)}
                </button>
              ))}
            </div>
          )}
        </TitleInfoSheet>
      )}

      <BottomNav />
    </>
  )
}

// useSearchParams (voor ?rol=) vraagt om een Suspense-grens.
export default function Page() {
  return (
    <Suspense>
      <PersonPage />
    </Suspense>
  )
}
