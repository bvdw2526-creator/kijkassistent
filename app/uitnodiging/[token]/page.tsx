'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase, getCurrentUser } from '@/lib/supabase'
import { rememberInvite } from '@/lib/invite'
import { btnPrimary, btnSecondary } from '../../components/ui'
import { UsersIcon, CheckIcon } from '../../components/Icons'
import LegalLinks from '../../components/LegalLinks'

type Status = 'loading' | 'invalid' | 'login-needed' | 'ready' | 'accepting' | 'done'

export default function Uitnodiging() {
  const { token: rawToken } = useParams<{ token: string }>()
  const token = decodeURIComponent(rawToken)
  const [status, setStatus] = useState<Status>('loading')
  const [inviter, setInviter] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: hint } = await supabase.rpc('preview_partner_invite', { p_token: token })
      if (cancelled) return
      if (!hint) {
        setStatus('invalid')
        return
      }
      setInviter(hint)
      const user = await getCurrentUser()
      if (cancelled) return
      if (user) {
        setStatus('ready')
      } else {
        rememberInvite(token)
        setStatus('login-needed')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [token])

  async function accept() {
    setStatus('accepting')
    setError(null)
    const { error: rpcError } = await supabase.rpc('accept_partner_invite', { p_token: token })
    if (rpcError) {
      setError(rpcError.message)
      setStatus('ready')
      return
    }
    setStatus('done')
  }

  return (
    <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
      <p className="font-display text-xs tracking-[0.2em] uppercase text-[#E8A33D] mb-3">Kijkassistent</p>

      {status === 'loading' && <div className="h-40 rounded-2xl bg-[#1A2330] animate-skeleton" />}

      {status === 'invalid' && (
        <>
          <h1 className="font-display text-3xl mb-2">Uitnodiging niet geldig</h1>
          <p className="text-[#93A3B5] mb-8 leading-relaxed">
            Deze link is al gebruikt of verlopen. Vraag je partner om een nieuwe link te maken bij Instellingen.
          </p>
          <Link href="/" className={btnSecondary}>Naar de app</Link>
        </>
      )}

      {(status === 'login-needed' || status === 'ready' || status === 'accepting') && (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E8A33D]/12 text-[#E8A33D] mb-5">
            <UsersIcon className="w-6 h-6" />
          </div>
          <h1 className="font-display text-3xl mb-2">Samen kijken</h1>
          <p className="text-[#93A3B5] mb-8 leading-relaxed">
            <span className="text-[#F2EFE9]">{inviter}</span> nodigt je uit om te koppelen. Daarna krijgen jullie
            aanbevelingen die bij jullie allebei passen.
          </p>

          {error && (
            <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-4">
              {error}
            </p>
          )}

          {status === 'login-needed' ? (
            <div className="flex flex-col gap-3">
              <Link href="/register" className={btnPrimary}>Account aanmaken</Link>
              <Link href="/login" className={btnSecondary}>Ik heb al een account</Link>
            </div>
          ) : (
            <button onClick={accept} disabled={status === 'accepting'} className={btnPrimary}>
              {status === 'accepting' ? 'Bezig...' : 'Koppelen'}
            </button>
          )}
        </>
      )}

      {status === 'done' && (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#52A9A0]/12 text-[#52A9A0] mb-5">
            <CheckIcon className="w-6 h-6" />
          </div>
          <h1 className="font-display text-3xl mb-2">Jullie zijn gekoppeld</h1>
          <p className="text-[#93A3B5] mb-8 leading-relaxed">
            Bekijk de tab &quot;Samen&quot; bij Voor jou voor aanbevelingen die jullie allebei leuk vinden. Hoe meer
            jullie allebei beoordelen, hoe scherper ze worden.
          </p>
          <Link href="/" className={btnPrimary}>Verder</Link>
        </>
      )}

      <LegalLinks className="mt-12" />
    </main>
  )
}
