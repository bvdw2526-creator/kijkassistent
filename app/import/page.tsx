'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { supabase, getCurrentUser, authFetch } from '@/lib/supabase'
import BottomNav from '../components/BottomNav'
import { btnPrimary, btnGhost, card } from '../components/ui'
import {
  DEFAULT_STAR_MAP,
  STAR_VALUES,
  readLetterboxdFile,
  starKey,
  type LbExport,
  type LbFilm,
  type StarAction,
} from '@/lib/letterboxd'

type Step = 'file' | 'mapping' | 'matching' | 'review' | 'importing' | 'done'
type Action = StarAction | 'watchlist'
type Match = { id: number; title: string; poster_path: string | null; release_date: string | null }
type Target = { film: LbFilm; action: Exclude<Action, 'skip'> }
type Existing = { ratings: Set<string>; favorites: Set<string>; watchlist: Set<string> }
type Summary = { ratings: number; favorites: number; watchlist: number; warmFailed: number }

const MATCH_BATCH = 25
const MATCH_CONCURRENCY = 3
const WARM_BATCH = 25
const WARM_CONCURRENCY = 2
const WRITE_BATCH = 200
// Zelfde plafond als de aanbevelingsberekening (zie MAX_*_SOURCES in recommendationEngine.ts):
// alleen de titels die daadwerkelijk als smaakbron meetellen hoeven vooraf ingelezen te worden.
const WARM_LIMITS = { favorite: 100, love: 150, ok: 100 } as const

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function toTimestamp(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : new Date().toISOString().slice(0, 19)
}

// Het getal bij "x sterren", bv. 3½.
function starsNumber(stars: number): string {
  const whole = Math.floor(stars)
  return `${whole > 0 ? whole : ''}${stars % 1 ? '½' : ''}`
}

// Sleutels onder "import" in messages/*.json.
const ACTION_KEYS: Record<StarAction, 'actionDislike' | 'actionOk' | 'actionLove' | 'actionFavorite' | 'actionSkip'> = {
  dislike: 'actionDislike',
  ok: 'actionOk',
  love: 'actionLove',
  favorite: 'actionFavorite',
  skip: 'actionSkip',
}

const selectClass =
  'rounded-xl border border-line bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent w-52'

async function fetchAllRows(table: 'ratings' | 'favorite_movies' | 'watchlist', userId: string): Promise<Set<string>> {
  const keys = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select('tmdb_id, media_type')
      .eq('user_id', userId)
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const row of data || []) keys.add(`${row.media_type}-${row.tmdb_id}`)
    if (!data || data.length < 1000) break
  }
  return keys
}

