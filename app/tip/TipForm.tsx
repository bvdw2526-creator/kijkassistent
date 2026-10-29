'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { btnPrimary, btnSecondary, card, chip, input } from '../components/ui'
import { CloseIcon, HeartIcon, SearchIcon, UsersIcon } from '../components/Icons'
import { toggleServiceList } from '@/lib/serviceToggle'

// Het formulier en de uitkomst van de openbare tip (zie app/tip/page.tsx). Zelfde berekening voor "Voor mij" en
// "Voor ons samen"; alleen de teksten verschillen (messages/*.json, publicTip.mij en publicTip.samen).

type MediaType = 'movie' | 'tv'
type Mode = 'mij' | 'samen'

interface Hit {
  id: number
  title: string
  release_date?: string
  poster_path: string | null
  media_type: MediaType
}

interface TipItem {
  media_type: MediaType
  id: number
  title: string
  year: string
  poster_path: string | null
  vote_average: number
  overview: string
  genres: string[]
  providers: { name: string; logo_path: string | null }[]
  available: boolean
  closest: string
}

interface TipResult {
  inputs: { title: string }[]
  tip: TipItem | null
  alternatives: TipItem[]
}

const MAX_TITLES = 3
const MIN_TITLES = 2

// Pathé Thuis heeft een eigen tekst (huren, publicTip.patheRent), de rest heet overal hetzelfde. Ook gebruikt door de
// openbare videotheek (app/videotheek).
export const SERVICES: { id: string; label: string | null }[] = [
  { id: 'netflix', label: 'Netflix' },
  { id: 'videoland', label: 'Videoland' },
  { id: 'disney_plus', label: 'Disney+' },
  { id: 'amazon_prime', label: 'Prime Video' },
  { id: 'hbo_max', label: 'HBO Max' },
  { id: 'apple_tv', label: 'Apple TV' },
  { id: 'skyshowtime', label: 'SkyShowtime' },
  { id: 'viaplay', label: 'Viaplay' },
  { id: 'npo_start', label: 'NPO Start' },
  { id: 'npo_plus', label: 'NPO Plus' },
  { id: 'nlziet', label: 'NLZIET' },
  { id: 'pathe_thuis', label: null },
]

const yearOf = (d?: string) => (d ? d.slice(0, 4) : '')
const intlLocale = (locale: string) => (locale === 'en' ? 'en-GB' : 'nl-NL')

function Poster({ path, size, className }: { path: string | null; size: 'w92' | 'w342' | 'w500'; className: string }) {
  return (
    <span className={`relative block overflow-hidden bg-surface-2 ${className}`}>
      {path && <Image src={`https://image.tmdb.org/t/p/${size}${path}`} alt="" fill sizes="(max-width: 640px) 50vw, 240px" className="object-cover" />}
    </span>
  )
}

