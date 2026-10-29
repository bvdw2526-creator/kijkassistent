'use client'

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { btnPrimary, chip } from '../components/ui'
import { CloseIcon } from '../components/Icons'
import LegalLinks from '../components/LegalLinks'
import { AisleCount, AisleSection, ShelfSlot } from '../components/VideotheekAisles'
import VhsCase, { type VhsLabel } from '../components/VhsCase'
import { useBackToClose } from '../components/useBackToClose'
import { SERVICES } from '../tip/TipForm'
import { REGISTER_FROM_VIDEOTHEEK, VIDEOTHEEK_COUNTED_KEY, aisleFor, type Aisle, type VideotheekStep } from '@/lib/videotheek'
import { toggleServiceList } from '@/lib/serviceToggle'

// De winkel van de openbare videotheek (zie app/videotheek/page.tsx): diensten aantikken, films of series, en dan door de
// gangpaden lopen. Een doosje omdraaien toont de achterkant met een uitnodiging voor een account.

type MediaType = 'movie' | 'tv'

interface StoreItem {
  id: number
  media_type: MediaType
  title: string
  poster_path: string | null
  overview: string
  genre_ids: number[]
  release_date: string
  vote_average: number
  watchOn?: string
}

// Welke diensten de bezoeker aantikte, alleen in deze browser (geen account, niets naar de server behalve de vraag zelf).
// Uitgelezen zoals de skin (lib/useSkin.ts): als tekst, zodat React ziet dat er niets veranderd is zolang de tekst gelijk
// blijft. Lukt opslaan niet (bv. privévenster), dan geldt de keuze in het geheugen tot je de pagina verlaat.
const SERVICES_KEY = 'kijkassistent:videotheek-diensten'
const SERVICES_CHANGED_EVENT = 'kijkassistent:videotheek-diensten-gewijzigd'
let servicesInMemory = '[]'

function readServicesRaw(): string {
  try {
    return localStorage.getItem(SERVICES_KEY) ?? servicesInMemory
  } catch {
    return servicesInMemory
  }
}

function parseServices(raw: string): string[] {
  try {
    const stored = JSON.parse(raw)
    return Array.isArray(stored) ? stored.filter((s) => SERVICES.some((x) => x.id === s)) : []
  } catch {
    return []
  }
}

function subscribeServices(onChange: () => void) {
  window.addEventListener(SERVICES_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(SERVICES_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function saveServices(next: string[]) {
  servicesInMemory = JSON.stringify(next)
  try {
    localStorage.setItem(SERVICES_KEY, servicesInMemory)
  } catch {
    // Niet kunnen bewaren is niet erg: zie servicesInMemory.
  }
  window.dispatchEvent(new Event(SERVICES_CHANGED_EVENT))
}

// Telt een stap van de trechter (zie app/api/public-videotheek/count), hooguit één keer per browser per Amsterdamse
// dag. De browser onthoudt alleen welke stappen vandaag al geteld zijn; lukt onthouden niet (bv. privévenster met
// geblokkeerde opslag), dan telt hij hooguit één keer zolang de pagina openstaat.
const countedThisPage = new Set<VideotheekStep>()
function countStep(step: VideotheekStep) {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
  let counted: VideotheekStep[] = []
  try {
    const stored = JSON.parse(localStorage.getItem(VIDEOTHEEK_COUNTED_KEY) ?? 'null')
    if (stored?.day === today && Array.isArray(stored.steps)) counted = stored.steps
  } catch {
    // Niets onthouden: zie countedThisPage.
  }
  if (counted.includes(step) || countedThisPage.has(step)) return
  countedThisPage.add(step)
  try {
    localStorage.setItem(VIDEOTHEEK_COUNTED_KEY, JSON.stringify({ day: today, steps: [...counted, step] }))
  } catch {
    // Zie hierboven.
  }
  // keepalive: ook na een klik op "account maken" gaat de telling nog weg, terwijl de pagina al wisselt.
  fetch('/api/public-videotheek/count', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step }),
    keepalive: true,
  }).catch(() => {})
}

