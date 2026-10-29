'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { supabase, getCurrentUser, authFetch } from '@/lib/supabase'
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
  const t = useTranslations('invite')
  const common = useTranslations('common')
  const tt = useTranslations('title')

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
    // De uitnodiger krijgt een melding dat het gelukt is (als die de app met meldingen heeft).
    authFetch('/api/push/partner', { method: 'POST' }).catch(() => {})
  }

  return (
    <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
      <p className="font-display text-xs tracking-[0.2em] uppercase text-accent mb-3">Kijkassistent</p>

      {status === 'loading' && <div className="h-40 rounded-2xl bg-surface animate-skeleton" />}

      {status === 'invalid' && (
        <>
          <h1 className="font-display text-3xl mb-2">{t('invalidTitle')}</h1>
          <p className="text-muted mb-8 leading-relaxed">
            {t('invalidText')}
          </p>
          <Link href="/" className={btnSecondary}>{t('toApp')}</Link>
        </>
      )}

      {(status === 'login-needed' || status === 'ready' || status === 'accepting') && (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/12 text-accent mb-5">
            <UsersIcon className="w-6 h-6" />
          </div>
          <h1 className="font-display text-3xl mb-2">{t('title')}</h1>
          <p className="text-muted mb-8 leading-relaxed">
            {t.rich('text', { b: () => <span className="text-foreground">{inviter}</span> })}
          </p>

          {error && (
            <p className="text-sm text-coral border border-coral/40 bg-coral/5 rounded-xl px-3.5 py-2.5 mb-4">
              {error}
            </p>
          )}

          {status === 'login-needed' ? (
            <div className="flex flex-col gap-3">
              <Link href="/register" className={btnPrimary}>{common('createAccount')}</Link>
              <Link href="/login" className={btnSecondary}>{t('haveAccount')}</Link>
            </div>
          ) : (
            <button onClick={accept} disabled={status === 'accepting'} className={btnPrimary}>
              {status === 'accepting' ? tt('loadingShort') : t('link')}
            </button>
          )}
        </>
      )}

      {status === 'done' && (
        <>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal/12 text-teal mb-5">
            <CheckIcon className="w-6 h-6" />
          </div>
          <h1 className="font-display text-3xl mb-2">{t('doneTitle')}</h1>
          <p className="text-muted mb-8 leading-relaxed">
            {t('doneText')}
          </p>
          <Link href="/" className={btnPrimary}>{t('continue')}</Link>
        </>
      )}

      <LegalLinks className="mt-12" />
    </main>
  )
}
