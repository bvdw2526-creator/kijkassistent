'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { supabase } from '@/lib/supabase'
import { btnPrimary, input } from '../components/ui'
import { CheckIcon } from '../components/Icons'
import LegalLinks from '../components/LegalLinks'

// Hier komt de link uit de "wachtwoord vergeten"-mail uit. Supabase leest het token uit de link en maakt een
// tijdelijke sessie; met die sessie mag je één ding: een nieuw wachtwoord kiezen.
export default function WachtwoordResetten() {
  const router = useRouter()
  const [status, setStatus] = useState<'controleren' | 'klaar' | 'ongeldig'>('controleren')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const t = useTranslations('resetPassword')
  const common = useTranslations('common')

  useEffect(() => {
    // De sessie uit de link wordt asynchroon verwerkt: wacht op de melding, en geef het een paar seconden
    // voor je concludeert dat de link niet (meer) geldig is.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) setStatus('klaar')
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setStatus('klaar')
    })
    const timeout = setTimeout(() => setStatus((current) => (current === 'controleren' ? 'ongeldig' : current)), 4000)
    return () => {
      listener.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit() {
    setError('')
    if (password.length < 8) {
      setError(common('passwordTooShort'))
      return
    }
    if (password !== passwordConfirm) {
      setError(common('passwordsDontMatch'))
      return
    }
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setError(
        /same|different from the old/i.test(updateError.message)
          ? t('sameAsOld')
          : /weak|pwned|leaked|easy to guess/i.test(updateError.message)
            ? t('tooWeak')
            : t('saveFailed')
      )
      return
    }
    setDone(true)
    setTimeout(() => router.push('/'), 1800)
  }

  if (done) {
    return (
      <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
        <div className="w-12 h-12 rounded-full bg-teal/12 flex items-center justify-center mb-5">
          <CheckIcon className="w-6 h-6 text-teal" />
        </div>
        <h1 className="font-display text-2xl mb-2">{t('doneTitle')}</h1>
        <p className="text-muted leading-relaxed">{t('doneText')}</p>
      </main>
    )
  }

  if (status === 'ongeldig') {
    return (
      <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
        <h1 className="font-display text-2xl mb-2">{t('invalidTitle')}</h1>
        <p className="text-muted leading-relaxed mb-6">
          {t('invalidText')}
        </p>
        <Link href="/wachtwoord-vergeten" className={btnPrimary}>
          {t('requestNew')}
        </Link>
        <LegalLinks className="mt-10" />
      </main>
    )
  }

  if (status === 'controleren') {
    return (
      <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
        <p className="text-muted">{t('checking')}</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
      <p className="font-display text-xs tracking-[0.2em] uppercase text-accent mb-2">Kijkassistent</p>
      <h1 className="font-display text-3xl mb-1">{t('title')}</h1>
      <p className="text-muted mb-8">{t('intro')}</p>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
      >
        <input
          type="password"
          placeholder={t('newPassword')}
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        <input
          type="password"
          placeholder={t('repeat')}
          autoComplete="new-password"
          required
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          className={input}
        />

        {error && (
          <p className="text-coral text-sm bg-coral/5 border border-coral/40 rounded-xl px-3.5 py-2.5">{error}</p>
        )}

        <button type="submit" disabled={loading} className={`${btnPrimary} mt-2`}>
          {loading ? common('loading') : t('save')}
        </button>
      </form>

      <LegalLinks className="mt-10" />
    </main>
  )
}