export default function TipForm() {
  const t = useTranslations('publicTip')
  const locale = useLocale()
  const [mode, setMode] = useState<Mode>('mij')
  const [chosen, setChosen] = useState<Hit[]>([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [searching, setSearching] = useState(false)
  const [services, setServices] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<TipResult | null>(null)
  const resultRef = useRef<HTMLDivElement>(null)

  const andList = (list: string[]) => new Intl.ListFormat(intlLocale(locale), { type: 'conjunction' }).format(list)
  const score = (n: number) => n.toLocaleString(intlLocale(locale), { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  // Zoeken tijdens het typen, met een korte pauze zodat niet elke toets een aanvraag is.
  useEffect(() => {
    // Onder twee tekens wordt de lijst niet getoond (zie hieronder), dus oude treffers hoeven niet gewist te worden.
    const q = query.trim()
    if (q.length < 2) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(`/api/public-search?query=${encodeURIComponent(q)}`, { signal: controller.signal })
        const data = await res.json()
        setHits(res.ok ? data.results ?? [] : [])
      } catch {
        // afgebroken of geen verbinding: gewoon geen resultaten
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const choose = (hit: Hit) => {
    setChosen((list) => (list.some((c) => c.id === hit.id && c.media_type === hit.media_type) ? list : [...list, hit].slice(0, MAX_TITLES)))
    setQuery('')
    setHits([])
    setResult(null)
  }

  const remove = (hit: Hit) => {
    setChosen((list) => list.filter((c) => !(c.id === hit.id && c.media_type === hit.media_type)))
    setResult(null)
  }

  const toggleService = (id: string) => setServices((list) => toggleServiceList(list, id))

  const ask = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/public-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles: chosen.map((c) => ({ media_type: c.media_type, id: c.id })), services, samen: mode === 'samen' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || t('error'))
      setResult(data)
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('error'))
    } finally {
      setLoading(false)
    }
  }

  const tip = result?.tip
  const names = result?.inputs.map((i) => i.title.replace(/\.$/, '')) ?? []

  return (
    <div>
      <h1 className="font-display text-3xl laptop:text-4xl leading-tight mb-3">{t('heading')}</h1>
      <p className="text-muted mb-6">{t(`${mode}.intro`)} {t('noAccount')}</p>

      {/* Voor wie */}
      <div className="flex gap-2 mb-8" role="radiogroup" aria-label={t('forWhom')}>
        <button type="button" role="radio" aria-checked={mode === 'mij'} onClick={() => { setMode('mij'); setResult(null) }} className={chip(mode === 'mij')}>
          <span className="inline-flex items-center gap-1.5"><HeartIcon className="w-4 h-4" />{t('forMe')}</span>
        </button>
        <button type="button" role="radio" aria-checked={mode === 'samen'} onClick={() => { setMode('samen'); setResult(null) }} className={chip(mode === 'samen')}>
          <span className="inline-flex items-center gap-1.5"><UsersIcon className="w-4 h-4" />{t('forUs')}</span>
        </button>
      </div>

      {/* Titels */}
      <h2 className="font-semibold mb-3">{t(`${mode}.ask`)}</h2>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {Array.from({ length: MAX_TITLES }, (_, i) => chosen[i]).map((c, i) =>
          c ? (
            <div key={`${c.media_type}-${c.id}`} className="relative">
              <Poster path={c.poster_path} size="w342" className="aspect-[2/3] rounded-xl border border-line" />
              <button
                type="button"
                onClick={() => remove(c)}
                aria-label={t('remove', { title: c.title })}
                className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 text-white inline-flex items-center justify-center"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
              <p className="text-xs mt-1.5 line-clamp-2">{c.title}</p>
            </div>
          ) : (
            <div key={`leeg-${i}`} className="aspect-[2/3] rounded-xl border border-dashed border-line flex items-center justify-center text-faint text-2xl">
              {i + 1}
            </div>
          )
        )}
      </div>

      {chosen.length < MAX_TITLES && (
        <div className="relative mb-6">
          <SearchIcon className="w-5 h-5 text-faint absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            className={`${input} pl-11`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={chosen.length === 0 ? t('searchFirst') : t('searchMore')}
            aria-label={t('searchFirst')}
            autoComplete="off"
          />
          {(hits.length > 0 || searching) && query.trim().length >= 2 && (
            <ul className={`${card} absolute z-20 left-0 right-0 mt-2 max-h-80 overflow-y-auto shadow-xl`}>
              {searching && hits.length === 0 && <li className="px-4 py-3 text-sm text-muted">{t('searching')}</li>}
              {hits.map((h) => (
                <li key={`${h.media_type}-${h.id}`}>
                  <button type="button" onClick={() => choose(h)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5">
                    <Poster path={h.poster_path} size="w92" className="w-9 h-[54px] rounded-md flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate">{h.title}</span>
                      <span className="block text-xs text-muted">
                        {h.media_type === 'tv' ? t('series') : t('film')}
                        {yearOf(h.release_date) && ` · ${yearOf(h.release_date)}`}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Diensten */}
      <h2 className="font-semibold mb-1">{t(`${mode}.services`)}</h2>
      <p className="text-sm text-muted mb-3">{t('servicesSkip')}</p>
      <div className="flex flex-wrap gap-2 mb-8">
        {SERVICES.map((s) => (
          <button key={s.id} type="button" onClick={() => toggleService(s.id)} aria-pressed={services.includes(s.id)} className={chip(services.includes(s.id), 'teal', 'sm')}>
            {s.label ?? t('patheRent')}
          </button>
        ))}
      </div>

      <button type="button" onClick={ask} disabled={chosen.length < MIN_TITLES || loading} className={`${btnPrimary} w-full sm:w-auto`}>
        {loading ? t('loading') : t(`${mode}.button`)}
      </button>
      {chosen.length < MIN_TITLES && <p className="text-sm text-faint mt-2">{t('minTitles', { min: MIN_TITLES })}</p>}
      {error && <p className="text-sm text-coral mt-3">{error}</p>}

      {/* Uitkomst */}
      {result && (
        <div ref={resultRef} className="mt-12 scroll-mt-6">
          {!tip ? (
            <p className="text-muted">{t('nothingFound')}</p>
          ) : (
            <>
              <p className="text-sm text-accent mb-2">{t(`${mode}.result`)}</p>
              <div className={`${card} p-4 sm:p-5 flex gap-4 sm:gap-6`}>
                <Poster path={tip.poster_path} size="w500" className="w-32 sm:w-44 aspect-[2/3] rounded-xl flex-shrink-0" />
                <div className="min-w-0">
                  <h2 className="font-display text-2xl sm:text-3xl leading-tight">{tip.title}</h2>
                  <p className="text-sm text-muted mt-1">
                    {[tip.media_type === 'tv' ? t('series') : t('film'), tip.year, tip.genres.join(', ')].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-sm mt-2">
                    <span className="inline-block rounded-md bg-accent text-on-accent font-semibold px-2 py-0.5 mr-2">
                      {score(tip.vote_average)}
                    </span>
                    <span className="text-muted">{t('atTmdb')}</span>
                  </p>
                  {tip.providers.length > 0 ? (
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-sm text-muted">{t('watchOn')}</span>
                      {tip.providers.map((p) =>
                        p.logo_path ? (
                          <Image key={p.name} src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} alt={p.name} title={p.name} width={28} height={28} className="rounded-md" />
                        ) : (
                          <span key={p.name} className="text-sm">{p.name}</span>
                        )
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted mt-3">{services.length ? t('notOnChosen') : t('notOnSubscription')}</p>
                  )}
                  <p className="text-sm mt-3">
                    {t.rich(`${mode}.fits`, {
                      names: andList(names),
                      closest: tip.closest.replace(/\.$/, ''),
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </p>
                </div>
              </div>
              {tip.overview && <p className="text-muted mt-4 leading-relaxed">{tip.overview}</p>}

              {result.alternatives.length > 0 && (
                <>
                  <h3 className="font-semibold mt-8 mb-3">{t('orMaybe')}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {result.alternatives.map((a) => (
                      <div key={`${a.media_type}-${a.id}`}>
                        <Poster path={a.poster_path} size="w342" className="aspect-[2/3] rounded-xl border border-line" />
                        <p className="text-sm font-medium mt-1.5 leading-snug">{a.title}</p>
                        <p className="text-xs text-muted">
                          {a.media_type === 'tv' ? `${t('series')} · ` : ''}
                          {a.year}
                          {a.providers[0] ? ` · ${a.providers[0].name}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className={`${card} p-5 mt-10`}>
                <h3 className="font-display text-xl mb-2">{t(`${mode}.cta`)}</h3>
                <p className="text-muted text-sm mb-4">{t(`${mode}.ctaText`)}</p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link href="/register" className={btnPrimary}>{t('createAccount')}</Link>
                  <button type="button" onClick={() => { setChosen([]); setResult(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className={btnSecondary}>
                    {t('anotherTip')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
