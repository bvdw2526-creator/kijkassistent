'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { authFetch } from '@/lib/supabase'

type Person = { id: number; name: string }

type Details = {
  runtime?: number | null
  seasons?: number | null
  episodes?: number | null
  episodeRuntime?: number | null
  status?: 'ended' | 'running' | null
  directors: Person[]
  creators: Person[]
  cast: Person[]
}

// Speelduur of seizoenen, regisseur (of bedenker bij series) en hoofdrollen, onder de samenvatting in een popup.
// Haalt zelf op via /api/title-details; zolang dat loopt of mislukt, toont het niets.
export default function TitleDetails({ mediaType, id }: { mediaType: 'movie' | 'tv'; id: number }) {
  const [facts, setFacts] = useState<Details | null>(null)
  const t = useTranslations('title')

  useEffect(() => {
    // Geen reset bij een andere titel: de popups geven dit onderdeel een key per titel, dus het begint dan opnieuw.
    let cancelled = false
    authFetch(`/api/title-details?type=${mediaType}&id=${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && !data.error) setFacts(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [mediaType, id])

  if (!facts) return null

  const duration = (minutes: number) =>
    minutes >= 60 ? t('runtimeHours', { hours: Math.floor(minutes / 60), minutes: minutes % 60 }) : t('runtimeMinutes', { minutes })

  const lengthParts: string[] = []
  if (mediaType === 'movie') {
    if (facts.runtime) lengthParts.push(duration(facts.runtime))
  } else {
    if (facts.seasons) lengthParts.push(t('seasons', { count: facts.seasons }))
    if (facts.episodes) lengthParts.push(t('episodes', { count: facts.episodes }))
    if (facts.episodeRuntime) lengthParts.push(t('episodeRuntime', { minutes: facts.episodeRuntime }))
    if (facts.status === 'ended') lengthParts.push(t('seriesEnded'))
    if (facts.status === 'running') lengthParts.push(t('seriesRunning'))
  }

  const makers = mediaType === 'movie' ? facts.directors : facts.creators
  const names = (people: Person[], role: 'acteur' | 'regisseur') =>
    people.map((p, i) => (
      <span key={p.id}>
        {i > 0 && ', '}
        <Link href={`/persoon/${p.id}?rol=${role}`} className="text-foreground/85 hover:text-foreground underline-offset-2 hover:underline">
          {p.name}
        </Link>
      </span>
    ))

  if (lengthParts.length === 0 && makers.length === 0 && facts.cast.length === 0) return null

  return (
    <div className="text-sm text-muted mb-4 flex flex-col gap-1">
      {lengthParts.length > 0 && <p>{lengthParts.join(' · ')}</p>}
      {makers.length > 0 && (
        <p>
          {mediaType === 'movie' ? t('directedBy') : t('createdBy')} {names(makers, 'regisseur')}
        </p>
      )}
      {facts.cast.length > 0 && (
        <p>
          {t('starring')} {names(facts.cast, 'acteur')}
        </p>
      )}
    </div>
  )
}
