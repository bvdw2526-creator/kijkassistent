'use client'

import { useState } from 'react'
import { authFetch } from '@/lib/supabase'
import { btnPrimary, card } from './ui'

type Result = { platform: string; status: 'ok' | 'gone' | 'failed'; detail?: string }

// Beheer: een testmelding naar je eigen telefoons (zie app/api/admin/push-test).
export default function PushTest() {
  const [lines, setLines] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  async function send() {
    setBusy(true)
    setLines(null)
    try {
      const res = await authFetch('/api/admin/push-test', { method: 'POST' })
      const data = (await res.json()) as { results?: Result[]; error?: string }
      if (data.error) setLines([data.error])
      else if (!data.results || data.results.length === 0) {
        setLines(['Geen telefoon aangemeld. Open de app en sta meldingen toe.'])
      } else {
        setLines(
          data.results.map((r) => {
            const name = r.platform === 'ios' ? 'iPhone' : 'Android'
            if (r.status === 'ok') return `${name}: verstuurd ✓`
            if (r.status === 'gone') return `${name}: adres bestaat niet meer (${r.detail ?? ''})`
            return `${name}: mislukt (${r.detail ?? 'onbekend'})`
          })
        )
      }
    } catch {
      setLines(['Er ging iets mis.'])
    }
    setBusy(false)
  }

  return (
    <div className={`${card} p-5 mt-4`}>
      <p className="text-sm font-medium mb-1">Pushmeldingen</p>
      <p className="text-xs text-faint mb-4">Stuurt een testmelding naar al je eigen telefoons met de app.</p>
      <button onClick={send} disabled={busy} className={`${btnPrimary} w-full`}>
        {busy ? 'Bezig…' : 'Stuur testmelding'}
      </button>
      {lines && (
        <div className="mt-3 flex flex-col gap-1">
          {lines.map((line, i) => (
            <p key={i} className="text-sm text-muted break-words">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
