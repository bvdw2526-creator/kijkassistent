'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { supabase, getCurrentUser } from '@/lib/supabase'
import { card, chip } from './ui'
import { useBackToClose } from './useBackToClose'
import TitleInfoSheet, { type TitleInfoItem } from './TitleInfoSheet'
import { HeartIcon, OkIcon, DislikeIcon, StarIcon, CloseIcon } from './Icons'

type Category = 'fav' | 'love' | 'ok' | 'dislike'
type Row = { tmdb_id: number; title: string; media_type: 'movie' | 'tv'; when: string | null; year: number | null }
type Kind = 'alles' | 'movie' | 'tv'

// label = sleutel onder "stats" in messages/*.json.
const CATEGORIES: { key: Category; icon: typeof HeartIcon; label: string; colorClass: string; hex: string }[] = [
  { key: 'fav', icon: StarIcon, label: 'catFav', colorClass: 'text-foreground', hex: 'var(--foreground)' },
  { key: 'love', icon: HeartIcon, label: 'catLove', colorClass: 'text-accent', hex: 'var(--accent)' },
  { key: 'ok', icon: OkIcon, label: 'catOk', colorClass: 'text-teal', hex: 'var(--teal)' },
  { key: 'dislike', icon: DislikeIcon, label: 'catDislike', colorClass: 'text-coral', hex: 'var(--coral)' },
]
// Het jaartal komt uit de kenmerken-cache; zoveel id's per opvraging.
const YEAR_CHUNK = 200

