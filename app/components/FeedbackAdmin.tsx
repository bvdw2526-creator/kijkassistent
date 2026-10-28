'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { card } from './ui'

// Feedback uit de app, alleen voor de beheerder (/beheer). Lezen en afhandelen mag alleen de beheerder
// (regels in migratie 20261028_feedback). Nederlands is hier genoeg: het beheerscherm hoeft niet tweetalig.
type Row = {
  id: string
  email: string | null
  kind: 'idea' | 'bug' | 'compliment'
  message: string
  may_contact: boolean
  locale: string | null
  platform: string | null
  app_version: string | null
  created_at: string
  handled_at: string | null
}

const KIND: Record<Row['kind'], { label: string; tone: string }> = {
  idea: { label: '💡 Idee', tone: 'bg-accent/12 text-accent' },
  bug: { label: '🐞 Werkt niet', tone: 'bg-coral/12 text-coral' },
  compliment: { label: '❤️ Compliment', tone: 'bg-teal/12 text-teal' },
}

const PLATFORM: Record<string, string> = { android_app: 'Android-app', ios_app: 'iPhone-app', installed: 'geïnstalleerd', web: 'browser' }

export default function FeedbackAdmin() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showHandled, setShowHandled] = useState(false)

  useEffect(() => {
    let cancelled = false
    supabase
      .from('feedback')
      .select('id, email, kind, message, may_contact, locale, platform, app_version, created_at, handled_at')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error: dbError }) => {
        if (cancelled) return
        if (dbError) setError(dbError.message)
        else setRows((data ?? []) as Row[])
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function toggleHandled(row: Row) {
    const handled_at = row.handled_at ? null : new Date().toISOString()
    const { error: dbError } = await supabase.from('feedback').update({ handled_at }).eq('id', row.id)
    if (dbError) {
      setError(dbError.message)
      return
    }
    setRows((current) => current?.map((r) => (r.id === row.id ? { ...r, handled_at } : r)) ?? null)
  }

  const open = rows?.filter((r) => !r.handled_at) ?? []
  const visible = showHandled ? rows ?? [] : open

  return (
    <div className={`${card} p-5 mt-4`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm font-medium">Feedback</p>
          <p className="text-xs text-faint mt-0.5">
            {rows === null ? 'Laden…' : `${open.length} nieuw · ${rows.length} in totaal`}
          </p>
        </div>
        {rows && rows.length > open.length && (
          <button onClick={() => setShowHandled(!showHandled)} className="text-xs text-accent touch-manipulation">
            {showHandled ? 'Alleen nieuwe' : 'Ook afgehandeld'}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-coral">{error}</p>}
      {rows && visible.length === 0 && <p className="text-sm text-muted">Geen nieuwe feedback.</p>}

      <ul className="flex flex-col divide-y divide-line">
        {visible.map((r) => (
          <li key={r.id} className={`py-3 first:pt-0 last:pb-0 ${r.handled_at ? 'opacity-55' : ''}`}>
            <div className="flex items-center justify-between gap-3">
              <span className={`rounded-full px-2 py-0.5 text-[10px] ${KIND[r.kind].tone}`}>{KIND[r.kind].label}</span>
              <span className="text-[11px] text-faint">
                {new Date(r.created_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-sm mt-2 whitespace-pre-wrap break-words">{r.message}</p>
            <p className="text-xs text-muted mt-2">
              {r.may_contact && r.email ? (
                <a href={`mailto:${r.email}?subject=${encodeURIComponent('Je feedback over Kijkassistent')}`} className="text-accent">
                  {r.email}
                </a>
              ) : (
                <span>{r.email ?? 'onbekend'} · wil niet gemaild worden</span>
              )}
              {' · '}
              {PLATFORM[r.platform ?? ''] ?? r.platform ?? '?'}
              {r.app_version ? ` ${r.app_version}` : ''}
              {r.locale ? ` · ${r.locale}` : ''}
            </p>
            <button onClick={() => toggleHandled(r)} className="text-xs text-accent mt-2 touch-manipulation">
              {r.handled_at ? 'Toch weer open zetten' : 'Afgehandeld'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
