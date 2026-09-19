'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import BottomNav from '../components/BottomNav'
import { card } from '../components/ui'
import { HeartIcon, OkIcon, DislikeIcon, UsersIcon } from '../components/Icons'

type ProfileStats = {
  totalWatched: number
  movieCount: number
  tvCount: number
  ratingCounts: { love: number; ok: number; dislike: number }
  topGenres: { name: string; count: number }[]
  topActors: { name: string; count: number }[]
  streaming: { lovedTotal: number; services: { id: string; label: string; owned: boolean; count: number }[] }
}

function StatSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-24 rounded-2xl bg-[#1A2330] animate-skeleton" />
      <div className="h-32 rounded-2xl bg-[#1A2330] animate-skeleton" style={{ animationDelay: '80ms' }} />
      <div className="h-40 rounded-2xl bg-[#1A2330] animate-skeleton" style={{ animationDelay: '160ms' }} />
    </div>
  )
}

export default function Profiel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<ProfileStats | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setLoading(false)
        return
      }
      try {
        const res = await fetch('/api/profile-stats', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          setError(data.error || `Onbekende fout (status ${res.status})`)
          setLoading(false)
          return
        }
        setStats(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Onbekende fout bij het ophalen van je kijkprofiel')
      }
      setLoading(false)
    }
    load()
  }, [])

  const maxGenreCount = stats?.topGenres[0]?.count ?? 0
  const maxActorCount = stats?.topActors[0]?.count ?? 0

  return (
    <>
      <main className="max-w-xl mx-auto px-5 pt-6 pb-28">
        <h1 className="font-display text-2xl mb-1">Stats</h1>
        <p className="text-[#93A3B5] mb-6">Wat je favorieten en beoordelingen over je smaak zeggen.</p>

        {error && (
          <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-6">
            {error}
          </p>
        )}

        {loading && <StatSkeleton />}

        {!loading && stats && stats.totalWatched === 0 && (
          <p className="text-[#93A3B5] border border-dashed border-[#2A3644] rounded-2xl px-4 py-10 text-center leading-relaxed">
            Nog niets om te laten zien — voeg favorieten toe of geef een paar beoordelingen bij{' '}
            <Link href="/onboarding" className="text-[#E8A33D] hover:text-[#F0B457] transition-colors">Zoeken</Link>.
          </p>
        )}

        {!loading && stats && stats.totalWatched > 0 && (
          <div className="flex flex-col gap-3">
            {/* Grote cijfers */}
            <div className={`${card} p-5`}>
              <p className="font-display text-4xl text-[#E8A33D] leading-none">{stats.totalWatched}</p>
              <p className="text-sm text-[#93A3B5] mt-1.5">titels gezien</p>
              <p className="text-sm text-[#5E6D80] mt-3">
                {stats.movieCount} {stats.movieCount === 1 ? 'film' : 'films'} · {stats.tvCount} {stats.tvCount === 1 ? 'serie' : 'series'}
              </p>
            </div>

            {/* Beoordelingsverdeling */}
            <div className={`${card} p-5`}>
              <p className="text-sm font-medium mb-4">Hoe je beoordeelt</p>
              <div className="flex flex-col gap-3">
                {[
                  { icon: HeartIcon, label: 'Zeker leuk', count: stats.ratingCounts.love, colorClass: 'text-[#E8A33D]', hex: '#E8A33D' },
                  { icon: OkIcon, label: 'Was oké', count: stats.ratingCounts.ok, colorClass: 'text-[#52A9A0]', hex: '#52A9A0' },
                  { icon: DislikeIcon, label: 'Niet voor mij', count: stats.ratingCounts.dislike, colorClass: 'text-[#C97064]', hex: '#C97064' },
                ].map(({ icon: Icon, label, count, colorClass, hex }) => {
                  const total = stats.ratingCounts.love + stats.ratingCounts.ok + stats.ratingCounts.dislike
                  const pct = total > 0 ? (count / total) * 100 : 0
                  return (
                    <div key={label} className="flex items-center gap-3">
                      <Icon className={`w-4 h-4 flex-shrink-0 ${colorClass}`} />
                      <span className="text-sm w-28 flex-shrink-0">{label}</span>
                      <div className="flex-1 h-2 rounded-full bg-[#212C3B] overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: hex }} />
                      </div>
                      <span className="text-sm font-medium w-6 text-right flex-shrink-0">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Favoriete genres */}
            {stats.topGenres.length > 0 && (
              <div className={`${card} p-5`}>
                <p className="text-sm font-medium mb-1">Jouw favoriete genres</p>
                <p className="text-xs text-[#5E6D80] mb-4">Gebaseerd op je favorieten en beoordelingen</p>
                <div className="flex flex-col gap-2.5">
                  {stats.topGenres.map((genre, i) => (
                    <div key={genre.name} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-[#5E6D80] w-4 flex-shrink-0">{i + 1}</span>
                      <span className="text-sm flex-1 min-w-0 truncate">{genre.name}</span>
                      <div className="w-20 h-1.5 rounded-full bg-[#212C3B] overflow-hidden flex-shrink-0">
                        <div
                          className="h-full rounded-full bg-[#E8A33D] transition-all"
                          style={{ width: `${maxGenreCount > 0 ? (genre.count / maxGenreCount) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#93A3B5] w-4 text-right flex-shrink-0">{genre.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Streamingdienst met de meeste titels die je echt leuk vindt */}
            {stats.streaming.lovedTotal > 0 && stats.streaming.services.some((s) => s.count > 0) && (
              <div className={`${card} p-5`}>
                <p className="text-sm font-medium mb-1">Waar staat jouw smaak?</p>
                <p className="text-xs text-[#5E6D80] mb-4">
                  {stats.streaming.services[0].label} heeft de meeste van je {stats.streaming.lovedTotal} favorieten en
                  &quot;zeker leuk&quot;-titels. Alleen abonnementsaanbod van nu.
                </p>
                <div className="flex flex-col gap-2.5">
                  {stats.streaming.services.map((service) => {
                    const max = stats.streaming.services[0].count
                    return (
                      <div key={service.id} className="flex items-center gap-3">
                        <span className="text-sm w-24 flex-shrink-0 truncate">{service.label}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-[#212C3B] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${service.owned ? 'bg-[#E8A33D]' : 'bg-[#5E6D80]'}`}
                            style={{ width: `${max > 0 ? (service.count / max) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#93A3B5] w-16 text-right flex-shrink-0">
                          {service.count}×{service.owned ? ' · jij' : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Meest voorkomende acteurs — het verrassende inzicht */}
            {stats.topActors.length > 0 && (
              <div className={`${card} p-5 border-[#E8A33D]/30`}>
                <div className="flex items-center gap-2 mb-1">
                  <UsersIcon className="w-4 h-4 text-[#E8A33D]" />
                  <p className="text-sm font-medium">Wist je dit al?</p>
                </div>
                <p className="text-xs text-[#5E6D80] mb-4">Deze mensen duiken opvallend vaak op in wat je hebt gezien</p>
                <div className="flex flex-col gap-2.5">
                  {stats.topActors.map((actor, i) => (
                    <div key={actor.name} className="flex items-center gap-3">
                      <span className="text-xs font-mono text-[#5E6D80] w-4 flex-shrink-0">{i + 1}</span>
                      <span className="text-sm flex-1 min-w-0 truncate">{actor.name}</span>
                      <div className="w-20 h-1.5 rounded-full bg-[#212C3B] overflow-hidden flex-shrink-0">
                        <div
                          className="h-full rounded-full bg-[#E8A33D] transition-all"
                          style={{ width: `${maxActorCount > 0 ? (actor.count / maxActorCount) * 100 : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#93A3B5] w-16 text-right flex-shrink-0">
                        {actor.count}× gezien
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <BottomNav />
    </>
  )
}
