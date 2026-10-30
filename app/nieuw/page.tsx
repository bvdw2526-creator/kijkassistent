'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { supabase, getCurrentUser } from '@/lib/supabase'
import { fetchNewTitles, markNewTitlesSeen, type NewTitlesResponse } from '@/lib/nieuwSeen'
import { watchlistAdded } from '@/lib/watchlistCount'
import { tap } from '@/lib/native'
import type { NewTitle } from '@/app/api/new-titles/route'
import BottomNav from '../components/BottomNav'
import MovieCard from '../components/MovieCard'
import TitleInfoSheet from '../components/TitleInfoSheet'
import { btnPrimary, chip } from '../components/ui'
import { ChevronLeftIcon, CheckIcon, PlusIcon } from '../components/Icons'

type Rating = 'love' | 'ok' | 'dislike'

const RATING_BUTTONS: { rating: Rating; label: 'moreLikeThisRating' | 'rateOk' | 'rateDislike'; tone: 'accent' | 'teal' | 'coral' }[] = [
  { rating: 'love', label: 'moreLikeThisRating', tone: 'accent' },
  { rating: 'ok', label: 'rateOk', tone: 'teal' },
  { rating: 'dislike', label: 'rateDislike', tone: 'coral' },
]

const keyOf = (item: { media_type: string; id: number }) => `${item.media_type}-${item.id}`

function formatDate(iso: string, locale: string): string {
  if (!iso) return ''
  return new Date(`${iso}T12:00:00`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'short' })
}