// "Hoe je beoordeelt" op de Stats-pagina: per soort oordeel een balk. Een tik op een regel opent een popup met de titels
// (de laatst beoordeelde bovenaan, te filteren op films of series); een titel opent daarboven de gewone infopopup.
// De lijsten worden pas opgehaald bij de eerste tik.
export default function RatingBreakdown({ counts }: { counts: { fav?: number; love: number; ok: number; dislike: number } }) {
  const [open, setOpen] = useState<Category | null>(null)
  const [lists, setLists] = useState<Record<Category, Row[]> | null>(null)
  const [failed, setFailed] = useState(false)
  const [info, setInfo] = useState<TitleInfoItem | null>(null)
  const t = useTranslations('stats')

  async function loadLists() {
    const user = await getCurrentUser()
    if (!user) return
    const [{ data: favorites, error: favError }, { data: ratings, error: ratingError }] = await Promise.all([
      supabase.from('favorite_movies').select('tmdb_id, title, media_type, added_at').eq('user_id', user.id),
      supabase.from('ratings').select('tmdb_id, title, media_type, rating, rated_at').eq('user_id', user.id),
    ])
    if (favError || ratingError) {
      setFailed(true)
      return
    }
    const years = await loadYears([...(favorites ?? []), ...(ratings ?? [])])
    const yearOf = (t: { media_type: string; tmdb_id: number }) => years.get(`${t.media_type}-${t.tmdb_id}`) ?? null
    const newestFirst = (a: Row, b: Row) => (b.when ?? '').localeCompare(a.when ?? '')
    const byRating = (rating: string) =>
      (ratings ?? [])
        .filter((r) => r.rating === rating)
        .map((r) => ({ tmdb_id: r.tmdb_id, title: r.title, media_type: r.media_type, when: r.rated_at, year: yearOf(r) }))
        .sort(newestFirst)
    setLists({
      fav: (favorites ?? [])
        .map((f) => ({ tmdb_id: f.tmdb_id, title: f.title, media_type: f.media_type, when: f.added_at, year: yearOf(f) }))
        .sort(newestFirst),
      love: byRating('love'),
      ok: byRating('ok'),
      dislike: byRating('dislike'),
    })
  }

  function openCategory(key: Category) {
    setOpen(key)
    if (!lists && !failed) loadLists()
  }

  const total = CATEGORIES.reduce((sum, c) => sum + (counts[c.key] ?? 0), 0)
  const openCat = CATEGORIES.find((c) => c.key === open)

  return (
    <>
      <div className={`${card} p-5`}>
        <p className="text-sm font-medium mb-1">{t('howYouRate')}</p>
        <p className="text-xs text-faint mb-3">{t('tapRow')}</p>
        <div className="flex flex-col gap-0.5">
          {CATEGORIES.map(({ key, icon: Icon, label, colorClass, hex }) => {
            const count = counts[key] ?? 0
            const pct = total > 0 ? (count / total) * 100 : 0
            return (
              <button
                key={key}
                onClick={() => openCategory(key)}
                disabled={count === 0}
                className="w-full flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 text-left transition-colors hover:bg-white/5 disabled:hover:bg-transparent touch-manipulation"
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${colorClass}`} />
                <span className="text-sm w-28 flex-shrink-0">{t(label)}</span>
                <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: hex }} />
                </div>
                <span className="text-sm font-medium w-8 text-right flex-shrink-0">{count}</span>
                <span className="text-faint text-sm w-3 flex-shrink-0" aria-hidden>›</span>
              </button>
            )
          })}
        </div>
      </div>

      {openCat && (
        <ListSheet
          label={t(openCat.label)}
          icon={openCat.icon}
          colorClass={openCat.colorClass}
          rows={lists ? lists[openCat.key] : null}
          failed={failed}
          onPick={setInfo}
          onClose={() => setOpen(null)}
        />
      )}
      {/* Naast de lijst en niet erin: zo ligt hij er netjes bovenop, en sluit "terug" alleen deze. */}
      {info && <TitleInfoSheet item={info} onClose={() => setInfo(null)} />}
    </>
  )
}

async function loadYears(titles: { media_type: string; tmdb_id: number }[]): Promise<Map<string, number>> {
  const years = new Map<string, number>()
  for (const mediaType of ['movie', 'tv']) {
    const ids = [...new Set(titles.filter((t) => t.media_type === mediaType).map((t) => t.tmdb_id))]
    for (let i = 0; i < ids.length; i += YEAR_CHUNK) {
      const { data } = await supabase
        .from('tmdb_features_cache')
        .select('tmdb_id, year')
        .eq('media_type', mediaType)
        .in('tmdb_id', ids.slice(i, i + YEAR_CHUNK))
      for (const row of data ?? []) if (typeof row.year === 'number') years.set(`${mediaType}-${row.tmdb_id}`, row.year)
    }
  }
  return years
}

function ListSheet({
  label,
  icon: Icon,
  colorClass,
  rows,
  failed,
  onPick,
  onClose,
}: {
  label: string
  icon: typeof HeartIcon
  colorClass: string
  rows: Row[] | null
  failed: boolean
  onPick: (item: TitleInfoItem) => void
  onClose: () => void
}) {
  useBackToClose(true, onClose)
  const [kind, setKind] = useState<Kind>('alles')
  const t = useTranslations('stats')
  const tt = useTranslations('title')
  const shown = rows ? rows.filter((r) => kind === 'alles' || r.media_type === kind) : null
  const countOf = (k: Kind) => (rows ? rows.filter((r) => k === 'alles' || r.media_type === k).length : 0)

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-surface border border-line rounded-t-3xl sm:rounded-3xl max-h-[88vh] flex flex-col animate-sheet-up sm:animate-pop-in safe-bottom"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={label}
      >
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-control" />
        </div>
        <div className="px-6 pt-4 pb-3 border-b border-line">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="font-display text-xl flex items-center gap-2">
              <Icon className={`w-5 h-5 ${colorClass}`} />
              {label}
              {rows && <span className="text-muted text-base font-normal">· {rows.length}</span>}
            </h2>
            <button
              onClick={onClose}
              className="rounded-full p-2.5 text-muted hover:text-foreground hover:bg-white/5 transition-colors touch-manipulation"
              aria-label={tt('close')}
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-2">
            {([
              ['alles', t('all')],
              ['movie', tt('films')],
              ['tv', tt('seriesPlural')],
            ] as const).map(([k, text]) => (
              <button key={k} onClick={() => setKind(k)} aria-pressed={kind === k} className={chip(kind === k, 'accent', 'sm')}>
                {text}
                {rows ? ` (${countOf(k)})` : ''}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-2">
          {failed && <p className="text-sm text-muted py-4">{t('listFailed')}</p>}
          {!failed && !shown && (
            <div className="flex flex-col gap-2 py-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-5 rounded bg-surface-2 animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          )}
          {shown && shown.length === 0 && <p className="text-sm text-muted py-4">{t('nothingHere')}</p>}
          {shown && shown.length > 0 && (
            <ul className="flex flex-col divide-y divide-line">
              {shown.map((row) => (
                <li key={`${row.media_type}-${row.tmdb_id}`}>
                  <button
                    onClick={() => onPick({ id: row.tmdb_id, media_type: row.media_type, title: row.title })}
                    className="w-full flex items-baseline justify-between gap-3 py-2.5 text-left text-sm hover:text-accent transition-colors touch-manipulation"
                  >
                    <span className="min-w-0 truncate">{row.title}</span>
                    <span className="text-xs text-faint flex-shrink-0">
                      {row.media_type === 'tv' ? tt('series') : tt('film')}
                      {row.year ? ` · ${row.year}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
