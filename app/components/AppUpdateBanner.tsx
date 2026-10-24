'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CloseIcon } from './Icons'

// Balkje bovenaan in de Android-app als die ouder is dan MIN_BUILD. Nodig omdat versies vóór 4.1.0 zelf nog geen
// update-melding hebben (die zit in android-app/.../MainActivity.java). Verhoog MIN_BUILD alleen als iedereen echt
// naar een nieuwere versie moet; voor gewone updates meldt de app het vanaf 4.1.0 zelf.
const MIN_BUILD = 102
const PLAY_URL = 'https://play.google.com/store/apps/details?id=nl.kijkassistent.app'
const DISMISSED_KEY = 'kijkassistent:appUpdateDismissed'

type CapacitorWindow = Window & {
  Capacitor?: { Plugins?: { App?: { getInfo?: () => Promise<{ build: string; version: string }> } } }
}

export default function AppUpdateBanner() {
  const [show, setShow] = useState(false)
  const t = useTranslations('appUpdate')

  useEffect(() => {
    if (!navigator.userAgent.includes('KijkassistentApp/Android')) return
    try {
      // Weggeklikt: niet meer tonen tot de app opnieuw wordt geopend.
      if (sessionStorage.getItem(DISMISSED_KEY)) return
    } catch {
      // Geen opslag: gewoon tonen.
    }
    const app = (window as CapacitorWindow).Capacitor?.Plugins?.App
    if (typeof app?.getInfo !== 'function') return
    try {
      app
        .getInfo()
        .then((info) => {
          const build = parseInt(info.build, 10)
          if (Number.isFinite(build) && build < MIN_BUILD) setShow(true)
        })
        .catch(() => {})
    } catch {
      // Versie opvragen lukt niet: dan geen balkje.
    }
  }, [])

  if (!show) return null

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Lukt niet: dan alleen weg tot de pagina opnieuw laadt.
    }
    setShow(false)
  }

  return (
    <div className="relative z-30 mx-auto max-w-xl px-3 pt-3 animate-fade-in">
      <div className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-surface px-4 py-3">
        <p className="flex-1 text-sm leading-snug">{t('message')}</p>
        <a
          href={PLAY_URL}
          className="shrink-0 rounded-full bg-accent text-on-accent text-sm font-semibold px-4 py-2 hover:bg-accent-hover active:scale-[0.97] transition-all touch-manipulation"
        >
          {t('button')}
        </a>
        <button
          onClick={dismiss}
          aria-label={t('close')}
          className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-muted hover:text-foreground transition-colors touch-manipulation"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
