'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { supabase, authFetch } from '@/lib/supabase'
import BottomNav from '../components/BottomNav'
import { card, tapChevron, tapRow } from '../components/ui'
import RatingBreakdown from '../components/RatingBreakdown'
import ActorHighlights, { type ActorHighlight } from '../components/ActorHighlights'
import { ChevronRightIcon, DislikeIcon } from '../components/Icons'

type ProfileStats = {
  totalWatched: number
  movieCount: number
  tvCount: number
  // fav ontbreekt in een oudere bewaarde kopie.
  ratingCounts: { fav?: number; love: number; ok: number; dislike: number }
  topGenres: { name: string; id?: number; count: number }[]
  topActors: ActorHighlight[]
  // Ontbreekt in een oudere bewaarde kopie, vandaar optioneel.
  dislikedGenres?: { name: string; id?: number; disliked: number; total: number }[]
  streaming: { lovedTotal: number; services: { id: string; label: string; owned: boolean; count: number }[] }
}

function StatSkeleton() {
  return (
    <div className="flex flex-col gap-3 laptop:grid laptop:grid-cols-2">
      <div className="h-24 rounded-2xl bg-surface animate-skeleton" />
      <div className="h-32 rounded-2xl bg-surface animate-skeleton" style={{ animationDelay: '80ms' }} />
      <div className="h-40 rounded-2xl bg-surface animate-skeleton" style={{ animationDelay: '160ms' }} />
    </div>
  )
}

