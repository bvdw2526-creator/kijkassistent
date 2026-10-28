'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { authFetch } from '@/lib/supabase'
import { useBackToClose } from './useBackToClose'
import { btnPrimary, btnGhost, chip, input } from './ui'
import { CheckIcon } from './Icons'

// Feedback insturen vanuit Instellingen: een idee, iets wat niet werkt of een compliment. De server bewaart het en
// mailt de beheerder (app/api/feedback). Teksten: "feedback" in messages/*.json.
const KINDS = [
  { id: 'idea', label: 'kindIdea', emoji: '💡' },
  { id: 'bug', label: 'kindBug', emoji: '🐞' },
  { id: 'compliment', label: 'kindCompliment', emoji: '❤️' },
] as const
type Kind = (typeof KINDS)[number]['id']
const MAX_LENGTH = 1000

type CapacitorWindow = Window & {
  Capacitor?: { Plugins?: { App?: { getInfo?: () => Promise<{ build: string; version: string }> } } }
}

// Waar het bericht vandaan komt, zodat een probleem na te gaan is: de Android- of iPhone-app (met versie), de
// geïnstalleerde webversie of de gewone browser.
async function deviceInfo(): Promise<{ platform: string; appVersion: string | null }> {
  const ua = navigator.userAgent
  const platform = ua.includes('KijkassistentApp/Android')
    ? 'android_app'
    : ua.includes('KijkassistentApp/iOS')
      ? 'ios_app'
      : window.matchMedia('(display-mode: standalone)').matches
        ? 'installed'
        : 'web'
  let appVersion: string | null = null
  const app = (window as CapacitorWindow).Capacitor?.Plugins?.App
  if (typeof app?.getInfo === 'function') {
    try {
      const info = await app.getInfo()
      appVersion = `${info.version} (${info.build})`
    } catch {
      // Geen versie: dan zonder.
    }
  }
  return { platform, appVersion }
}

export default function FeedbackSheet({ onClose }: { onClose: () => void }) {
  useBackToClose(true, onClose)
  const t = useTranslations('feedback')
  const [kind, setKind] = useState<Kind>('idea')
  const [message, setMessage] = useState('')
  const [mayContact, setMayContact] = useState(true)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!message.trim() || state === 'sending') return
    setState('sending')
    setError(null)
    try {
      const { platform, appVersion } = await deviceInfo()
      const res = await authFetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, message: message.trim(), mayContact, platform, appVersion }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(typeof data.error === 'string' ? data.error : t('error'))
        setState('error')
        return
      }
      setState('sent')
    } catch {
      setError(t('error'))
      setState('error')
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-surface border border-line rounded-t-3xl sm:rounded-3xl max-h-[88vh] overflow-y-auto animate-sheet-up sm:animate-pop-in safe-bottom"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
      >
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-control" />
        </div>
        <div className="p-6">
          {state === 'sent' ? (
            <div className="text-center py-4">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-teal/12">
                <CheckIcon className="w-6 h-6 text-teal" />
              </div>
              <h2 id="feedback-title" className="font-display text-2xl mb-2">{t('thanksTitle')}</h2>
              <p className="text-muted text-sm leading-relaxed mb-6">{t('thanksText')}</p>
              <button onClick={onClose} className={`${btnPrimary} w-full`}>
                {t('close')}
              </button>
            </div>
          ) : (
            <>
              <h2 id="feedback-title" className="font-display text-2xl mb-1">{t('title')}</h2>
              <p className="text-muted text-sm leading-relaxed mb-5">{t('intro')}</p>

              <div className="flex flex-wrap gap-2 mb-4" role="radiogroup" aria-label={t('kindLabel')}>
                {KINDS.map((k) => (
                  <button
                    key={k.id}
                    role="radio"
                    aria-checked={kind === k.id}
                    onClick={() => setKind(k.id)}
                    className={chip(kind === k.id)}
                  >
                    <span aria-hidden="true">{k.emoji}</span> {t(k.label)}
                  </button>
                ))}
              </div>

              <label htmlFor="feedback-message" className="sr-only">{t('messageLabel')}</label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_LENGTH))}
                placeholder={t(kind === 'bug' ? 'placeholderBug' : kind === 'compliment' ? 'placeholderCompliment' : 'placeholderIdea')}
                rows={5}
                className={`${input} resize-none text-sm leading-relaxed`}
              />
              <p className="text-right text-[11px] text-faint mt-1 mb-3">{message.length} / {MAX_LENGTH}</p>

              <label className="flex items-start gap-3 text-sm mb-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mayContact}
                  onChange={(e) => setMayContact(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                />
                <span className="text-foreground/90">{t('mayContact')}</span>
              </label>

              {error && <p className="text-sm text-coral mb-3">{error}</p>}

              <div className="flex flex-col gap-2">
                <button onClick={send} disabled={!message.trim() || state === 'sending'} className={`${btnPrimary} w-full`}>
                  {state === 'sending' ? t('sending') : t('send')}
                </button>
                <button onClick={onClose} className={`${btnGhost} w-full`}>
                  {t('cancel')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
