'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { enablePush, pushState } from '@/lib/native'
import { btnPrimary, btnGhost } from './ui'

// Vraag op Voor jou, alleen in de app en alleen zolang de telefoon nog niet om toestemming heeft gevraagd. Eerst onze
// eigen uitleg; pas bij "Ja, graag" vraagt de telefoon zelf. "Nu niet" onthouden we; bij Instellingen kan het later.
const ASKED_KEY = 'kijkassistent:pushAsked'

export default function PushPrompt() {
  const t = useTranslations('pushPrompt')
  const [show, setShow] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(ASKED_KEY)) return
    } catch {
      return
    }
    pushState().then((state) => setShow(state === 'prompt'))
  }, [])

  if (!show) return null

  function remember() {
    try {
      localStorage.setItem(ASKED_KEY, '1')
    } catch {
      // Lukt niet: dan vragen we het de volgende keer weer.
    }
    setShow(false)
  }

  return (
    <div className="mb-5 rounded-2xl border border-accent/40 bg-surface px-4 py-4 animate-fade-in">
      <p className="text-sm font-semibold mb-1">{t('title')}</p>
      <p className="text-sm text-muted leading-snug mb-3">{t('text')}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={async () => {
            remember()
            await enablePush()
          }}
          className={btnPrimary}
        >
          {t('yes')}
        </button>
        <button onClick={remember} className={btnGhost}>
          {t('no')}
        </button>
      </div>
    </div>
  )
}
