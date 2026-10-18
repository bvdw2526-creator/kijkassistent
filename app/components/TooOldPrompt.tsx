'use client'

import { useTranslations } from 'next-intl'
import { MIN_YEAR_OPTIONS, TOO_OLD_BEFORE } from '@/lib/tooOld'
import { btnGhost } from './ui'

// De vraag na een paar keer "Te oud": zullen we oudere titels voortaan weglaten? De app zet de grens nooit zelf; je
// kiest hem hier (of zegt nee) en kunt hem later aanpassen bij Instellingen.
export default function TooOldPrompt({
  suggested,
  onChoose,
  onDecline,
}: {
  suggested: number
  onChoose: (minYear: number) => void
  onDecline: () => void
}) {
  const t = useTranslations('tooOld')
  const options = MIN_YEAR_OPTIONS.filter((year) => year <= TOO_OLD_BEFORE)
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] px-6 animate-fade-in" onClick={onDecline}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm bg-surface border border-line rounded-3xl p-6 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl mb-2">{t('title')}</h2>
        <p className="text-sm text-foreground/90 leading-relaxed mb-4">
          {t('question')}
        </p>
        <div className="flex flex-col gap-2 mb-3">
          {options.map((year) => (
            <button
              key={year}
              onClick={() => onChoose(year)}
              className={`rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all touch-manipulation active:scale-[0.98] ${
                year === suggested ? 'border-accent bg-accent/10 text-accent' : 'border-line hover:border-line-strong'
              }`}
            >
              {t('option', { year })}
              {year === suggested && <span className="block text-xs font-normal text-muted mt-0.5">{t('suggested')}</span>}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted leading-relaxed mb-3">
          {t('note')}
        </p>
        <button onClick={onDecline} className={`${btnGhost} w-full`}>
          {t('decline')}
        </button>
      </div>
    </div>
  )
}
