'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { authFetch } from '@/lib/supabase'
import { isHalloweenDay, isHalloweenSeason } from '@/lib/skins'
import { useSkin } from '@/lib/useSkin'
import MovieCard from './MovieCard'
import { chip } from './ui'
import { ChevronLeftIcon } from './Icons'

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
  // 'classic': uit de rij klassiekers op Halloween zelf; kan ook buiten je diensten staan.
  halloween: Flavour | 'classic'
}

// classics: alleen gevuld op Halloween zelf.
type Lists = Record<Flavour, HalloweenMovie[]> & { classics: HalloweenMovie[] }
// 'personal' = je eigen rij, 'samen' = de rij voor jullie twee (alleen met een gekoppelde partner).
export type HalloweenScope = 'personal' | 'samen'

const FLAVOURS: { id: Flavour; label: string }[] = [
  { id: 'scary', label: 'Griezelig' },
  { id: 'cozy', label: 'Gezellig eng' },
]

// Blijft staan zolang de app openstaat: bij het wisselen van tabblad wordt Voor jou opnieuw opgebouwd, en dan hoeft
// de rij niet opnieuw opgehaald te worden (zelfde reden als togetherSnapshot in app/page.tsx).
const cache = new Map<string, Lists>()

// Alleen bij het ontwikkelen: open de app één keer met ?halloweendag=1 om te doen alsof het 31 oktober is, en met
// ?halloweendag=0 om dat weer uit te zetten. Op de echte site doet dit niets.
const TEST_DAY_KEY = 'kijkassistent:halloweendag'
function isTestDay(): boolean {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return false
  try {
    const param = new URLSearchParams(window.location.search).get('halloweendag')
    if (param === '1') localStorage.setItem(TEST_DAY_KEY, '1')
    if (param === '0') localStorage.removeItem(TEST_DAY_KEY)
    return localStorage.getItem(TEST_DAY_KEY) === '1'
  } catch {
    return false
  }
}

