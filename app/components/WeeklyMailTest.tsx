'use client'

import { useState } from 'react'
import { authFetch } from '@/lib/supabase'
import { btnPrimary, btnSecondary, card } from './ui'

// Beheer: je eigen wekelijkse tipsmail bekijken of naar jezelf sturen (zie app/api/admin/weekly-mail).
export default function WeeklyMailTest() {
  const [preview, setPreview] = useState<{ subject: string; html: string; to: string } | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(method: 'GET' | 'POST') {
    setBusy(true)
    setMessage(null)
    try {
      const res = await authFetch('/api/admin/weekly-mail', { method })
      const data = await res.json()
      if (data.error) setMessage(data.error)
      else if (data.skipped) setMessage(`Geen mail: ${data.skipped}.`)
      else if (data.sent) setMessage(`Verstuurd naar ${data.sent}.`)
      else setPreview(data)
    } catch {
      setMessage('Er ging iets mis.')
    }
    setBusy(false)
  }

  async function sendToEveryone() {
    if (!window.confirm('De tipsmail nu naar alle gebruikers sturen die hem aan hebben staan?')) return
    setBusy(true)
    setMessage('Bezig met versturen… dit kan een minuut duren.')
    try {
      const res = await authFetch('/api/admin/weekly-mail-all', { method: 'POST' })
      const data = await res.json()
      if (data.error) setMessage(data.error)
      else {
        const skipped = Object.entries(data.skipped as Record<string, number>).map(([why, n]) => `${n}× ${why}`).join(', ')
        setMessage(
          `Verstuurd: ${data.sent}.` +
            (skipped ? ` Overgeslagen: ${skipped}.` : '') +
            (data.failed ? ` Mislukt: ${data.failed}.` : '') +
            (data.leftForNextRun ? ` Nog ${data.leftForNextRun} over: druk nog eens.` : '')
        )
      }
    } catch {
      setMessage('Er ging iets mis.')
    }
    setBusy(false)
  }

  return (
    <div className={`${card} p-5 mt-4`}>
      <p className="text-sm font-medium mb-1">Wekelijkse tipsmail</p>
      <p className="text-xs text-faint mb-4">Je eigen mail van deze week. De knoppen in de mail gaan naar de live app.</p>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => run('GET')} disabled={busy} className={btnSecondary}>
          Voorbeeld
        </button>
        <button onClick={() => run('POST')} disabled={busy} className={btnPrimary}>
          Stuur naar mij
        </button>
      </div>
      <button onClick={sendToEveryone} disabled={busy} className={`${btnSecondary} w-full mt-2`}>
        Nu naar iedereen versturen
      </button>
      <p className="text-[11px] text-faint mt-1.5">
        Gaat ook elke vrijdagmiddag vanzelf. Wie er deze week al een kreeg, slaat hij over.
      </p>
      {message && <p className="text-sm text-muted mt-3">{message}</p>}
      {preview && (
        <div className="mt-4">
          <p className="text-xs text-muted mb-2">
            Aan {preview.to} · <span className="text-foreground">{preview.subject}</span>
          </p>
          <iframe
            title="Voorbeeld tipsmail"
            srcDoc={preview.html.replace('<head>', '<head><base target="_blank">')}
            className="w-full h-[900px] rounded-xl border border-line bg-white"
          />
        </div>
      )}
    </div>
  )
}
