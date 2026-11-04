'use client'

import { useSyncExternalStore } from 'react'
import { useTranslations } from 'next-intl'
import { playStoreUrl, type AppLinkPlace } from '@/lib/appStores'
import { btnSecondary } from './ui'

// Verwijzing naar de Android-app in Google Play, voor bezoekers van de site (startpagina, /tip, /videotheek).
// Niet tonen in de app zelf (Android- of iPhone-app herkenbaar aan "KijkassistentApp" in de user agent) en niet op een
// iPhone of iPad: daar komt een App Store-link als de iPhone-app er is. Pas na het laden bepaald, zodat de server en
// de browser hetzelfde tekenen. Bewust zonder het Google Play-logo (merkregels): alleen tekst in de huisstijl.
const noSubscribe = () => () => {}

function shouldShow(): boolean {
  const ua = navigator.userAgent
  if (ua.includes('KijkassistentApp')) return false
  const iOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  return !iOS
}

export default function GetAppLink({ place, variant = 'line', className = '' }: { place: AppLinkPlace; variant?: 'line' | 'button'; className?: string }) {
  const t = useTranslations('getApp')
  // Op de server (en bij de eerste tekening) niets; in de browser bepaald door het toestel.
  const show = useSyncExternalStore(noSubscribe, shouldShow, () => false)

  if (!show) return null
  const href = playStoreUrl(place)

  if (variant === 'button') {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={`${btnSecondary} ${className}`}>
        <span aria-hidden="true">📱</span>
        {t('button')}
      </a>
    )
  }

  return (
    <p className={`text-sm text-muted ${className}`}>
      <span aria-hidden="true">📱</span> {t('lead')}{' '}
      <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent font-medium hover:text-accent-hover transition-colors">
        {t('link')}
      </a>
    </p>
  )
}