// De Halloween-rij van deze gebruiker, alleen met de Halloween-skin aan en in het seizoen (zie isHalloweenSeason).
// Op Halloween zelf (`day`) is het geen rij maar het hele aanbod op Voor jou: de lijsten zijn dan veel langer en bevatten
// ook uitgesloten genres (zie ?dag=1 in app/api/halloween).
// `remove` haalt een titel eruit zodra je hem hebt beoordeeld, op een lijst gezet of verborgen; `reload` haalt de rij
// opnieuw op (bij Vernieuwen), bv. nadat je bij Instellingen horror hebt toegestaan of uitgesloten.
export function useHalloweenLists(userId: string | null, scope: HalloweenScope | null) {
  const skin = useSkin()
  const active = skin === 'halloween' && isHalloweenSeason()
  const [loaded, setLoaded] = useState<Record<string, Lists>>(() => Object.fromEntries(cache))
  // Altijd uitlezen, ook met een andere skin aan: zo onthoudt de testschakelaar de keuze voor als de skin later aangaat.
  const testDay = isTestDay()
  const day = active && (isHalloweenDay() || testDay)
  const keyOf = (s: HalloweenScope) => `${userId}:${s}:${day ? 'dag' : 'rij'}`
  const key = active && userId && scope ? keyOf(scope) : null
  const known = key ? loaded[key] : undefined

  useEffect(() => {
    if (!key || known) return
    let cancelled = false
    const params = [scope === 'samen' ? 'samen=1' : '', day ? 'dag=1' : ''].filter(Boolean).join('&')
    authFetch(`/api/halloween${params ? `?${params}` : ''}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled || data.error) return
        const lists: Lists = { scary: data.scary || [], cozy: data.cozy || [], classics: data.classics || [] }
        cache.set(key, lists)
        setLoaded((current) => ({ ...current, [key]: lists }))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [key, known, scope, day])

  function remove(match: (m: { id: number; media_type: 'movie' | 'tv' }) => boolean, scopes: HalloweenScope[]) {
    if (!userId) return
    setLoaded((current) => {
      const next = { ...current }
      for (const s of scopes) {
        const lists = next[keyOf(s)]
        if (!lists) continue
        const keep = (list: HalloweenMovie[]) => list.filter((m) => !match(m))
        const filtered: Lists = { scary: keep(lists.scary), cozy: keep(lists.cozy), classics: keep(lists.classics) }
        next[keyOf(s)] = filtered
        cache.set(keyOf(s), filtered)
      }
      return next
    })
  }

  function reload() {
    if (!userId) return
    const keys = (['personal', 'samen'] as const).map(keyOf)
    keys.forEach((k) => cache.delete(k))
    setLoaded((current) => Object.fromEntries(Object.entries(current).filter(([k]) => !keys.includes(k))))
  }

  return { active, day, lists: known ?? null, loading: !!key && !known, remove, reload }
}

// Een rij posters waar je opzij doorheen veegt. Met een muis kan dat niet: dan staan er pijltjes op de rij, alleen aan de
// kant waar nog titels buiten beeld zijn. Bedoeld binnen een blok met p-4 (de rij loopt door tot de rand van dat blok).
function PosterScroller({
  items,
  loading = false,
  onSelect,
}: {
  items: HalloweenMovie[]
  loading?: boolean
  onSelect: (movie: HalloweenMovie) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  function updateMore() {
    const el = scroller.current
    if (!el) return
    const next = { left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 }
    setMore((current) => (current.left === next.left && current.right === next.right ? current : next))
  }
  // Andere titels in de rij (een andere smaak, of er is er een uit): dan opnieuw kijken waar pijltjes nodig zijn.
  const contentKey = items.map((m) => `${m.media_type}-${m.id}`).join(',')
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    // Meldt zich meteen bij het aankoppelen, en daarna als de rij breder of smaller wordt.
    const observer = new ResizeObserver(updateMore)
    observer.observe(el)
    return () => observer.disconnect()
  }, [contentKey])
  function scrollBy(direction: 1 | -1) {
    const el = scroller.current
    el?.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }
  const arrow =
    'absolute top-1/2 -translate-y-1/2 z-10 hidden [@media(pointer:fine)]:flex h-9 w-9 items-center justify-center rounded-full border border-line bg-background/85 text-foreground shadow-lg hover:border-accent hover:text-accent transition-colors'

  return (
    <div className="relative -mx-4">
      {more.left && (
        <button onClick={() => scrollBy(-1)} aria-label="Vorige titels" className={`${arrow} left-2`}>
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
      )}
      {more.right && (
        <button onClick={() => scrollBy(1)} aria-label="Volgende titels" className={`${arrow} right-2`}>
          <ChevronLeftIcon className="w-4 h-4 rotate-180" />
        </button>
      )}
      <div ref={scroller} onScroll={updateMore} className="flex gap-3 overflow-x-auto no-scrollbar px-4">
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
    </div>
  )
}

// Op Halloween zelf: de uitleg boven de lijst.
export function HalloweenDayHeader({ together }: { together: boolean }) {
  return (
    <section className="rounded-2xl border border-accent/40 bg-accent/5 p-4 mb-5 animate-fade-in">
      <p className="font-display text-xs tracking-[0.2em] uppercase text-accent">Het is Halloween</p>
      <p className="text-sm text-muted mt-1 leading-relaxed laptop:max-w-2xl">
        Vandaag staan hier alleen Halloween-titels{together ? ' voor jullie twee' : ''}, ook uit genres die je anders uitsluit. Morgen
        staat je gewone advies er weer. Liever nu al? Zet de Halloween-skin uit bij{' '}
        <Link href="/settings" className="text-accent hover:text-accent-hover transition-colors">
          Instellingen
        </Link>
        .
      </p>
    </section>
  )
}

// Op Halloween zelf: de films die bij Halloween horen (zie HALLOWEEN_CLASSIC_IDS in lib/halloween.ts), ook als ze niet op
// je diensten staan. Onder elke titel staat waar hij te zien is.
export function HalloweenClassics({
  items,
  together,
  onSelect,
}: {
  items: HalloweenMovie[]
  together: boolean
  onSelect: (movie: HalloweenMovie) => void
}) {
  if (items.length === 0) return null
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 mb-5 animate-fade-in">
      <p className="font-display text-xs tracking-[0.2em] uppercase text-accent">Halloween-klassiekers</p>
      <p className="text-sm text-muted mt-1 mb-3">
        De films die bij Halloween horen, ook als ze niet op {together ? 'jullie' : 'jouw'} diensten staan. Eronder zie je waar je ze kunt kijken.
      </p>
      <PosterScroller items={items} onSelect={onSelect} />
    </section>
  )
}

// Op Halloween zelf: de keuze tussen de twee smaken, direct boven de lijst. "Gezellig eng" staat voorop, zodat wie horror
// anders uitsluit niet meteen de engste posters ziet.
export const DAY_FLAVOURS: { id: Flavour; label: string }[] = [
  { id: 'cozy', label: 'Gezellig eng' },
  { id: 'scary', label: 'Griezelig' },
]

export function HalloweenDayFlavours({
  flavours,
  chosen,
  onChoose,
}: {
  // De smaken waar nog titels in staan.
  flavours: Flavour[]
  chosen: Flavour | undefined
  onChoose: (flavour: Flavour) => void
}) {
  if (flavours.length < 2) return null
  return (
    <div className="flex gap-2 mb-4">
      {DAY_FLAVOURS.filter((f) => flavours.includes(f.id)).map((f) => (
        <button key={f.id} onClick={() => onChoose(f.id)} className={chip(chosen === f.id)}>
          {f.label}
        </button>
      ))}
    </div>
  )
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

      <PosterScroller items={items} loading={loading} onSelect={onSelect} />
    </section>
  )
}