export default function VideotheekStore() {
  const t = useTranslations('publicVideotheek')
  const tp = useTranslations('publicTip')
  const tv = useTranslations('videotheek')
  const common = useTranslations('common')
  // Op de server (en bij het eerste tekenen) null: dan weten we de keuze nog niet en halen we nog niets op.
  const servicesRaw = useSyncExternalStore(subscribeServices, readServicesRaw, () => null)
  const services = useMemo(() => (servicesRaw === null ? null : parseServices(servicesRaw)), [servicesRaw])
  const [mediaType, setMediaType] = useState<MediaType>('movie')
  const [result, setResult] = useState<{ key: string; items: StoreItem[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<{ item: StoreItem; vhs: VhsLabel } | null>(null)
  useBackToClose(selected !== null, () => setSelected(null))

  // Stap 1 van de trechter: een bezoek.
  useEffect(() => {
    countStep('bezoek')
  }, [])

  function toggleService(id: string) {
    const current = services ?? []
    saveServices(toggleServiceList(current, id))
  }

  const requestKey = services === null ? null : `${mediaType}|${[...services].sort().join(',')}`

  // Een nieuwe lijst bij een andere dienst of bij wisselen tussen films en series. Even wachten, zodat drie diensten
  // achter elkaar aantikken één vraag wordt.
  useEffect(() => {
    if (!requestKey) return
    const controller = new AbortController()
    const [type, list] = requestKey.split('|')
    const timer = setTimeout(() => {
      setError(null)
      fetch(`/api/public-videotheek?type=${type}&services=${encodeURIComponent(list)}`, { signal: controller.signal })
        .then(async (res) => {
          const data = await res.json()
          if (!res.ok || data.error) throw new Error(data.error || t('errLoad'))
          setResult({ key: requestKey, items: data.items || [] })
        })
        .catch((err) => {
          if (controller.signal.aborted) return
          setError(err instanceof Error ? err.message : t('errLoad'))
        })
    }, 350)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [requestKey, t])

  // Het gangpad van een titel, voor op de achterkant (bij een titel uit "Meer zoals deze", die niet uit een schap komt).
  const labelFor = (item: StoreItem): VhsLabel => {
    const aisle = aisleFor(item.genre_ids)
    return { text: tv(`aisle_${aisle.id}`), sign: aisle.sign, ink: aisle.ink }
  }

  const loading = requestKey !== null && result?.key !== requestKey && !error
  const items = result?.items ?? []

  return (
    <main className="max-w-xl laptop:max-w-5xl mx-auto px-5 pt-6 pb-16">
      <header className="flex items-center justify-between mb-6">
        <Link href="/" className="font-display text-sm tracking-[0.2em] uppercase text-accent">
          Kijkassistent
        </Link>
        <Link href="/login" className="text-sm text-muted hover:text-foreground transition-colors">
          {common('login')}
        </Link>
      </header>

      {/* De lichtbak boven de ingang. */}
      <div className="text-center mb-6">
        <h1 className="inline-block -rotate-2 rounded-md bg-accent px-6 py-1.5 font-display text-3xl uppercase tracking-[0.14em] text-on-accent">
          {t('sign')}
        </h1>
        <p className="text-sm text-muted mt-4 leading-relaxed">{t('tagline')}</p>
      </div>

      <Counter />

      <section className="mb-5">
        <p className="text-sm font-medium mb-1">{t('servicesTitle')}</p>
        <p className="text-xs text-muted mb-2.5">{t('servicesHint')}</p>
        <div className="flex flex-wrap gap-1.5">
          {SERVICES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleService(s.id)}
              aria-pressed={services?.includes(s.id) ?? false}
              className={chip(services?.includes(s.id) ?? false, 'teal', 'sm')}
            >
              {s.label ?? tp('patheRent')}
            </button>
          ))}
        </div>
      </section>

      <div className="flex gap-1 p-1 rounded-full bg-surface border border-line w-fit mb-6">
        {(['movie', 'tv'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setMediaType(type)}
            className={`px-4 py-1.5 text-sm font-medium rounded-full transition-all touch-manipulation ${
              mediaType === type ? 'bg-accent text-on-accent' : 'text-muted'
            }`}
          >
            {type === 'movie' ? t('films') : t('series')}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-coral border border-coral/40 bg-coral/5 rounded-xl px-4 py-3 mb-5">{error}</p>}

      {loading && <ShelfSkeleton />}

      {!loading && !error && result && items.length === 0 && (
        <p className="text-muted border border-dashed border-line rounded-2xl px-4 py-10 text-center leading-relaxed">{t('empty')}</p>
      )}

      {!loading && items.length > 0 && (
        <div key={result?.key} className="animate-fade-in">
          <p className="text-sm text-muted mb-4">{t('intro')}</p>
          {groupByAisle(items).map(({ aisle, items: shelf }, i) => (
            <StoreAisle
              key={aisle.id}
              aisle={aisle}
              label={tv(`aisle_${aisle.id}`)}
              popular={shelf}
              mediaType={mediaType}
              services={services ?? []}
              priority={i === 0}
              onOpen={(item, vhs) => {
                countStep('omgedraaid')
                setSelected({ item, vhs })
              }}
            />
          ))}
        </div>
      )}

      {/* Onderaan alleen een verwijzing terug naar de balie bij de ingang. */}
      {!loading && items.length > 0 && (
        <p className="text-sm text-muted text-center mt-2">
          {t.rich('counterBack', {
            link: (chunks) => (
              <a href="#balie" className="text-accent underline underline-offset-2 hover:text-accent-hover">
                {chunks}
              </a>
            ),
          })}
        </p>
      )}

      <LegalLinks className="mt-12" />

      {selected && (
        <BackOfBox
          // Een ander doosje (via "Meer zoals deze"): opnieuw opbouwen, zodat de popup weer bovenaan begint.
          key={`${selected.item.media_type}-${selected.item.id}`}
          item={selected.item}
          vhs={selected.vhs}
          services={services ?? []}
          onOpen={(item) => setSelected({ item, vhs: labelFor(item) })}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  )
}

// De balie, bovenaan bij de ingang: waar je vroeger om advies vroeg. Compact, zodat de schappen op een telefoon snel in
// beeld komen. Het blad van de toonbank is de houten rand onderaan, in dezelfde kleur als de planken.
function Counter() {
  const t = useTranslations('publicVideotheek')
  const button = 'inline-flex items-center justify-center rounded-full px-3 py-2.5 text-sm font-semibold text-center leading-tight active:scale-[0.97] transition-all touch-manipulation'
  return (
    <section id="balie" className="scroll-mt-6 mb-6 rounded-t-xl border-2 border-b-0 border-accent/60 bg-surface">
      <div className="px-4 pt-3.5 pb-4 text-center">
        <p className="font-display text-lg uppercase tracking-[0.14em] text-accent">{t('counterTitle')}</p>
        <p className="text-sm text-muted mt-1 leading-snug">{t('counterText')}</p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Link href="/tip" className={`${button} bg-accent text-on-accent hover:bg-accent-hover`}>
            {t('counterTip')}
          </Link>
          <Link href={REGISTER_FROM_VIDEOTHEEK} onClick={() => countStep('accountklik')} className={`${button} border border-line bg-surface-2 text-foreground hover:border-line-strong`}>
            {t('counterAccountShort')}
          </Link>
        </div>
      </div>
      <div className="h-3 rounded-b-sm bg-[#8A5A2B] border-b-4 border-[#5C3A1A] -mx-[2px]" aria-hidden="true" />
    </section>
  )
}

// De achterkant van het doosje: wat er op de hoes staat, meer zoals deze, en de vraag of hij bij je past.
function BackOfBox({
  item,
  vhs,
  services,
  onOpen,
  onClose,
}: {
  item: StoreItem
  vhs: VhsLabel
  services: string[]
  onOpen: (item: StoreItem) => void
  onClose: () => void
}) {
  const t = useTranslations('publicVideotheek')
  const tt = useTranslations('title')
  const locale = useLocale()
  const year = item.release_date.slice(0, 4)
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-line bg-surface p-5 animate-sheet-up"
      >
        <div className="flex justify-end">
          <button onClick={onClose} aria-label={tt('close')} className="rounded-full p-2 text-muted hover:text-foreground hover:bg-white/5">
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-4">
          <div className="relative w-24 aspect-[2/3] flex-shrink-0 overflow-hidden rounded-[3px] border-[3px] border-[#111214] bg-surface-2">
            {item.poster_path && (
              <Image src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.title} fill sizes="96px" className="object-cover" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-2xl leading-tight">{item.title}</h2>
            <p className="text-sm text-muted mt-1">
              {item.media_type === 'tv' ? tt('series') : tt('film')}
              {year ? ` · ${year}` : ''}
              {item.vote_average > 0
                ? ` · ★ ${item.vote_average.toLocaleString(locale === 'en' ? 'en-GB' : 'nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
                : ''}
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <span className="rounded-[2px] px-1.5 py-0.5 text-[11px] font-semibold uppercase" style={{ backgroundColor: vhs.sign, color: vhs.ink }}>
                {vhs.text}
              </span>
              {item.watchOn && <span className="bg-accent px-1.5 py-0.5 text-[11px] font-semibold uppercase text-on-accent">{item.watchOn}</span>}
            </div>
          </div>
        </div>
        {item.overview && <p className="text-sm text-foreground/85 leading-relaxed mt-4">{item.overview}</p>}

        <SimilarRow item={item} services={services} onOpen={onOpen} />

        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-4 mt-5">
          <p className="text-sm font-semibold text-accent">{t('fitQuestion')}</p>
          <p className="text-sm text-muted mt-1 leading-relaxed">{t('fitText')}</p>
          <Link href={REGISTER_FROM_VIDEOTHEEK} onClick={() => countStep('accountklik')} className={`${btnPrimary} w-full mt-3`}>
            {t('counterAccount')}
          </Link>
        </div>
      </div>
    </div>
  )
}

// De schappen komen per gangpad op volgorde binnen (zie app/api/public-videotheek); hier per gangpad bij elkaar.
function groupByAisle(items: StoreItem[]): { aisle: Aisle; items: StoreItem[] }[] {
  const groups: { aisle: Aisle; items: StoreItem[] }[] = []
  for (const item of items) {
    const aisle = aisleFor(item.genre_ids)
    const group = groups.find((g) => g.aisle.id === aisle.id)
    if (group) group.items.push(item)
    else groups.push({ aisle, items: [item] })
  }
  return groups
}

type ShelfSort = 'popular' | 'new' | 'top'
const SHELF_SORTS: { id: ShelfSort; label: string }[] = [
  { id: 'popular', label: 'sortPopular' },
  { id: 'new', label: 'sortNew' },
  { id: 'top', label: 'sortTop' },
]

// Blijft staan zolang de pagina openstaat: terugwisselen naar Nieuw binnen of Top 10 hoeft niet opnieuw te vragen.
const shelfCache = new Map<string, StoreItem[]>()

// Eén gangpad van de openbare videotheek, met onder het bord de keuze Populair / Nieuw binnen / Top 10. Populair komt
// mee met de hele winkel; de andere twee worden pas opgehaald als je erop tikt.
function StoreAisle({
  aisle,
  label,
  popular,
  mediaType,
  services,
  priority,
  onOpen,
}: {
  aisle: Aisle
  label: string
  popular: StoreItem[]
  mediaType: MediaType
  services: string[]
  priority: boolean
  onOpen: (item: StoreItem, vhs: VhsLabel) => void
}) {
  const t = useTranslations('publicVideotheek')
  const [sort, setSort] = useState<ShelfSort>('popular')
  const query = `type=${mediaType}&aisle=${aisle.id}&sort=${sort}&services=${encodeURIComponent([...services].sort().join(','))}`
  const [loaded, setLoaded] = useState<{ query: string; items: StoreItem[] | null } | null>(null)

  useEffect(() => {
    if (sort === 'popular' || shelfCache.has(query)) return
    let cancelled = false
    fetch(`/api/public-videotheek?${query}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok || data.error) throw new Error(data.error)
        shelfCache.set(query, data.items || [])
        if (!cancelled) setLoaded({ query, items: data.items || [] })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ query, items: null })
      })
    return () => {
      cancelled = true
    }
  }, [query, sort])

  const shelf = sort === 'popular' ? popular : (shelfCache.get(query) ?? (loaded?.query === query ? loaded.items : undefined))
  const state = shelf === undefined ? 'loading' : shelf === null ? 'failed' : 'done'
  const vhs: VhsLabel = { text: label, sign: aisle.sign, ink: aisle.ink }

  const below = (
    <>
      <div role="tablist" aria-label={t('sortLabel', { aisle: label })} className="flex justify-center gap-1.5 mt-3">
        {SHELF_SORTS.map((s) => (
          <button key={s.id} role="tab" aria-selected={sort === s.id} onClick={() => setSort(s.id)} className={chip(sort === s.id, 'accent', 'sm')}>
            {t(s.label)}
          </button>
        ))}
      </div>
      {state === 'done' && shelf && shelf.length > 0 && <AisleCount count={shelf.length} />}
    </>
  )

  return (
    <AisleSection aisle={aisle} label={label} below={below}>
      {state === 'loading' &&
        Array.from({ length: 4 }).map((_, i) => (
          <ShelfSlot key={i}>
            <div className="aspect-[2/3] rounded-[3px] bg-surface animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
          </ShelfSlot>
        ))}
      {state === 'failed' && <p className="text-sm text-muted py-6">{t('errLoad')}</p>}
      {state === 'done' && shelf && shelf.length === 0 && (
        <p className="text-sm text-muted py-6 leading-relaxed">{t(sort === 'new' ? 'emptyNew' : 'emptyTop')}</p>
      )}
      {state === 'done' &&
        shelf?.map((item, i) => (
          <ShelfSlot key={`${item.media_type}-${item.id}`}>
            <VhsCase
              movie={item}
              vhs={vhs}
              rating={item.vote_average}
              rank={sort === 'top' ? i + 1 : undefined}
              priority={priority && i < 4}
              onClick={() => onOpen(item, vhs)}
            />
          </ShelfSlot>
        ))}
    </AisleSection>
  )
}