export default function Profiel() {
  const t = useTranslations('stats')
  const tg = useTranslations('genres')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<ProfileStats | null>(null)
  // Hoeveel van de Top 100 je gezien hebt; mislukt dit, dan blijft het blok gewoon weg.
  const [topProgress, setTopProgress] = useState<{ films: { seen: number; total: number }; series: { seen: number; total: number } } | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setLoading(false)
        return
      }
      // De laatst bekende cijfers staan meteen op het scherm; de nieuwe volgen zodra de server klaar is.
      const cacheKey = `kijkassistent:stats:${session.user.id}`
      let hadCache = false
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) {
          setStats(JSON.parse(cached))
          setLoading(false)
          hadCache = true
        }
      } catch {
        // Geen opslag of een kapotte kopie: dan wachten we gewoon op de server.
      }
      try {
        const res = await fetch('/api/profile-stats', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          if (!hadCache) setError(data.error || t('unknownErrorStatus', { status: res.status }))
          setLoading(false)
          return
        }
        setStats(data)
        try {
          localStorage.setItem(cacheKey, JSON.stringify(data))
        } catch {
          // Opslaan lukt niet: volgende keer opnieuw laden.
        }
      } catch (err) {
        if (!hadCache) setError(err instanceof Error ? err.message : t('fetchError'))
      }
      setLoading(false)
    }
    load()
  }, [t])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session || cancelled) return
      // Ook hier de laatst bekende cijfers meteen tonen.
      const cacheKey = `kijkassistent:topprogress:${session.user.id}`
      try {
        const cached = localStorage.getItem(cacheKey)
        if (cached) setTopProgress(JSON.parse(cached))
      } catch {
        // Niets bewaard: dan wachten we op de server.
      }
      authFetch('/api/top-progress')
        .then((res) => res.json())
        .then((data) => {
          if (cancelled || !data.films || !data.series) return
          setTopProgress(data)
          try {
            localStorage.setItem(cacheKey, JSON.stringify(data))
          } catch {
            // Opslaan lukt niet: volgende keer opnieuw laden.
          }
        })
        .catch(() => {})
    })
    return () => {
      cancelled = true
    }
  }, [])

  const maxGenreCount = stats?.topGenres[0]?.count ?? 0
  // Genrenamen komen (nog) in het Nederlands van de server; met een id erbij in de taal van de app.
  const genreName = (genre: { name: string; id?: number }) =>
    genre.id !== undefined && tg.has(`g${genre.id}`) ? tg(`g${genre.id}`) : genre.name

  return (
    <>
      <main className="max-w-xl laptop:max-w-5xl mx-auto px-5 pt-6 pb-28">
        <h1 className="font-display text-2xl mb-1">{t('heading')}</h1>
        <p className="text-muted mb-6">{t('intro')}</p>

        {error && (
          <p className="text-sm text-coral border border-coral/40 bg-coral/5 rounded-xl px-3.5 py-2.5 mb-6">
            {error}
          </p>
        )}

        {loading && <StatSkeleton />}

        {!loading && stats && stats.totalWatched === 0 && (
          <p className="text-muted border border-dashed border-line rounded-2xl px-4 py-10 text-center leading-relaxed">
            {t.rich('empty', {
              link: (chunks) => (
                <Link href="/onboarding" className="text-accent hover:text-accent-hover transition-colors">{chunks}</Link>
              ),
            })}
          </p>
        )}

        {!loading && stats && stats.totalWatched > 0 && (
          // Op laptop twee kolommen waarin de blokken onder elkaar doorlopen, zodat er geen gaten vallen naast een lang blok.
          <div className="flex flex-col gap-3 laptop:block laptop:columns-2 laptop:[&>*]:break-inside-avoid laptop:[&>*]:mb-3">
            {/* Grote cijfers */}
            <div className={`${card} p-5`}>
              <p className="font-display text-4xl text-accent leading-none">{stats.totalWatched}</p>
              <p className="text-sm text-muted mt-1.5">{t('titlesSeen')}</p>
              <p className="text-sm text-faint mt-3">
                {t('counts', { films: stats.movieCount, series: stats.tvCount })}
              </p>
            </div>

            {/* Voortgang van de Top 100 */}
            {topProgress && topProgress.films.total > 0 && (
              <div className={`${card} p-5`}>
                <p className="text-sm font-medium mb-1">{t('topSeen')}</p>
                <p className="text-xs text-faint mb-3">{t('topSeenSub')}</p>
                <div className="flex flex-col gap-1">
                  {[
                    { label: t('films'), href: '/top-100/films', ...topProgress.films },
                    { label: t('series'), href: '/top-100/series', ...topProgress.series },
                  ].map(({ label, href, seen, total }) => (
                    <Link key={label} href={href} className={tapRow}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between mb-1.5">
                          <span className="text-sm">{label}</span>
                          <span className="text-sm text-muted">{t('seenOf', { seen, total })}</span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${total > 0 ? (seen / total) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <ChevronRightIcon className={tapChevron} />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Beoordelingsverdeling */}
            <RatingBreakdown counts={stats.ratingCounts} />

            {/* Favoriete genres */}
            {stats.topGenres.length > 0 && (
              <div className={`${card} p-5`}>
                <p className="text-sm font-medium mb-1">{t('favoriteGenres')}</p>
                <p className="text-xs text-faint mb-4">{t('favoriteGenresSub')}</p>
                <div className="flex flex-col gap-2.5">
                  {stats.topGenres.map((genre, i) => (
                    <div key={genre.name} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-faint w-4 flex-shrink-0">{i + 1}</span>
                      <span className="text-sm flex-1 min-w-0 truncate">{genreName(genre)}</span>
                      <div className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden flex-shrink-0">
                        <div
                          className="h-full rounded-full bg-accent transition-all"
                          style={{ width: `${maxGenreCount > 0 ? (genre.count / maxGenreCount) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted w-4 text-right flex-shrink-0">{genre.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Genres die je opvallend vaak afkeurt */}
            {stats.dislikedGenres && stats.dislikedGenres.length > 0 && (
              <div className={`${card} p-5`}>
                <div className="flex items-center gap-2 mb-1">
                  <DislikeIcon className="w-4 h-4 text-coral" />
                  <p className="text-sm font-medium">{t('notYourThing')}</p>
                </div>
                <p className="text-xs text-faint mb-4">{t('notYourThingSub')}</p>
                <div className="flex flex-col gap-2.5">
                  {stats.dislikedGenres.map((genre) => (
                    <div key={genre.name} className="flex items-center gap-3">
                      <span className="text-sm flex-1 min-w-0 truncate">{genreName(genre)}</span>
                      <div className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden flex-shrink-0">
                        <div
                          className="h-full rounded-full bg-coral transition-all"
                          style={{ width: `${(genre.disliked / genre.total) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted w-16 text-right flex-shrink-0">
                        {t('seenOf', { seen: genre.disliked, total: genre.total })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Streamingdienst met de meeste titels die je echt leuk vindt */}
            {stats.streaming.lovedTotal > 0 && stats.streaming.services.some((s) => s.count > 0) && (
              <div className={`${card} p-5`}>
                <p className="text-sm font-medium mb-1">{t('whereTaste')}</p>
                <p className="text-xs text-faint mb-4">
                  {t('whereTasteSub', { service: stats.streaming.services[0].label, total: stats.streaming.lovedTotal })}
                </p>
                <div className="flex flex-col gap-2.5">
                  {stats.streaming.services.map((service) => {
                    const max = stats.streaming.services[0].count
                    return (
                      <div key={service.id} className="flex items-center gap-3">
                        <span className="text-sm w-24 flex-shrink-0 truncate">{service.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${service.owned ? 'bg-accent' : 'bg-faint'}`}
                            style={{ width: `${max > 0 ? (service.count / max) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted w-16 text-right flex-shrink-0">
                          {service.count}×{service.owned ? t('you') : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Meest voorkomende acteurs — het verrassende inzicht */}
            {stats.topActors.length > 0 && (
              <ActorHighlights actors={stats.topActors} />
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </>
  )
}
