'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/supabase'
import { isHalloweenSeason } from '@/lib/skins'
import { useSkin } from '@/lib/useSkin'
import MovieCard from './MovieCard'
import { chip } from './ui'

type Flavour = 'scary' | 'cozy'

// Zelfde vorm als een aanbeveling op Voor jou, zodat de gewone popup (kijklijst, beoordelen, verbergen) ermee werkt.
export type HalloweenMovie = {
  id: number
  title: string
  poster_path: string | null
  vote_average: number
  score: number
  matchPercent: number
  watchOn?: string
  watchUrl?: string
  media_type: 'movie' | 'tv'
  overview?: string
  basedOn?: string[]
  genre_ids?: number[]
  release_date?: string
  halloween: Flavour
}

type Lists = Record<Flavour, HalloweenMovie[]>
// 'personal' = je eigen rij, 'samen' = de rij voor jullie twee (alleen met een gekoppelde partner).
export type HalloweenScope = 'personal' | 'samen'

const FLAVOURS: { id: Flavour; label: string }[] = [
  { id: 'scary', label: 'Griezelig' },
  { id: 'cozy', label: 'Gezellig eng' },
]

// Blijft staan zolang de app openstaat: bij het wisselen van tabblad wordt Voor jou opnieuw opgebouwd, en dan hoeft
// de rij niet opnieuw opgehaald te worden (zelfde reden als togetherSnapshot in app/page.tsx).
const cache = new Map<string, Lists>()

// De Halloween-rij van deze gebruiker, alleen met de Halloween-skin aan en in het seizoen (zie isHalloweenSeason).
// `remove` haalt een titel eruit zodra je hem hebt beoordeeld, op een lijst gezet of verborgen.
export function useHalloweenLists(userId: string | null, scope: HalloweenScope | null) {
  const skin = useSkin()
  const active = skin === 'halloween' && isHalloweenSeason()
  const [loaded, setLoaded] = useState<Record<string, Lists>>(() => Object.fromEntries(cache))
  const key = active && userId && scope ? `${userId}:${scope}` : null
  const known = key ? loaded[key] : undefined

  useEffect(() => {
    if (!key || known) return
    let cancelled = false
    authFetch(`/api/halloween${scope === 'samen' ? '?samen=1' : ''}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data.error) return
        const lists: Lists = { scary: data.scary || [], cozy: data.cozy || [] }
        cache.set(key, lists)
        setLoaded((current) => ({ ...current, [key]: lists }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [key, known, scope])

  function remove(match: (m: { id: number; media_type: 'movie' | 'tv' }) => boolean, scopes: HalloweenScope[]) {
    if (!userId) return
    setLoaded((current) => {
      const next = { ...current }
      for (const s of scopes) {
        const lists = next[`${userId}:${s}`]
        if (!lists) continue
        const filtered: Lists = { scary: lists.scary.filter((m) => !match(m)), cozy: lists.cozy.filter((m) => !match(m)) }
        next[`${userId}:${s}`] = filtered
        cache.set(`${userId}:${s}`, filtered)
      }
      return next
    })
  }

  return { active, lists: known ?? null, loading: !!key && !known, remove }
}

// Rij Halloween-titels op Voor jou, los van de gewone aanbevelingen. Zonder percentage: de volgorde is op smaak, maar
// het is geen gewone match.
export default function HalloweenRow({
  lists,
  loading,
  together,
  onSelect,
}: {
  lists: Lists | null
  loading: boolean
  together: boolean
  onSelect: (movie: HalloweenMovie) => void
}) {
  const [chosen, setChosen] = useState<Flavour>('scary')
  const available = FLAVOURS.filter((f) => (lists?.[f.id].length ?? 0) > 0)
  if (!loading && available.length === 0) return null
  // Is de gekozen smaak leeg (bv. horror uitgesloten, of alles al gezien), dan de andere.
  const flavour = available.some((f) => f.id === chosen) ? chosen : available[0]?.id
  const items = flavour && lists ? lists[flavour] : []

  return (
    <section className="rounded-2xl border border-accent/40 bg-accent/5 p-4 mb-5 animate-fade-in">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-display text-xs tracking-[0.2em] uppercase text-accent">Halloween-avond{together ? ' samen' : ''}</p>
        <p className="text-[11px] text-muted flex-shrink-0">t/m 1 november</p>
      </div>
      <p className="text-sm text-muted mt-1 mb-3">
        {together ? 'Te zien op jullie diensten; wat bij jullie allebei past staat vooraan.' : 'Te zien op jouw diensten; wat het best bij je past staat vooraan.'}
      </p>

      {available.length > 1 && (
        <div className="flex gap-1.5 mb-3">
          {available.map((f) => (
            <button key={f.id} onClick={() => setChosen(f.id)} className={chip(flavour === f.id, 'accent', 'sm')}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-28 flex-shrink-0 aspect-[2/3] rounded-xl bg-surface animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
            ))
          : items.map((movie) => (
              <div key={`${movie.media_type}-${movie.id}`} className="grid w-28 flex-shrink-0">
                <MovieCard movie={movie} hideMatch badge={movie.media_type === 'tv' ? 'Serie' : undefined} onClick={() => onSelect(movie)} />
              </div>
            ))}
      </div>
    </section>
  )
}
