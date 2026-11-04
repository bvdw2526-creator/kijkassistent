'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { supabase } from '@/lib/supabase'
import { COMMUNITY_VOTES_ENABLED, COMMUNITY_VOTES_MIN } from '@/lib/features'

type Summary = { total: number; love: number | null; ok: number | null; dislike: number | null; my_vote: string | null }

// Percentages die samen precies 100 zijn: afronden naar beneden en de rest verdelen over de grootste restjes.
function percentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0)
  if (total === 0) return counts.map(() => 0)
  const exact = counts.map((c) => (c * 100) / total)
  const result = exact.map(Math.floor)
  let left = 100 - result.reduce((a, b) => a + b, 0)
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    result[i]++
    left--
  }
  return result
}

// "Wat anderen vonden": hoe andere gebruikers deze titel beoordeelden, alleen in de infopopups (niet in lijsten).
// Telling in de database (title_vote_summary, migratie 20261104); onder de drempel komt alleen het totaal terug.
// Staat uit tot COMMUNITY_VOTES_ENABLED in lib/features.ts aan gaat.
export default function CommunityVotes({ mediaType, id }: { mediaType: 'movie' | 'tv'; id: number }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const t = useTranslations('title')

  useEffect(() => {
    if (!COMMUNITY_VOTES_ENABLED) return
    // Geen reset bij een andere titel: de popups geven dit onderdeel een key per titel.
    let cancelled = false
    supabase
      .rpc('title_vote_summary', { p_tmdb_id: id, p_media_type: mediaType, p_min: COMMUNITY_VOTES_MIN })
      .then(({ data, error }) => {
        const row = Array.isArray(data) ? data[0] : null
        if (!cancelled && !error && row) setSummary(row as Summary)
      })
    return () => {
      cancelled = true
    }
  }, [mediaType, id])

  if (!COMMUNITY_VOTES_ENABLED || !summary) return null

  if (summary.love === null || summary.ok === null || summary.dislike === null) {
    return <p className="text-xs text-faint mb-4">{summary.my_vote ? t('votesFew') : t('votesFewBeFirst')}</p>
  }

  const [love, ok, dislike] = percentages([summary.love, summary.ok, summary.dislike])
  // Vaste kleuren (groen, geel, rood), los van de skin: die verandert accent/teal/coral per thema.
  const parts = [
    { percent: love, label: t('votesLove'), emoji: '👍', color: '#5DBB7A' },
    { percent: ok, label: t('votesOk'), emoji: '🙂', color: '#E8C547' },
    { percent: dislike, label: t('votesDislike'), emoji: '👎', color: '#D9604F' },
  ]

  return (
    <div className="mb-4">
      <p className="text-sm font-medium mb-2">{t('votesHeading')}</p>
      <div className="flex h-2 rounded-full overflow-hidden bg-surface-2 mb-2" aria-hidden="true">
        {parts.map(
          (p) => p.percent > 0 && <div key={p.label} style={{ width: `${p.percent}%`, backgroundColor: p.color }} />
        )}
      </div>
      <p className="text-sm text-muted">
        {parts.map((p, i) => (
          <span key={p.label} className="whitespace-nowrap">
            {i > 0 && ' · '}
            {p.emoji} {p.percent}% {p.label}
          </span>
        ))}
      </p>
      <p className="text-xs text-faint mt-0.5">{t('votesBasis', { count: summary.total })}</p>
    </div>
  )
}
