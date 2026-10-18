'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { supabase } from '@/lib/supabase'
import { btnPrimary, input } from '../components/ui'
import { CheckIcon } from '../components/Icons'
import LegalLinks from '../components/LegalLinks'

export default function WachtwoordVergeten() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const t = useTranslations('forgotPassword')
  const common = useTranslations('common')

  async function handleSubmit() {
    setLoading(true)
    setError('')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/wachtwoord-resetten`,
    })
    setLoading(false)
    // Bewust dezelfde melding of het adres bij een account hoort of niet (Supabase geeft dat ook niet prijs):
    // zo kun je hier niet uitproberen welke e-mailadressen een account hebben. Alleen een te snel achter
    // elkaar aanvragen krijgt een eigen melding.
    if (resetError && /rate limit|too many|seconds/i.test(resetError.message)) {
      setError(t('tooSoon'))
      return
    }
    if (resetError && resetError.status !== 400 && resetError.status !== 422) {
      setError(t('failed'))
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
        <div className="w-12 h-12 rounded-full bg-teal/12 flex items-center justify-center mb-5">
          <CheckIcon className="w-6 h-6 text-teal" />
        </div>
        <h1 className="font-display text-2xl mb-2">{common('checkEmail')}</h1>
        <p className="text-muted leading-relaxed mb-6">
          {t.rich('sent', { email: () => <span className="text-foreground">{email}</span> })}
        </p>
        <Link href="/login" className="text-accent hover:text-accent-hover transition-colors text-sm">
          {common('backToLogin')}
        </Link>
        <LegalLinks className="mt-10" />
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
          type="email"
          placeholder={common('email')}
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />

        {error && (
          <p className="text-coral text-sm bg-coral/5 border border-coral/40 rounded-xl px-3.5 py-2.5">{error}</p>
        )}

        <button type="submit" disabled={loading} className={`${btnPrimary} mt-2`}>
          {loading ? common('loading') : t('submit')}
        </button>
      </form>

      <p className="text-sm text-muted mt-6">
        <Link href="/login" className="text-accent hover:text-accent-hover transition-colors">
          {common('backToLogin')}
        </Link>
      </p>

      <LegalLinks className="mt-10" />
    </main>
  )
}
