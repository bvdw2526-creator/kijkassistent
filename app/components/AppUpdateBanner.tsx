'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CloseIcon } from './Icons'

// Balkje bovenaan in de Android- en iPhone-app als de geïnstalleerde versie ouder is dan de nieuwste. Met een knop naar
// de Play Store of naar TestFlight/App Store. Weggeklikt komt het pas terug als de app opnieuw wordt geopend.
//
// LET OP: verhoog LATEST pas als de nieuwe versie echt in de winkel staat (Play: gesloten test of productie, iPhone:
// verwerkt in TestFlight of goedgekeurd), anders krijgen mensen een melding terwijl er nog niets te halen is.
const LATEST = { android: '4.2.0', ios: '4.2.0' }

const STORE_URL = {
  android: 'https://play.google.com/store/apps/details?id=nl.kijkassistent.app',
  // Zolang de app alleen via TestFlight gaat, opent dit de TestFlight-app. Staat hij in de App Store, vervang dit dan
  // door https://apps.apple.com/app/id<Apple-ID> (Apple-ID: App Store Connect > App-informatie).
  ios: 'itms-beta://',
}

const DISMISSED_KEY = 'kijkassistent:appUpdateDismissed'

type Platform = keyof typeof LATEST

type CapacitorWindow = Window & {
  Capacitor?: { Plugins?: { App?: { getInfo?: () => Promise<{ build: string; version: string }> } } }
}

/** Is versie a (bijv. "4.1.1") ouder dan b ("4.2.0")? Onleesbare versies tellen als niet ouder. */
function isOlder(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10))
  const pb = b.split('.').map((n) => parseInt(n, 10))
  if (pa.some((n) => !Number.isFinite(n)) || pb.some((n) => !Number.isFinite(n))) return false
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y
  }
  return false
}

function detectPlatform(): Platform | null {
  const ua = navigator.userAgent
  if (ua.includes('KijkassistentApp/Android')) return 'android'
  if (ua.includes('KijkassistentApp/iOS')) return 'ios'
  return null
}

export default function AppUpdateBanner() {
  const [platform, setPlatform] = useState<Platform | null>(null)
  const t = useTranslations('appUpdate')

  useEffect(() => {
    const p = detectPlatform()
    if (!p) return
    try {
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
          if (isOlder(info.version, LATEST[p])) setPlatform(p)
        })
        .catch(() => {})
    } catch {
      // Versie opvragen lukt niet: dan geen balkje.
    }
  }, [])

  if (!platform) return null

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      // Lukt niet: dan alleen weg tot de pagina opnieuw laadt.
    }
    setPlatform(null)
  }

  return (
    <div className="relative z-30 mx-auto max-w-xl px-3 pt-3 animate-fade-in">
      <div className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-surface px-4 py-3">
        <p className="flex-1 text-sm leading-snug">{t('message')}</p>
        <a
          href={STORE_URL[platform]}
          className="shrink-0 whitespace-nowrap rounded-full bg-accent text-on-accent text-sm font-semibold px-4 py-2 hover:bg-accent-hover active:scale-[0.97] transition-all touch-manipulation"
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
