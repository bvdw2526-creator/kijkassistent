'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { authFetch } from '@/lib/supabase'
import { enablePush, pushState, type PushState } from '@/lib/native'
import { btnPrimary } from './ui'

type Kind = 'weekly' | 'series' | 'partner'
const KINDS: Kind[] = ['weekly', 'series', 'partner']

// Instellingen > Meldingen. Alleen in een app-versie met pushmeldingen; op de website toont dit niets.
export default function PushSettings({ title, rowClass }: { title: React.ReactNode; rowClass: string }) {
  const t = useTranslations('pushSettings')
  const [state, setState] = useState<PushState>('unavailable')
  const [settings, setSettings] = useState<Record<Kind, boolean> | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    pushState().then((s) => {
      setState(s)
      if (s === 'unavailable') return
      authFetch('/api/push/settings')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data?.settings && setSettings(data.settings))
        .catch(() => {})
    })
  }, [])

  if (state === 'unavailable' || !settings) return null

  async function toggle(kind: Kind) {
    if (!settings) return
    const next = { ...settings, [kind]: !settings[kind] }
    setSettings(next)
    setError(false)
    const res = await authFetch('/api/push/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [kind]: next[kind] }),
    }).catch(() => null)
    if (!res?.ok) {
      setSettings(settings)
      setError(true)
    }
  }

  return (
    <>
      {title}
      <p className="text-xs text-muted mb-3">{t('intro')}</p>
      {state === 'prompt' && (
        <button onClick={async () => setState(await enablePush())} className={`${btnPrimary} w-full mb-3`}>
          {t('enable')}
        </button>
      )}
      {state === 'denied' && <p className="text-sm text-coral mb-3">{t('denied')}</p>}
      {state === 'granted' &&
        KINDS.map((kind) => (
          <button
            key={kind}
            role="switch"
            aria-checked={settings[kind]}
            onClick={() => toggle(kind)}
            className={`${rowClass} w-full text-left touch-manipulation`}
          >
            <span>
              <span className="block text-sm font-medium">{t(kind)}</span>
              <span className="block text-xs text-muted mt-0.5">{t(`${kind}Sub`)}</span>
            </span>
            <span className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors ${settings[kind] ? 'bg-accent' : 'bg-control'}`}>
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${settings[kind] ? 'left-[22px]' : 'left-0.5'}`}
              />
            </span>
          </button>
        ))}
      {error && <p className="text-sm text-coral mb-3">{t('errSave')}</p>}
    </>
  )
}
