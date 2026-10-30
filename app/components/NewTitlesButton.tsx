'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { fetchNewTitles, hasUnseenNewTitles } from '@/lib/nieuwSeen'

// Knop "Nieuw" in de kop van Voor jou, met een stipje zolang er op de pagina Nieuw iets staat wat je daar nog niet zag.
// Het ophalen wacht even, zodat het de tips niet vertraagt.
export default function NewTitlesButton() {
  const t = useTranslations('nieuw')
  const [unseen, setUnseen] = useState(false)

  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      fetchNewTitles().then((data) => {
        if (!cancelled && data) setUnseen(hasUnseenNewTitles(data))
      })
    }, 1500)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return (
    <Link
      href="/nieuw"
      aria-label={unseen ? t('buttonUnseen') : t('button')}
      className="relative inline-flex items-center rounded-full border border-accent/60 bg-accent/12 px-3.5 py-1.5 text-sm font-semibold text-accent hover:border-accent hover:bg-accent/20 transition-colors touch-manipulation active:scale-[0.97]"
    >
      {t('button')}
      {unseen && (
        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-background" aria-hidden />
      )}
    </Link>
  )
}
