'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { supabase } from '@/lib/supabase'
import { takePendingInvitePath } from '@/lib/invite'
import { btnPrimary, input } from '../components/ui'
import LegalLinks from '../components/LegalLinks'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const t = useTranslations('login')
  const common = useTranslations('common')

  async function handleSignIn() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(
        error.message === 'Email not confirmed'
          ? t('notConfirmed')
          : error.message === 'Invalid login credentials'
            ? t('wrongCredentials')
            : error.message
      )
      return
    }
    router.push(takePendingInvitePath() ?? '/')
  }

  return (
    <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
      <p className="font-display text-xs tracking-[0.2em] uppercase text-accent mb-2">{t('kicker')}</p>
      <h1 className="font-display text-3xl mb-1">Kijkassistent</h1>
      <p className="text-muted mb-8">{t('intro')}</p>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          handleSignIn()
        }}
      >
        <input
          type="email"
          placeholder={common('email')}
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <input
          type="password"
          placeholder={t('password')}
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        <Link href="/wachtwoord-vergeten" className="self-end text-sm text-muted hover:text-foreground transition-colors -mt-1">
          {t('forgot')}
        </Link>

        {error && (
          <p className="text-coral text-sm bg-coral/5 border border-coral/40 rounded-xl px-3.5 py-2.5">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={`${btnPrimary} mt-2`}>
          {loading ? common('loading') : common('login')}
        </button>
      </form>

      <p className="text-sm text-muted mt-6">
        {t('noAccount')}{' '}
        <Link href="/register" className="text-accent hover:text-accent-hover transition-colors">
          {common('createAccount')}
        </Link>
      </p>

      <LegalLinks className="mt-10" />
    </main>
  )
}
