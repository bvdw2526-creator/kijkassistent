'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { authFetch } from '@/lib/supabase'
import type { SeriesUpdate } from '@/lib/seriesUpdates'
import TitleInfoSheet from './TitleInfoSheet'

const dismissedKey = (userId: string) => `kijkassistent:seriesupdates:${userId}`

function readDismissed(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(dismissedKey(userId))
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function formatDate(iso: string, locale: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale === 'en' ? 'en-GB' : 'nl-NL', { day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' })
}

// Op Voor jou: series die je leuk vindt en binnenkort (of net) terugkomen met een nieuw seizoen. Toont niets zolang er
// niets is, of als de aanvraag mislukt.
export default function SeriesUpdates({ userId }: { userId: string }) {
  const [items, setItems] = useState<SeriesUpdate[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed(userId))
  const [open, setOpen] = useState<SeriesUpdate | null>(null)
  const t = useTranslations('seriesUpdates')
  const locale = useLocale()

  useEffect(() => {
    let cancelled = false
    authFetch('/api/series-updates')
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.items)) setItems(data.items)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  function dismiss(item: SeriesUpdate) {
    const next = new Set(dismissed).add(item.key)
    setDismissed(next)
    try {
      localStorage.setItem(dismissedKey(userId), JSON.stringify(Array.from(next)))
    } catch {
      // Geen opslag beschikbaar: dan verschijnt de melding de volgende keer gewoon weer.
    }
  }

  const visible = items.filter((i) => !dismissed.has(i.key))
  if (visible.length === 0) return null

  return (
    <>
      <div className="rounded-2xl border border-teal/40 bg-teal/5 px-4 py-3 mb-5">
        <p className="text-xs font-semibold tracking-wide uppercase text-teal mb-2">{t('heading')}</p>
        <ul className="flex flex-col gap-2.5">
          {visible.map((item) => (
            <li key={item.key} className="flex items-center gap-3">
              <button onClick={() => setOpen(item)} className="flex flex-1 items-center gap-3 min-w-0 text-left touch-manipulation">
                {item.poster_path ? (
                  <span className="relative w-9 aspect-[2/3] rounded-md overflow-hidden flex-shrink-0 bg-surface-2">
                    <Image src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" fill sizes="36px" className="object-cover" />
                  </span>
                ) : (
                  <span className="w-9 aspect-[2/3] rounded-md bg-surface-2 flex-shrink-0" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{item.title}</span>
                  <span className="block text-xs text-muted mt-0.5">
                    {item.kind === 'started'
                      ? t('started', { season: item.season })
                      : t('startsOn', { season: item.season, date: formatDate(item.date, locale) })}
                    {item.watchOn ? ` · ${item.watchOn}` : ''}
                  </span>
                </span>
              </button>
              <button
                onClick={() => dismiss(item)}
                aria-label={t('dismiss', { title: item.title })}
                className="text-muted hover:text-foreground transition-colors p-2 touch-manipulation"
              >
                <span aria-hidden className="text-lg leading-none">
                  ×
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {open && <TitleInfoSheet item={{ id: open.id, media_type: 'tv', title: open.title, poster_path: open.poster_path }} onClose={() => setOpen(null)} />}
    </>
  )
}
