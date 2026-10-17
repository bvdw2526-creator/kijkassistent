'use client'

import { useState } from 'react'
import Link from 'next/link'
import { btnSecondary, card } from './ui'
import { useBackToClose } from './useBackToClose'
import TitleInfoSheet, { type TitleInfoItem } from './TitleInfoSheet'
import { UsersIcon, CloseIcon } from './Icons'

export type ActorHighlight = {
  // id en titels ontbreken in een oudere bewaarde kopie van de Stats; die regel is dan niet aan te tikken.
  id?: number
  name: string
  count: number
  titles?: { id: number; media_type: 'movie' | 'tv'; title: string }[]
}

// "Wist je dit al?" op de Stats-pagina: wie het vaakst opduikt in wat je zag. Een tik opent een popup met die titels en een
// knop naar alles van die persoon (de persoonspagina).
export default function ActorHighlights({ actors }: { actors: ActorHighlight[] }) {
  const [open, setOpen] = useState<ActorHighlight | null>(null)
  const [info, setInfo] = useState<TitleInfoItem | null>(null)
  const maxCount = actors[0]?.count ?? 0

  return (
    <>
      <div className={`${card} p-5 border-accent/30`}>
        <div className="flex items-center gap-2 mb-1">
          <UsersIcon className="w-4 h-4 text-accent" />
          <p className="text-sm font-medium">Wist je dit al?</p>
        </div>
        <p className="text-xs text-faint mb-3">Deze mensen duiken opvallend vaak op in wat je hebt gezien. Tik op een naam voor de titels.</p>
        <div className="flex flex-col gap-0.5">
          {actors.map((actor, i) => (
            <button
              key={actor.id ?? actor.name}
              onClick={() => setOpen(actor)}
              disabled={!actor.titles}
              className="w-full flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 text-left transition-colors hover:bg-white/5 disabled:hover:bg-transparent touch-manipulation"
            >
              <span className="text-xs font-mono text-faint w-4 flex-shrink-0">{i + 1}</span>
              <span className="text-sm flex-1 min-w-0 truncate">{actor.name}</span>
              <div className="w-20 h-1.5 rounded-full bg-surface-2 overflow-hidden flex-shrink-0">
                <div
                  className="h-full rounded-full bg-accent transition-all"
                  style={{ width: `${maxCount > 0 ? (actor.count / maxCount) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs text-muted w-16 text-right flex-shrink-0">{actor.count}× gezien</span>
              <span className="text-faint text-sm w-3 flex-shrink-0" aria-hidden>
                {actor.titles ? '›' : ''}
              </span>
            </button>
          ))}
        </div>
      </div>

      {open && <ActorSheet actor={open} onPick={setInfo} onClose={() => setOpen(null)} />}
      {/* Naast de popup en niet erin: zo ligt hij er netjes bovenop, en sluit "terug" alleen deze. */}
      {info && <TitleInfoSheet item={info} onClose={() => setInfo(null)} />}
    </>
  )
}

function ActorSheet({ actor, onPick, onClose }: { actor: ActorHighlight; onPick: (item: TitleInfoItem) => void; onClose: () => void }) {
  useBackToClose(true, onClose)
  const titles = actor.titles ?? []

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-surface border border-line rounded-t-3xl sm:rounded-3xl max-h-[88vh] flex flex-col animate-sheet-up sm:animate-pop-in safe-bottom"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={actor.name}
      >
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-control" />
        </div>
        <div className="px-6 pt-4 pb-3 border-b border-line">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="font-display text-xl truncate">{actor.name}</h2>
              <p className="text-sm text-muted">In {titles.length} titels die je hebt gezien</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2.5 text-muted hover:text-foreground hover:bg-white/5 transition-colors touch-manipulation"
              aria-label="Sluiten"
            >
              <CloseIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-2">
          <ul className="flex flex-col divide-y divide-line">
            {titles.map((t) => (
              <li key={`${t.media_type}-${t.id}`}>
                <button
                  onClick={() => onPick({ id: t.id, media_type: t.media_type, title: t.title })}
                  className="w-full flex items-baseline justify-between gap-3 py-2.5 text-left text-sm hover:text-accent transition-colors touch-manipulation"
                >
                  <span className="min-w-0 truncate">{t.title}</span>
                  <span className="text-xs text-faint flex-shrink-0">{t.media_type === 'tv' ? 'Serie' : 'Film'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {actor.id !== undefined && (
          <div className="px-6 pt-3 pb-5 border-t border-line">
            <Link href={`/persoon/${actor.id}?rol=acteur`} className={`${btnSecondary} w-full`}>
              Alle films en series van {actor.name}
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
