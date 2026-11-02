'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { card, tapChevron, tapRow } from './ui'
import { useBackToClose } from './useBackToClose'
import TitleInfoSheet, { type TitleInfoItem } from './TitleInfoSheet'
import MyRatingEditor from './MyRatingEditor'
import { ChevronRightIcon, CloseIcon } from './Icons'

type MediaType = 'movie' | 'tv'
// decade 0 = alles van vóór 1950 samen (zie OLDEST_DECADE in app/api/profile-stats/route.ts).
// titles ontbreekt in een oudere bewaarde kopie; dan is de regel (nog) niet aan te tikken.
export type DecadeCount = { decade: number; count: number; titles?: { id: number; title: string; year: number }[] }

// Pas een soort tonen vanaf zoveel titels met een jaartal: met één of twee zegt het niets.
const MIN_TITLES = 3

// "Uit welke tijd?" op de Stats-pagina: per soort (films en series) een balk per decennium, op volgorde van tijd.
// Het decennium waar je het meeste uit hebt gezien staat in de zin bovenaan en is gemarkeerd. Een tik op een regel
// opent de titels uit dat decennium; een titel opent daarboven de gewone infopopup.
export default function DecadeBreakdown({
  decades,
  onRatingChanged,
}: {
  decades: { movie: DecadeCount[]; tv: DecadeCount[] }
  onRatingChanged?: () => void
}) {
  const t = useTranslations('stats')
  // Alleen soort en decennium: de titels komen steeds uit de nieuwste cijfers, ook na het aanpassen van een oordeel.
  const [open, setOpen] = useState<{ mediaType: MediaType; decade: number } | null>(null)
  const [info, setInfo] = useState<TitleInfoItem | null>(null)

  const label = (decade: number) =>
    decade === 0
      ? t('decadeOld')
      : decade < 2000
        ? t('decadeShort', { yy: String(decade % 100).padStart(2, '0'), year: decade })
        : t('decadeLong', { year: decade })
  const inSentence = (decade: number) => (decade === 0 ? t('decadeOldInline') : label(decade))

  const total = (list: DecadeCount[]) => list.reduce((sum, d) => sum + d.count, 0)
  const top = (list: DecadeCount[]) => list.reduce((best, d) => (d.count > best.count ? d : best), list[0])

  const groups = ([
    { key: 'movie', title: t('films'), list: decades.movie },
    { key: 'tv', title: t('series'), list: decades.tv },
  ] as const).filter((g) => total(g.list) >= MIN_TITLES)
  if (groups.length === 0) return null

  const film = groups.find((g) => g.key === 'movie')
  const series = groups.find((g) => g.key === 'tv')
  const sub =
    film && series
      ? t('decadesSubBoth', { film: inSentence(top(film.list).decade), series: inSentence(top(series.list).decade) })
      : film
        ? t('decadesSubFilm', { film: inSentence(top(film.list).decade) })
        : t('decadesSubSeries', { series: inSentence(top(series!.list).decade) })

  // Na het weghalen van de laatste titel blijft er een lege lijst staan tot je hem sluit.
  const openTitles = open ? (decades[open.mediaType].find((d) => d.decade === open.decade)?.titles ?? []) : null

  return (
    <>
      <div className={`${card} p-5`}>
        <p className="text-sm font-medium mb-1">{t('decades')}</p>
        <p className="text-xs text-faint mb-1">{sub}</p>
        <p className="text-xs text-faint mb-3">{t('tapRow')}</p>
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const best = top(group.list)
            return (
              <div key={group.key}>
                <p className="text-xs text-muted mb-1">{group.title}</p>
                <div className="flex flex-col gap-0.5">
                  {group.list.map((d) => (
                    <button
                      key={d.decade}
                      onClick={() => setOpen({ mediaType: group.key, decade: d.decade })}
                      disabled={!d.titles}
                      className={tapRow}
                    >
                      <span className={`text-sm w-24 flex-shrink-0 truncate text-left ${d === best ? 'font-medium' : ''}`}>
                        {label(d.decade)}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${d === best ? 'bg-accent' : 'bg-faint'}`}
                          style={{ width: `${(d.count / best.count) * 100}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted w-8 text-right flex-shrink-0">{d.count}</span>
                      {d.titles ? <ChevronRightIcon className={tapChevron} /> : <span className="w-4 flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {open && openTitles && (
        <DecadeSheet
          heading={`${label(open.decade)} · ${open.mediaType === 'tv' ? t('series') : t('films')}`}
          mediaType={open.mediaType}
          titles={openTitles}
          onPick={setInfo}
          onClose={() => setOpen(null)}
        />
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

function DecadeSheet({
  heading,
  mediaType,
  titles,
  onPick,
  onClose,
}: {
  heading: string
  mediaType: MediaType
  titles: { id: number; title: string; year: number }[]
  onPick: (item: TitleInfoItem) => void
  onClose: () => void
}) {
  useBackToClose(true, onClose)
  const tt = useTranslations('title')

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
            <h2 className="font-display text-xl">
              {heading}
              <span className="text-muted text-base font-normal"> · {titles.length}</span>
            </h2>
            <button
              onClick={onClose}
              className="rounded-full p-2.5 text-muted hover:text-foreground hover:bg-white/5 transition-colors touch-manipulation"
              aria-label={tt('close')}
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-2">
          <ul className="flex flex-col divide-y divide-line">
            {titles.map((row) => (
              <li key={row.id}>
                <button
                  onClick={() => onPick({ id: row.id, media_type: mediaType, title: row.title })}
                  className="w-full flex items-baseline justify-between gap-3 py-2.5 text-left text-sm hover:text-accent transition-colors touch-manipulation"
                >
                  <span className="min-w-0 truncate">{row.title}</span>
                  <span className="text-xs text-faint flex-shrink-0">{row.year}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
