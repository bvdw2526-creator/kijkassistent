'use client'

import { useState } from 'react'
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
  const releases = all ? RELEASES.slice(0, 5) : [LATEST_RELEASE]
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-[#1A2330] border border-[#2A3644] rounded-t-3xl sm:rounded-3xl max-h-[88vh] overflow-y-auto animate-sheet-up sm:animate-pop-in safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-[#3A4A5C]" />
        </div>
        <div className="p-6">
          <h2 className="font-display text-2xl mb-4">Wat is er nieuw</h2>
          <div className="flex flex-col gap-5 mb-6">
            {releases.map((release) => (
              <div key={release.id}>
                <p className="text-xs font-semibold tracking-wide uppercase text-[#E8A33D] mb-2">{release.date}</p>
                <ul className="flex flex-col gap-2">
                  {release.items.map((item) => (
                    <li key={item} className="flex gap-2.5 text-sm text-[#F2EFE9]/90 leading-relaxed">
                      <CheckIcon className="w-4 h-4 text-[#52A9A0] flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <button onClick={onClose} className={`${btnPrimary} w-full`}>
            Prima
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

  function dismiss() {
    markSeen(userId)
    setOpen(false)
    setVisible(false)
  }

  if (!visible) return null
  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl border border-[#E8A33D]/40 bg-[#E8A33D]/5 pl-4 pr-2 py-3 mb-5">
        <button onClick={() => setOpen(true)} className="flex-1 text-left touch-manipulation min-w-0">
          <span className="block text-sm font-medium">Kijkassistent is bijgewerkt</span>
          <span className="block text-xs text-[#E8A33D] mt-0.5">Bekijk wat er nieuw is</span>
        </button>
        <button onClick={dismiss} aria-label="Sluiten" className="text-[#93A3B5] hover:text-[#F2EFE9] transition-colors p-2 touch-manipulation">
          <span aria-hidden className="text-lg leading-none">×</span>
        </button>
      </div>
      {open && <WhatsNewSheet onClose={dismiss} />}
    </>
  )
}