// Blijft staan zolang de pagina openstaat: een doosje opnieuw omdraaien hoeft niet opnieuw te vragen.
const similarCache = new Map<string, StoreItem[]>()

// "Meer zoals deze" op de achterkant: TMDB's "lijkt hierop", op de gekozen diensten (zie app/api/public-videotheek/similar).
// Op een titel tikken draait dat doosje om.
function SimilarRow({ item, services, onOpen }: { item: StoreItem; services: string[]; onOpen: (item: StoreItem) => void }) {
  const t = useTranslations('publicVideotheek')
  const query = `type=${item.media_type}&id=${item.id}&services=${encodeURIComponent([...services].sort().join(','))}`
  const [loaded, setLoaded] = useState<{ query: string; items: StoreItem[] | null } | null>(() =>
    similarCache.has(query) ? { query, items: similarCache.get(query)! } : null
  )
  const state = loaded?.query !== query ? 'loading' : loaded.items === null ? 'failed' : 'done'

  useEffect(() => {
    if (similarCache.has(query)) return
    let cancelled = false
    fetch(`/api/public-videotheek/similar?${query}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok || data.error) throw new Error(data.error)
        similarCache.set(query, data.items || [])
        if (!cancelled) setLoaded({ query, items: data.items || [] })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ query, items: null })
      })
    return () => {
      cancelled = true
    }
  }, [query])

  const items = state === 'done' ? (loaded?.items ?? []) : []
  return (
    <section className="mt-5">
      <p className="text-sm font-medium mb-2">{t('similarHeading', { title: item.title })}</p>
      {state === 'loading' && (
        <div className="flex gap-3 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="w-24 flex-shrink-0 aspect-[2/3] rounded-[3px] bg-surface-2 animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      )}
      {state === 'failed' && <p className="text-sm text-muted">{t('similarFailed')}</p>}
      {state === 'done' && items.length === 0 && <p className="text-sm text-muted leading-relaxed">{t('similarNone')}</p>}
      {items.length > 0 && (
        <div className="-mx-5 flex items-start gap-3 overflow-x-auto no-scrollbar px-5 pb-1">
          {items.map((tip) => (
            <button
              key={`${tip.media_type}-${tip.id}`}
              onClick={() => onOpen(tip)}
              className="w-24 flex-shrink-0 text-left touch-manipulation active:scale-[0.97] transition-transform"
            >
              <span className="relative block aspect-[2/3] overflow-hidden rounded-[3px] border-[3px] border-[#111214] bg-surface-2">
                {tip.poster_path && (
                  <Image src={`https://image.tmdb.org/t/p/w200${tip.poster_path}`} alt={tip.title} fill sizes="96px" className="object-cover" />
                )}
              </span>
              <span className="block text-xs font-medium mt-1.5 leading-tight line-clamp-2">{tip.title}</span>
              {tip.watchOn && <span className="block text-[11px] text-accent mt-0.5 truncate">{tip.watchOn}</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

// Lege planken terwijl de lijst laadt.
function ShelfSkeleton() {
  return (
    <div aria-hidden="true">
      {[0, 1].map((shelf) => (
        <div key={shelf} className="mb-8">
          <div className="mx-auto h-10 w-1/2 rounded-md bg-surface animate-skeleton" />
          <div className="flex gap-3 mt-5 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="w-32 flex-shrink-0 aspect-[2/3] rounded-[3px] bg-surface animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
          <div className="mt-1 h-2.5 rounded-sm bg-[#8A5A2B]/60" />
        </div>
      ))}
    </div>
  )
}
