'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { card, tapChevron, tapRow } from './ui'
import { useBackToClose } from './useBackToClose'
import TitleInfoSheet, { type TitleInfoItem } from './TitleInfoSheet'
import MyRatingEditor from './MyRatingEditor'
import { ChevronRightIcon, CloseIcon } from './Icons'

// Zoveel reeksen staan er meteen; de rest komt met "Toon alle".
const FIRST_SHOWN = 10

export type MissingPart ={ id: number; title: string; year: number | null; poster_path: string | null; onService: string | null }
export type OpenSeries = { id: number; name: string; seen: number; total: number; missing: MissingPart[] }

// "Reeksen die je nog niet af hebt" op de Stats-pagina: filmreeksen waarvan je iets leuk vond, met hoeveel delen je al
// beoordeelde. Een tik opent de delen die nog ontbreken (met je dienst erbij als hij daar staat); een deel opent de
// infopopup, waar je hem meteen een oordeel geeft als je hem toch al zag.
export default function SeriesBreakdown({
  series,
  onRatingChanged,
}: {
  series: { complete: number; open: OpenSeries[] }
  onRatingChanged?: () => void
}) {
  const t = useTranslations('stats')
  // Alleen het id: de delen komen steeds uit de nieuwste cijfers, ook na het geven van een oordeel.
  const [openId, setOpenId] = useState<number | null>(null)
  const [info, setInfo] = useState<TitleInfoItem | null>(null)
  const [showAll, setShowAll] = useState(false)

  if (series.open.length === 0) return null
  const open = openId !== null ? series.open.find((s) => s.id === openId) : undefined
  const visible = showAll ? series.open : series.open.slice(0, FIRST_SHOWN)

  return (
    <>
      <div className={`${card} p-5`}>
        <p className="text-sm font-medium mb-1">{t('seriesOpen')}</p>
        <p className="text-xs text-faint mb-3">
          {t('seriesOpenSub')}
          {series.complete > 0 && ` ${t('seriesComplete', { count: series.complete })}`}
        </p>
        <div className="flex flex-col gap-0.5">
          {visible.map((s) => (
            <button key={s.id} onClick={() => setOpenId(s.id)} className={tapRow}>
              <span className="text-sm flex-1 min-w-0 truncate text-left">{s.name}</span>
              <div className="w-10 sm:w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden flex-shrink-0">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(s.seen / s.total) * 100}%` }} />
              </div>
              <span className="text-xs text-muted w-12 text-right flex-shrink-0">{t('seenOf', { seen: s.seen, total: s.total })}</span>
              <ChevronRightIcon className={tapChevron} />
            </button>
          ))}
        </div>
        {series.open.length > FIRST_SHOWN && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 text-sm font-medium text-accent hover:text-foreground transition-colors touch-manipulation"
          >
            {showAll ? t('seriesShowFewer') : t('seriesShowAll', { count: series.open.length })}
          </button>
        )}
      </div>

      {openId !== null && (
        <SeriesSheet series={open} onPick={setInfo} onClose={() => setOpenId(null)} />
      )}
      {/* Naast de lijst en niet erin: zo ligt hij er netjes bovenop, en sluit "terug" alleen deze. */}
      {info && (
        <TitleInfoSheet item={info} onClose={() => setInfo(null)}>
          <MyRatingEditor item={info} onChanged={onRatingChanged} />
        </TitleInfoSheet>
      )}
    </>
  )
}

function SeriesSheet({
  series,
  onPick,
  onClose,
}: {
  // Ontbreekt zodra je de laatste delen een oordeel gaf: de reeks is dan af.
  series: OpenSeries | undefined
  onPick: (item: TitleInfoItem) => void
  onClose: () => void
}) {
  useBackToClose(true, onClose)
  const t = useTranslations('stats')
  const tt = useTranslations('title')
  const heading = series?.name ?? t('seriesDone')

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-surface border border-line rounded-t-3xl sm:rounded-3xl max-h-[88vh] flex flex-col animate-sheet-up sm:animate-pop-in safe-bottom"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={heading}
      >
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-control" />
        </div>
        <div className="px-6 pt-4 pb-3 border-b border-line">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl min-w-0">{heading}</h2>
            <button
              onClick={onClose}
              className="rounded-full p-2.5 text-muted hover:text-foreground hover:bg-white/5 transition-colors touch-manipulation"
              aria-label={tt('close')}
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
          {series && (
            <p className="text-xs text-faint mt-1">{t('seriesSheetSub', { seen: series.seen, total: series.total })}</p>
          )}
        </div>

        <div className="overflow-y-auto px-6 py-2">
          {!series && <p className="text-sm text-muted py-4">{t('seriesDoneSub')}</p>}
          {series && (
            <ul className="flex flex-col divide-y divide-line">
              {series.missing.map((part) => (
                <li key={part.id}>
                  <button
                    onClick={() => onPick({ id: part.id, media_type: 'movie', title: part.title, poster_path: part.poster_path })}
                    className="w-full flex items-baseline justify-between gap-3 py-2.5 text-left text-sm hover:text-accent transition-colors touch-manipulation"
                  >
                    <span className="min-w-0 truncate">{part.title}</span>
                    <span className="text-xs text-faint flex-shrink-0">
                      {part.onService && <span className="text-accent">{part.onService} · </span>}
                      {part.year ?? ''}
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
