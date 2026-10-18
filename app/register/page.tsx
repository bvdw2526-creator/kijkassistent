'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { supabase } from '@/lib/supabase'
import { takePendingInvitePath } from '@/lib/invite'
import { btnPrimary, input } from '../components/ui'
import { CheckIcon } from '../components/Icons'
import LegalLinks from '../components/LegalLinks'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Na het aanmaken tonen we "controleer je e-mail" alleen als dat ook echt nodig is (zie
  // handleSignUp: staat "Confirm email" uit in Supabase, dan is er meteen een sessie en
  // loggen we net als bij inloggen direct door) — verwarrend om te vragen een mail te
  // checken die nooit verstuurd wordt.
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null)
  const router = useRouter()
  const t = useTranslations('register')
  const common = useTranslations('common')

  async function handleSignUp() {
    setError('')

    if (password !== passwordConfirm) {
      setError(common('passwordsDontMatch'))
      return
    }
    if (password.length < 8) {
      setError(common('passwordTooShort'))
      return
    }

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    })
    setLoading(false)
    if (error) {
      setError(
        error.message === 'User already registered'
          ? t('alreadyRegistered')
          : error.message
      )
      return
    }
    // Supabase geeft voor een al bestaand e-mailadres soms toch status 200 terug (bewust
    // zo, om te voorkomen dat je via een foutmelding kunt "raden" welke e-mailadressen al
    // een account hebben) — zonder deze check zou je hier ten onrechte "controleer je
    // e-mail" te zien krijgen terwijl er geen mail is verstuurd. Te herkennen aan een
    // lege identities-array op de teruggekomen user.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setError(t('alreadyRegistered'))
      return
    }

    if (data.session) {
      // "Confirm email" staat uit (of niet vereist voor dit account) — er is meteen een
      // sessie, dus net als bij inloggen direct door naar de app.
      router.push(takePendingInvitePath() ?? '/')
      return
    }

    // Wel een sessie-loze user terug, dus e-mailbevestiging staat aan: nog niets om naar
    // door te sturen, laat zien dat er een bevestigingsmail onderweg is.
    setSubmittedEmail(email)
  }

  if (submittedEmail) {
    return (
      <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
        <div className="w-12 h-12 rounded-full bg-teal/12 flex items-center justify-center mb-5">
          <CheckIcon className="w-6 h-6 text-teal" />
        </div>
        <h1 className="font-display text-2xl mb-2">{common('checkEmail')}</h1>
        <p className="text-muted leading-relaxed mb-1">
          {t('sentTo')}
        </p>
        <p className="font-medium mb-6">{submittedEmail}</p>
        <p className="text-muted text-sm leading-relaxed mb-8">
          {t('clickLink')}
        </p>
        <Link href="/login" className={btnPrimary}>
          {common('toLogin')}
        </Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
      <p className="font-display text-xs tracking-[0.2em] uppercase text-accent mb-2">{t('kicker')}</p>
      <h1 className="font-display text-3xl mb-1">{common('createAccount')}</h1>
      <p className="text-muted mb-8">{t('intro')}</p>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          handleSignUp()
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
          placeholder={t('passwordPlaceholder')}
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        <input
          type="password"
          placeholder={t('passwordConfirm')}
          autoComplete="new-password"
          required
          minLength={8}
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          className={input}
        />

        {error && (
          <p className="text-coral text-sm bg-coral/5 border border-coral/40 rounded-xl px-3.5 py-2.5">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={`${btnPrimary} mt-2`}>
          {loading ? common('loading') : common('createAccount')}
        </button>
        <p className="text-xs text-faint leading-relaxed">
          {t.rich('agree', {
            terms: (chunks) => <Link href="/voorwaarden" className="underline underline-offset-2 hover:text-muted">{chunks}</Link>,
            privacy: (chunks) => <Link href="/privacy" className="underline underline-offset-2 hover:text-muted">{chunks}</Link>,
          })}
        </p>
      </form>

      <p className="text-sm text-muted mt-6">
        {t('haveAccount')}{' '}
        <Link href="/login" className="text-accent hover:text-accent-hover transition-colors">
          {common('login')}
        </Link>
      </p>

      <LegalLinks className="mt-10" />
    </main>
  )
}
