'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { LOCALES, setLocaleCookie, type Locale } from '@/lib/locale'
import { CheckIcon } from './Icons'

// Taalkeuze bij Instellingen, in dezelfde stijl als de skins. Voorlopig per apparaat (cookie); later ook bij het
// account, zodat de tipsmail dezelfde taal krijgt.
export default function LanguageSetting() {
  const t = useTranslations('language')
  const locale = useLocale() as Locale
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="mb-3">
      <h3 className="font-display text-lg">{t('label')}</h3>
      <p className="text-muted text-sm mt-0.5 mb-3 leading-relaxed">{t('help')}</p>
      <div className="grid grid-cols-2 gap-2">
        {LOCALES.map((l) => {
          const active = l === locale
          return (
            <button
              key={l}
              disabled={pending}
              aria-pressed={active}
              onClick={() => {
                if (active) return
                setLocaleCookie(l)
                startTransition(() => router.refresh())
              }}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium transition-all touch-manipulation active:scale-[0.98] ${
                active ? 'border-accent bg-accent/10 text-accent' : 'border-line hover:border-line-strong'
              }`}
            >
              {t(l)}
              {active && <CheckIcon className="w-4 h-4 text-accent" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
