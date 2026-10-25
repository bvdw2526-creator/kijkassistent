'use client'

import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { VIDEO_STORE_SKIN } from '@/lib/skins'
import { useSkin } from '@/lib/useSkin'
import { VIDEOTHEEK_WELCOME_KEY } from '@/lib/videotheek'
import { CloseIcon } from './Icons'

const WELCOME_CHANGED_EVENT = 'kijkassistent:videotheek-welkom-gewijzigd'

function readWelcome(): boolean {
  try {
    return localStorage.getItem(VIDEOTHEEK_WELCOME_KEY) === '1'
  } catch {
    return false
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(WELCOME_CHANGED_EVENT, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(WELCOME_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

function dismiss() {
  try {
    localStorage.removeItem(VIDEOTHEEK_WELCOME_KEY)
  } catch {
    // Kan het niet weg, dan blijft het tot de volgende keer; geen ramp.
  }
  window.dispatchEvent(new Event(WELCOME_CHANGED_EVENT))
}

// Eén keer na aanmelden via de openbare videotheek (zie app/register/page.tsx): de Videotheek-skin staat aan, en dit
// briefje vertelt dat je dat bij Instellingen kunt veranderen. Weg met het kruisje, of vanzelf als je een andere skin kiest.
export default function VideotheekWelcome() {
  const t = useTranslations('videotheekWelcome')
  const show = useSyncExternalStore(subscribe, readWelcome, () => false)
  const skin = useSkin()
  if (!show || skin !== VIDEO_STORE_SKIN) return null
  return (
    <div className="relative mb-5 -rotate-[0.6deg] rounded-[4px] border-2 border-accent bg-accent/10 px-4 py-3 pr-10 animate-fade-in">
      <p className="font-display text-sm uppercase tracking-[0.12em] text-accent">{t('title')}</p>
      <p className="text-sm text-foreground/85 mt-1 leading-relaxed">
        {t.rich('text', {
          link: (chunks) => (
            <Link href="/settings" onClick={dismiss} className="text-accent underline underline-offset-2 hover:text-accent-hover">
              {chunks}
            </Link>
          ),
        })}
      </p>
      <button onClick={dismiss} aria-label={t('close')} className="absolute right-2 top-2 rounded-full p-1.5 text-muted hover:text-foreground hover:bg-white/5">
        <CloseIcon className="w-4 h-4" />
      </button>
    </div>
  )
}
