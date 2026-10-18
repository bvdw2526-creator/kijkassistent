'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { Locale } from '@/lib/locale'
import { chooseLocale } from '@/lib/localeAccount'
import { GlobeIcon } from './Icons'

// Klein knopje "English" / "Nederlands" voor wie nog niet ingelogd is (startpagina). Ingelogd kies je de taal bij
// Instellingen (zie LanguageSetting).
export default function LanguageSwitch() {
  const t = useTranslations('language')
  const locale = useLocale() as Locale
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await chooseLocale(locale === 'nl' ? 'en' : 'nl')
          router.refresh()
        })
      }}
      className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors touch-manipulation disabled:opacity-60"
    >
      <GlobeIcon className="w-4 h-4" />
      {t('switchTo')}
    </button>
  )
}