// Wat er nieuw is, los van je smaak: nu en binnenkort in de bioscoop, en nieuw op jouw diensten (zie
// app/api/new-titles/route.ts). Bereikbaar via de knop "Nieuw" op Voor jou.
export default function Nieuw() {
  const [data, setData] = useState<NewTitlesResponse | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState<NewTitle | null>(null)
  const [ratings, setRatings] = useState<Map<string, Rating>>(new Map())
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const t = useTranslations('nieuw')
  const tt = useTranslations('title')
  const locale = useLocale()

  useEffect(() => {
    let cancelled = false
    fetchNewTitles().then((result) => {
      if (cancelled) return
      if (!result) {
        setFailed(true)
        return
      }
      setData(result)
      markNewTitlesSeen(result)
    })
    getCurrentUser().then(async (user) => {
      if (!user) return
      const [ratingRows, watchlistRows] = await Promise.all([
        supabase.from('ratings').select('tmdb_id, media_type, rating').eq('user_id', user.id),
        supabase.from('watchlist').select('tmdb_id, media_type').eq('user_id', user.id),
      ])
      if (cancelled) return
      setRatings(new Map((ratingRows.data || []).map((r) => [`${r.media_type}-${r.tmdb_id}`, r.rating as Rating])))
      setWatchlist(new Set((watchlistRows.data || []).map((w) => `${w.media_type}-${w.tmdb_id}`)))
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function rate(item: NewTitle, rating: Rating) {
    tap()
    const user = await getCurrentUser()
    if (!user) return
    setActionError(null)
    const { error } = await supabase
      .from('ratings')
      .upsert(
        { user_id: user.id, tmdb_id: item.id, title: item.title, rating, media_type: item.media_type },
        { onConflict: 'user_id,tmdb_id,media_type' }
      )
    if (error) {
      setActionError(t('errSave', { message: error.message }))
      return
    }
    setRatings((current) => new Map(current).set(keyOf(item), rating))
  }

  async function addToWatchlist(item: NewTitle) {
    tap()
    const key = keyOf(item)
    if (watchlist.has(key)) return
    const user = await getCurrentUser()
    if (!user) return
    setActionError(null)
    const { error } = await supabase.from('watchlist').upsert(
      { user_id: user.id, tmdb_id: item.id, title: item.title, poster_path: item.poster_path, media_type: item.media_type },
      { onConflict: 'user_id,tmdb_id,media_type', ignoreDuplicates: true }
    )
    if (error) {
      setActionError(t('errSave', { message: error.message }))
      return
    }
    watchlistAdded()
    setWatchlist((current) => new Set(current).add(key))
  }

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })

  function renderRow(title: string, hint: string, items: NewTitle[], kind: 'now' | 'soon' | 'services') {
    return (
      <section className="mb-7">
        <h2 className="font-display text-lg">{title}</h2>
        <p className="text-muted text-sm mt-0.5 mb-3">{hint}</p>
        {items.length === 0 ? (
          <p className="text-sm text-faint">{t('emptyRow')}</p>
        ) : (
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1 snap-x">
            {items.map((item) => (
              <div key={keyOf(item)} className="w-32 laptop:w-36 flex-shrink-0 snap-start [&>button]:block [&>button]:w-full">
                <MovieCard
                  movie={{
                    id: item.id,
                    title: item.title,
                    poster_path: item.poster_path,
                    release_date: item.release_date,
                    matchPercent: item.matchPercent,
                    watchOn: kind === 'services' ? item.services?.join(' · ') : kind === 'now' ? t('inCinema') : null,
                  }}
                  hideMatch={typeof item.matchPercent !== 'number'}
                  upcomingLabel={kind === 'soon' ? t('fromDate', { date: formatDate(item.release_date, locale) }) : undefined}
                  badge={item.media_type === 'tv' ? tt('series') : undefined}
                  onClick={() => {
                    setActionError(null)
                    setOpen(item)
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    )
  }

  return (
    <>
      <main className="max-w-xl laptop:max-w-5xl mx-auto px-5 pt-6 pb-28">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground transition-colors mb-4">
          <ChevronLeftIcon className="w-4 h-4" />
          {t('back')}
        </Link>
        <h1 className="font-display text-2xl mb-1">{t('heading')}</h1>
        <p className="text-muted mb-6">{t('intro')}</p>

        {failed && <p className="text-sm text-coral border border-coral/40 bg-coral/5 rounded-xl px-3.5 py-2.5 mb-4">{t('errLoad')}</p>}

        {!data && !failed && (
          <div className="flex flex-col gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3 overflow-hidden">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j} className="w-32 aspect-[2/3] flex-shrink-0 rounded-xl bg-surface animate-skeleton" style={{ animationDelay: `${(i * 4 + j) * 60}ms` }} />
                ))}
              </div>
            ))}
          </div>
        )}

        {data && (
          <>
            {data.hasServices ? (
              renderRow(t('onServices'), t('onServicesHint'), data.onServices, 'services')
            ) : (
              <section className="mb-7">
                <h2 className="font-display text-lg">{t('onServices')}</h2>
                <p className="text-muted text-sm mt-0.5">
                  {t.rich('noServices', {
                    link: (chunks) => (
                      <Link href="/settings" className="text-accent underline underline-offset-2">
                        {chunks}
                      </Link>
                    ),
                  })}
                </p>
              </section>
            )}
            {renderRow(t('cinemaNow'), t('cinemaNowHint'), data.cinemaNow, 'now')}
            {renderRow(t('cinemaSoon'), t('cinemaSoonHint'), data.cinemaSoon, 'soon')}
          </>
        )}
      </main>

      {open && (
        <TitleInfoSheet
          item={{ id: open.id, media_type: open.media_type, title: open.title, poster_path: open.poster_path }}
          onClose={() => setOpen(null)}
        >
          <>
            {actionError && (
              <p className="text-sm text-coral border border-coral/40 bg-coral/5 rounded-xl px-3.5 py-2.5 mb-3">{actionError}</p>
            )}
            <button onClick={() => addToWatchlist(open)} className={`${btnPrimary} w-full mb-3`}>
              {watchlist.has(keyOf(open)) ? <CheckIcon className="w-4 h-4" /> : <PlusIcon className="w-4 h-4" />}
              {tt('addToWatchlist')}
            </button>
            {/* Beoordelen kan pas als hij uit is. */}
            {open.release_date && open.release_date <= today && (
              <div className="flex gap-1.5 flex-wrap">
                {RATING_BUTTONS.map(({ rating, label, tone }) => (
                  <button key={rating} onClick={() => rate(open, rating)} className={chip(ratings.get(keyOf(open)) === rating, tone, 'sm')}>
                    {tt(label)}
                  </button>
                ))}
              </div>
            )}
          </>
        </TitleInfoSheet>
      )}

      <BottomNav />
    </>
  )
}
