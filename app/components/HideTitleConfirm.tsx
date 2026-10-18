'use client'

import { useTranslations } from 'next-intl'
import { btnPrimary, btnGhost } from './ui'

// Bevestiging voor "Verbergen". Legt uit dat dit geen beoordeling is, zodat niemand denkt dat het meetelt voor de smaak.
export default function HideTitleConfirm({ title, onConfirm, onCancel }: { title: string; onConfirm: () => void; onCancel: () => void }) {
  const t = useTranslations('hide')
  const tt = useTranslations('title')
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] px-6 animate-fade-in" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm bg-surface border border-line rounded-3xl p-6 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl mb-2">{t('title')}</h2>
        <p className="text-sm text-foreground/90 leading-relaxed mb-2">
          {t.rich('disappears', { b: () => <span className="font-semibold">{title}</span> })}
        </p>
        <p className="text-sm text-muted leading-relaxed mb-5">
          {t('explain')}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onCancel} className={btnGhost}>
            {tt('cancel')}
          </button>
          <button onClick={onConfirm} className={btnPrimary}>
            {tt('ok')}
          </button>
        </div>
      </div>
    </div>
  )
}
