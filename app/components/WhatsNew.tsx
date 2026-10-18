'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { RELEASES, LATEST_RELEASE } from '@/lib/releaseNotes'
import { useBackToClose } from './useBackToClose'
import { btnPrimary } from './ui'
import { CheckIcon } from './Icons'

const seenKey = (userId: string) => `kijkassistent:whatsnew:${userId}`

function markSeen(userId: string) {
  try {
    localStorage.setItem(seenKey(userId), LATEST_RELEASE.id)
  } catch {
    // Privénavigatie of geblokkeerde opslag: dan zien we het kaartje de volgende keer gewoon nog een keer.
  }
}

// Het venster met de vernieuwingen. Zonder `all` alleen de laatste update; met `all` de laatste paar.
export function WhatsNewSheet({ onClose, all = false }: { onClose: () => void; all?: boolean }) {
  useBackToClose(true, onClose)
  const t = useTranslations('whatsNew')
  const releases = all ? RELEASES.slice(0, 5) : [LATEST_RELEASE]
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-surface border border-line rounded-t-3xl sm:rounded-3xl max-h-[88vh] overflow-y-auto animate-sheet-up sm:animate-pop-in safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-control" />
        </div>
        <div className="p-6">
          <h2 className="font-display text-2xl mb-4">{t('title')}</h2>
          <div className="flex flex-col gap-5 mb-6">
            {releases.map((release) => (
              <div key={release.id}>
                <p className="text-xs font-semibold tracking-wide uppercase text-accent mb-2">{release.date}</p>
                <ul className="flex flex-col gap-2">
                  {release.items.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm text-foreground/90 leading-relaxed">
                      <CheckIcon className="w-4 h-4 text-teal flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <button onClick={onClose} className={`${btnPrimary} w-full`}>
            {t('ok')}
          </button>
        </div>
      </div>
    </div>
  )
}

// Eenmalig kaartje op "Voor jou" na een update. Nieuwe gebruikers zien het niet: voor hen is niets "nieuw".
export default function WhatsNew({ userId, createdAt }: { userId: string; createdAt?: string }) {
  const [visible, setVisible] = useState(() => {
    try {
      const seen = localStorage.getItem(seenKey(userId))
      if (seen === LATEST_RELEASE.id) return false
      if (seen === null && createdAt && Date.now() - new Date(createdAt).getTime() < 24 * 60 * 60 * 1000) {
        markSeen(userId)
        return false
      }
      return true
    } catch {
      return false
    }
  })
  const [open, setOpen] = useState(false)
  const t = useTranslations('whatsNew')
  const tt = useTranslations('title')

  function dismiss() {
    markSeen(userId)
    setOpen(false)
    setVisible(false)
  }

  if (!visible) return null
  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/5 pl-4 pr-2 py-3 mb-5">
        <button onClick={() => setOpen(true)} className="flex-1 text-left touch-manipulation min-w-0">
          <span className="block text-sm font-medium">{t('updated')}</span>
          <span className="block text-xs text-accent mt-0.5">{t('seeWhatsNew')}</span>
        </button>
        <button onClick={dismiss} aria-label={tt('close')} className="text-muted hover:text-foreground transition-colors p-2 touch-manipulation">
          <span aria-hidden className="text-lg leading-none">×</span>
        </button>
      </div>
      {open && <WhatsNewSheet onClose={dismiss} />}
    </>
  )
}