export default function ImportPage() {
  const t = useTranslations('import')
  const [step, setStep] = useState<Step>('file')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [data, setData] = useState<LbExport | null>(null)
  const [fileName, setFileName] = useState('')
  const [starMap, setStarMap] = useState<Record<string, StarAction>>(DEFAULT_STAR_MAP)
  const [unratedAction, setUnratedAction] = useState<'skip' | 'ok'>('skip')
  const [includeWatchlist, setIncludeWatchlist] = useState(true)
  const [keepExisting, setKeepExisting] = useState(true)

  const [targets, setTargets] = useState<Target[]>([])
  const matchesRef = useRef(new Map<string, Match | null>())
  const [matches, setMatches] = useState(new Map<string, Match | null>())
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [existing, setExisting] = useState<Existing | null>(null)

  const [phase, setPhase] = useState('')
  const [summary, setSummary] = useState<Summary | null>(null)

  // ---------- 1. bestand ----------
  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const result = await readLetterboxdFile(file)
      setData(result)
      setFileName(file.name)
      matchesRef.current = new Map()
      setStep('mapping')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errRead'))
    }
    setBusy(false)
  }

  // ---------- 2. wat gaan we importeren ----------
  function buildTargets(): Target[] {
    if (!data) return []
    const out: Target[] = []
    const seen = new Set<string>()
    for (const film of data.ratings) {
      seen.add(film.uri)
      const action = film.rating === null ? 'skip' : (starMap[starKey(film.rating)] ?? 'skip')
      if (action !== 'skip') out.push({ film, action })
    }
    for (const film of data.watched) {
      if (seen.has(film.uri)) continue
      seen.add(film.uri)
      if (unratedAction === 'ok') out.push({ film, action: 'ok' })
    }
    if (includeWatchlist) {
      for (const film of data.watchlist) {
        if (seen.has(film.uri)) continue
        seen.add(film.uri)
        out.push({ film, action: 'watchlist' })
      }
    }
    return out
  }

  // ---------- 3. films opzoeken bij TMDB ----------
  async function matchBatch(batch: LbFilm[]): Promise<void> {
    let lastError = t('errLookup')
    // Niet zinvol om opnieuw te proberen: niet ingelogd of te vaak achter elkaar.
    let fatal = false
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await authFetch('/api/import-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ films: batch.map((f) => ({ name: f.name, year: f.year })) }),
        })
        const body = await res.json()
        if (res.status === 429 || res.status === 401) {
          fatal = true
          throw new Error(body.error || t('errTooOften'))
        }
        if (!res.ok || !Array.isArray(body.matches)) throw new Error(body.error || t('errLookupStatus', { status: res.status }))
        batch.forEach((film, i) => matchesRef.current.set(film.uri, (body.matches[i] as Match | null) ?? null))
        return
      } catch (err) {
        lastError = err instanceof Error ? err.message : lastError
        if (fatal) break
        await sleep(1500 * attempt)
      }
    }
    throw new Error(lastError)
  }

  async function startMatching() {
    const wanted = buildTargets()
    if (wanted.length === 0) {
      setError(t('errNothing'))
      return
    }
    setError(null)
    setTargets(wanted)
    setStep('matching')

    const pending = wanted.map((t) => t.film).filter((f) => !matchesRef.current.has(f.uri))
    setProgress({ done: wanted.length - pending.length, total: wanted.length })

    try {
      const queue = chunks(pending, MATCH_BATCH)
      let next = 0
      const worker = async () => {
        while (next < queue.length) {
          const batch = queue[next++]
          await matchBatch(batch)
          setProgress((p) => ({ ...p, done: p.done + batch.length }))
        }
      }
      await Promise.all(Array.from({ length: MATCH_CONCURRENCY }, worker))

      const user = await getCurrentUser()
      if (!user) throw new Error(t('errNotLoggedIn'))
      const [ratings, favorites, watchlist] = await Promise.all([
        fetchAllRows('ratings', user.id),
        fetchAllRows('favorite_movies', user.id),
        fetchAllRows('watchlist', user.id),
      ])
      setExisting({ ratings, favorites, watchlist })
      setMatches(new Map(matchesRef.current))
      setStep('review')
    } catch (err) {
      setMatches(new Map(matchesRef.current))
      setError(err instanceof Error ? err.message : t('errLookup'))
    }
  }

  // ---------- 4. importeren + caches voorbereiden ----------
  async function runImport() {
    if (!existing) return
    setStep('importing')
    setError(null)
    setPhase(t('phaseSave'))
    setProgress({ done: 0, total: 0 })

    try {
      const user = await getCurrentUser()
      if (!user) throw new Error(t('errNotLoggedIn'))

      // Eén rij per film, ook als twee Letterboxd-regels op dezelfde TMDB-titel uitkomen.
      const byId = new Map<number, { target: Target; match: Match }>()
      for (const target of targets) {
        const match = matches.get(target.film.uri)
        if (match) byId.set(match.id, { target, match })
      }
      const plans = [...byId.values()]

      const ratingRows = plans
        .filter((p) => p.target.action === 'dislike' || p.target.action === 'ok' || p.target.action === 'love')
        .filter((p) => !keepExisting || !existing.ratings.has(`movie-${p.match.id}`))
        .map((p) => ({
          user_id: user.id,
          tmdb_id: p.match.id,
          title: p.match.title,
          media_type: 'movie',
          rating: p.target.action,
          rated_at: toTimestamp(p.target.film.date),
        }))
      const favoriteRows = plans
        .filter((p) => p.target.action === 'favorite' && !existing.favorites.has(`movie-${p.match.id}`))
        .map((p) => ({
          user_id: user.id,
          tmdb_id: p.match.id,
          title: p.match.title,
          media_type: 'movie',
          added_at: toTimestamp(p.target.film.date),
        }))
      const watchlistRows = plans
        .filter((p) => p.target.action === 'watchlist' && !existing.watchlist.has(`movie-${p.match.id}`))
        .map((p) => ({
          user_id: user.id,
          tmdb_id: p.match.id,
          title: p.match.title,
          poster_path: p.match.poster_path,
          media_type: 'movie',
        }))

      for (const part of chunks(ratingRows, WRITE_BATCH)) {
        const { error: writeError } = await supabase.from('ratings').upsert(part, { onConflict: 'user_id,tmdb_id,media_type' })
        if (writeError) throw new Error(t('errRatings', { message: writeError.message }))
      }
      for (const part of chunks(favoriteRows, WRITE_BATCH)) {
        const { error: writeError } = await supabase.from('favorite_movies').insert(part)
        if (writeError) throw new Error(t('errFavorites', { message: writeError.message }))
      }
      for (const part of chunks(watchlistRows, WRITE_BATCH)) {
        const { error: writeError } = await supabase
          .from('watchlist')
          .upsert(part, { onConflict: 'user_id,tmdb_id,media_type', ignoreDuplicates: true })
        if (writeError) throw new Error(t('errWatchlist', { message: writeError.message }))
      }

      // Smaak leren kennen: de titels die straks als bron meetellen, in porties vooraf inlezen.
      const newestFirst = (a: { target: Target }, b: { target: Target }) => b.target.film.date.localeCompare(a.target.film.date)
      const pick = (action: 'favorite' | 'love' | 'ok') =>
        plans.filter((p) => p.target.action === action).sort(newestFirst).slice(0, WARM_LIMITS[action])
      const warmList = [...pick('favorite'), ...pick('love'), ...pick('ok')].map((p) => ({ id: p.match.id, title: p.match.title }))

      setPhase(t('phaseLearn'))
      setProgress({ done: 0, total: warmList.length })
      let warmFailed = 0
      const queue = chunks(warmList, WARM_BATCH)
      let next = 0
      const worker = async () => {
        while (next < queue.length) {
          const batch = queue[next++]
          let ok = false
          for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
            try {
              const res = await authFetch('/api/import-warmup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: batch }),
              })
              ok = res.ok
            } catch {
              ok = false
            }
            if (!ok) await sleep(1500)
          }
          if (!ok) warmFailed += batch.length
          setProgress((p) => ({ ...p, done: p.done + batch.length }))
        }
      }
      await Promise.all(Array.from({ length: WARM_CONCURRENCY }, worker))

      setSummary({ ratings: ratingRows.length, favorites: favoriteRows.length, watchlist: watchlistRows.length, warmFailed })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errImport'))
      setStep('review')
    }
  }

  async function finish() {
    const user = await getCurrentUser()
    // De bewaarde aanbevelingen op dit apparaat kloppen niet meer; laat de app ze opnieuw ophalen.
    try {
      if (user) {
        localStorage.removeItem(`kijkassistent:recommendations:${user.id}`)
        localStorage.removeItem(`kijkassistent:recommendations:${user.id}:en`)
      }
    } catch {
      // geen localStorage beschikbaar: geen probleem
    }
    // Bewust een volledige paginalading (geen router.push): de startpagina haalt dan opnieuw verse aanbevelingen op.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/'
  }

  // ---------- afgeleide cijfers voor het scherm ----------
  const rated = data?.ratings ?? []
  const starCounts = new Map<string, number>()
  for (const f of rated) if (f.rating !== null) starCounts.set(starKey(f.rating), (starCounts.get(starKey(f.rating)) ?? 0) + 1)
  const ratedUris = new Set(rated.map((f) => f.uri))
  const unratedCount = (data?.watched ?? []).filter((f) => !ratedUris.has(f.uri)).length

  const found = targets.filter((t) => matches.get(t.film.uri))
  const notFound = targets.filter((t) => matches.get(t.film.uri) === null)
  const countBy = (action: Action) => found.filter((t) => t.action === action).length
  const alreadyRated = found.filter(
    (t) => (t.action === 'dislike' || t.action === 'ok' || t.action === 'love') && existing?.ratings.has(`movie-${matches.get(t.film.uri)!.id}`)
  ).length

  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  const stepNumber = { file: 1, mapping: 2, matching: 3, review: 3, importing: 4, done: 4 }[step]

  return (
    <>
      <main className="max-w-xl mx-auto px-5 pt-6 pb-28">
        <Link href="/settings" className="text-sm text-muted hover:text-foreground transition-colors">{t('back')}</Link>
        <h1 className="font-display text-2xl mt-3 mb-1">{t('heading')}</h1>

        {/* Alleen op een computer: op telefoon en tablet is de export van Letterboxd er ook niet. */}
        <div className="[@media(pointer:fine)]:hidden mt-6">
          <p className={`${card} p-5 text-muted leading-relaxed`}>
            {t('computerOnly')}
          </p>
        </div>

        <div className="hidden [@media(pointer:fine)]:block">
          <p className="text-muted mb-6">{t('stepOf', { step: stepNumber })}</p>

          {error && (
            <p className="text-sm text-coral border border-coral/40 bg-coral/5 rounded-xl px-4 py-3 mb-5">{error}</p>
          )}

          {step === 'file' && (
            <div className="flex flex-col gap-4">
              <p className="text-muted leading-relaxed">
                {t('intro')}
              </p>
              <div className={`${card} p-5`}>
                <p className="text-sm font-medium mb-2">{t('howTo')}</p>
                <ol className="list-decimal pl-5 text-sm text-muted space-y-1 leading-relaxed">
                  <li>{t.rich('howTo1', { b: (c) => <span className="text-foreground">{c}</span> })}</li>
                  <li>{t.rich('howTo2', { b: (c) => <span className="text-foreground">{c}</span> })}</li>
                  <li>{t('howTo3')}</li>
                </ol>
              </div>
              <label className={`${btnPrimary} cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
                {busy ? t('reading') : t('chooseZip')}
                <input
                  type="file"
                  accept=".zip,.csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </label>
            </div>
          )}

          {step === 'mapping' && data && (
            <div className="flex flex-col gap-5">
              <p className="text-muted leading-relaxed">
                {t.rich('mappingIntro', {
                  b: () => <span className="text-foreground">{fileName}</span>,
                  count: data.ratings.length,
                  watchlist: data.watchlist.length > 0 ? t('onWatchlistSuffix', { count: data.watchlist.length }) : '',
                })}
              </p>

              <div className={`${card} p-4 flex flex-col gap-2.5`}>
                {[...STAR_VALUES].reverse().map((stars) => {
                  const key = starKey(stars)
                  const count = starCounts.get(key) ?? 0
                  return (
                    <div key={key} className={`flex items-center justify-between gap-3 ${count === 0 ? 'opacity-45' : ''}`}>
                      <span className="text-sm">
                        <span className="text-accent">{'★'.repeat(Math.floor(stars))}{stars % 1 ? '½' : ''}</span>{' '}
                        <span className="text-muted">{t('stars', { stars: starsNumber(stars), count: stars === 1 ? 1 : 2 })} · {t('films', { count })}</span>
                      </span>
                      <select
                        value={starMap[key]}
                        onChange={(e) => setStarMap((m) => ({ ...m, [key]: e.target.value as StarAction }))}
                        className={selectClass}
                      >
                        {(Object.keys(ACTION_KEYS) as StarAction[]).map((a) => (
                          <option key={a} value={a}>{t(ACTION_KEYS[a])}</option>
                        ))}
                      </select>
                    </div>
                  )
                })}
              </div>

              <div className={`${card} p-4 flex flex-col gap-4`}>
                {unratedCount > 0 && (
                  <label className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      {t('unrated')} <span className="text-muted">({unratedCount})</span>
                    </span>
                    <select value={unratedAction} onChange={(e) => setUnratedAction(e.target.value as 'skip' | 'ok')} className={selectClass}>
                      <option value="skip">{t('actionSkip')}</option>
                      <option value="ok">{t('actionOk')}</option>
                    </select>
                  </label>
                )}
                {data.watchlist.length > 0 && (
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" checked={includeWatchlist} onChange={(e) => setIncludeWatchlist(e.target.checked)} className="accent-accent w-4 h-4" />
                    <span>{t('includeWatchlist')} <span className="text-muted">({data.watchlist.length})</span></span>
                  </label>
                )}
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span>{t('alreadyRatedLabel')}</span>
                  <select value={keepExisting ? 'keep' : 'overwrite'} onChange={(e) => setKeepExisting(e.target.value === 'keep')} className={selectClass}>
                    <option value="keep">{t('keep')}</option>
                    <option value="overwrite">{t('overwrite')}</option>
                  </select>
                </label>
              </div>

              <div className="flex gap-2">
                <button onClick={() => { setStep('file'); setError(null) }} className={btnGhost}>{t('back2')}</button>
                <button onClick={startMatching} className={`${btnPrimary} flex-1`}>{t('nextLookup')}</button>
              </div>
            </div>
          )}

          {step === 'matching' && (
            <div className="flex flex-col gap-4">
              <p className="text-muted leading-relaxed">
                {t('matchingIntro')}
              </p>
              <div className={`${card} p-5`}>
                <div className="flex justify-between text-sm mb-2">
                  <span>{t('lookingUp')}</span>
                  <span className="text-muted">{t('progress', { done: progress.done, total: progress.total })}</span>
                </div>
                <div className="h-2 rounded-full bg-background overflow-hidden">
                  <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
                </div>
              </div>
              {error && (
                <div className="flex gap-2">
                  <button onClick={() => { setStep('mapping'); setError(null) }} className={btnGhost}>{t('back2')}</button>
                  <button onClick={startMatching} className={`${btnPrimary} flex-1`}>{t('retry')}</button>
                </div>
              )}
            </div>
          )}

          {step === 'review' && (
            <div className="flex flex-col gap-5">
              <p className="text-muted leading-relaxed">
                {t.rich('ready', { b: () => <span className="text-foreground">{found.length}</span>, total: targets.length })}
              </p>
              <div className={`${card} p-4 flex flex-col gap-2 text-sm`}>
                {(['favorite', 'love', 'ok', 'dislike', 'watchlist'] as const).map((a) => {
                  const n = countBy(a)
                  if (n === 0) return null
                  return (
                    <div key={a} className="flex justify-between">
                      <span>{a === 'watchlist' ? t('onWatchlist') : t(ACTION_KEYS[a])}</span>
                      <span className="text-muted">{n}</span>
                    </div>
                  )
                })}
                {alreadyRated > 0 && (
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    {t(keepExisting ? 'alreadyRatedKeep' : 'alreadyRatedOverwrite', { count: alreadyRated })}
                  </p>
                )}
              </div>

              {notFound.length > 0 && (
                <details className={`${card} p-4 text-sm`}>
                  <summary className="cursor-pointer">
                    {t('notFound', { count: notFound.length })}
                  </summary>
                  <ul className="mt-3 space-y-1 text-muted max-h-56 overflow-y-auto">
                    {notFound.slice(0, 300).map((target) => (
                      <li key={target.film.uri}>{target.film.name}{target.film.year ? ` (${target.film.year})` : ''}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex gap-2">
                <button onClick={() => { setStep('mapping'); setError(null) }} className={btnGhost}>{t('back2')}</button>
                <button onClick={runImport} disabled={found.length === 0} className={`${btnPrimary} flex-1`}>
                  {t('importN', { count: found.length })}
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col gap-4">
              <div className={`${card} p-5`}>
                <div className="flex justify-between text-sm mb-2">
                  <span>{phase}</span>
                  {progress.total > 0 && <span className="text-muted">{t('progress', { done: progress.done, total: progress.total })}</span>}
                </div>
                <div className="h-2 rounded-full bg-background overflow-hidden">
                  <div className="h-full bg-accent transition-all" style={{ width: `${progress.total > 0 ? percent : 8}%` }} />
                </div>
              </div>
              <p className="text-sm text-muted leading-relaxed">
                {t('learnNote')}
              </p>
            </div>
          )}

          {step === 'done' && summary && (
            <div className="flex flex-col gap-4">
              <div className={`${card} p-5 flex flex-col gap-2 text-sm`}>
                <p className="font-medium text-base mb-1">{t('done')}</p>
                <p>{t('doneRatings', { count: summary.ratings })}</p>
                <p>{t('doneFavorites', { count: summary.favorites })}</p>
                {summary.watchlist > 0 && <p>{t('doneWatchlist', { count: summary.watchlist })}</p>}
                {summary.warmFailed > 0 && (
                  <p className="text-xs text-muted mt-1 leading-relaxed">
                    {t('warmFailed', { count: summary.warmFailed })}
                  </p>
                )}
              </div>
              <button onClick={finish} className={btnPrimary}>{t('toRecommendations')}</button>
            </div>
          )}
        </div>
      </main>

      <BottomNav />
    </>
  )
}
