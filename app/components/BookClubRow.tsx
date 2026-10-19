'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { authFetch } from '@/lib/supabase'
import { BOOK_CLUB_SKIN } from '@/lib/skins'
import { useSkin } from '@/lib/useSkin'
import { PosterScroller, type HalloweenMovie } from './HalloweenRow'

// Zelfde vorm als een aanbeveling op Voor jou, zodat de gewone popup (kijklijst, beoordelen, verbergen) ermee werkt.
export type BookClubMovie = Omit<HalloweenMovie, 'halloween'> & { bookClub: true }

// Blijft staan zolang de app openstaat: bij het wisselen van tabblad hoeft de rij niet opnieuw opgehaald te worden.
const cache = new Map<string, BookClubMovie[]>()

// De Boekenclub-rij van deze gebruiker, alleen met de Boekenclub-skin aan (zie app/api/book-club). `remove` haalt een titel
// eruit zodra je hem hebt beoordeeld, op een lijst gezet of verborgen; `reload` haalt de rij opnieuw op (bij Vernieuwen).
export function useBookClubList(userId: string | null) {
  const skin = useSkin()
  const active = skin === BOOK_CLUB_SKIN
  const key = active && userId ? userId : null
  const [loaded, setLoaded] = useState<Record<string, BookClubMovie[]>>(() => Object.fromEntries(cache))
  const known = key ? loaded[key] : undefined

  useEffect(() => {
    if (!key || known) return
    let cancelled = false
    authFetch('/api/book-club')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data.error) return
        const items: BookClubMovie[] = data.items || []
        cache.set(key, items)
        setLoaded((current) => ({ ...current, [key]: items }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [key, known])

  function remove(match: (m: { id: number; media_type: 'movie' | 'tv' }) => boolean) {
    if (!userId) return
    setLoaded((current) => {
      const list = current[userId]
      if (!list) return current
      const filtered = list.filter((m) => !match(m))
      cache.set(userId, filtered)
      return { ...current, [userId]: filtered }
    })
  }

  function reload() {
    if (!userId) return
    cache.delete(userId)
    setLoaded((current) => Object.fromEntries(Object.entries(current).filter(([k]) => k !== userId)))
  }

  return { active, items: known ?? null, loading: !!key && !known, remove, reload }
}

// Rij boekverfilmingen op Voor jou, los van de gewone aanbevelingen. Zonder percentage: de volgorde is op smaak, maar het
// is geen gewone match.
export default function BookClubRow({
  items,
  loading,
  onSelect,
}: {
  items: BookClubMovie[] | null
  loading: boolean
  onSelect: (movie: BookClubMovie) => void
}) {
  const t = useTranslations('bookClub')
  if (!loading && (items?.length ?? 0) === 0) return null
  return (
    <section className="rounded-2xl border border-accent/40 bg-accent/5 p-4 mb-5 animate-fade-in">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-xs tracking-[0.2em] uppercase text-accent">{t('row')}</p>
        {/* Naar alle boekverfilmingen bij Zoeken, ook die niet op je diensten staan, met zoeken op titel of boek. */}
        <Link href="/onboarding?segment=boeken" className="text-xs text-accent hover:text-accent-hover transition-colors flex-shrink-0">
          {t('allBooks')} ›
        </Link>
      </div>
      <p className="text-sm text-muted mt-1 mb-3">{t('rowText')}</p>
      <PosterScroller items={items ?? []} loading={loading} onSelect={onSelect} />
    </section>
  )
}
