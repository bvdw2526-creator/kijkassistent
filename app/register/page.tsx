'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { btnPrimary, input } from '../components/ui'
import { CheckIcon } from '../components/Icons'

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

  async function handleSignUp() {
    setError('')

    if (password !== passwordConfirm) {
      setError('De wachtwoorden komen niet overeen.')
      return
    }
    if (password.length < 8) {
      setError('Je wachtwoord moet minimaal 8 tekens lang zijn.')
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
          ? 'Dit e-mailadres heeft al een account. Probeer in te loggen.'
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
      setError('Dit e-mailadres heeft al een account. Probeer in te loggen.')
      return
    }

    if (data.session) {
      // "Confirm email" staat uit (of niet vereist voor dit account) — er is meteen een
      // sessie, dus net als bij inloggen direct door naar de app.
      router.push('/')
      return
    }

    // Wel een sessie-loze user terug, dus e-mailbevestiging staat aan: nog niets om naar
    // door te sturen, laat zien dat er een bevestigingsmail onderweg is.
    setSubmittedEmail(email)
  }

  if (submittedEmail) {
    return (
      <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
        <div className="w-12 h-12 rounded-full bg-[#52A9A0]/12 flex items-center justify-center mb-5">
          <CheckIcon className="w-6 h-6 text-[#52A9A0]" />
        </div>
        <h1 className="font-display text-2xl mb-2">Controleer je e-mail</h1>
        <p className="text-[#93A3B5] leading-relaxed mb-1">
          We hebben een bevestigingslink gestuurd naar
        </p>
        <p className="font-medium mb-6">{submittedEmail}</p>
        <p className="text-[#93A3B5] text-sm leading-relaxed mb-8">
          Klik op de link in die e-mail om je account te activeren. Daarna kun je inloggen.
        </p>
        <Link href="/login" className={btnPrimary}>
          Naar inloggen
        </Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
      <p className="font-display text-xs tracking-[0.2em] uppercase text-[#E8A33D] mb-2">Nieuw hier</p>
      <h1 className="font-display text-3xl mb-1">Account aanmaken</h1>
      <p className="text-[#93A3B5] mb-8">Registreer met je e-mailadres en een wachtwoord.</p>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          handleSignUp()
        }}
      >
        <input
          type="email"
          placeholder="E-mailadres"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <input
          type="password"
          placeholder="Wachtwoord (minimaal 8 tekens)"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        <input
          type="password"
          placeholder="Wachtwoord bevestigen"
          autoComplete="new-password"
          required
          minLength={8}
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          className={input}
        />

        {error && (
          <p className="text-[#C97064] text-sm bg-[#C97064]/5 border border-[#C97064]/40 rounded-xl px-3.5 py-2.5">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={`${btnPrimary} mt-2`}>
          {loading ? 'Bezig...' : 'Account aanmaken'}
        </button>
      </form>

      <p className="text-sm text-[#93A3B5] mt-6">
        Heb je al een account?{' '}
        <Link href="/login" className="text-[#E8A33D] hover:text-[#F0B457] transition-colors">
          Inloggen
        </Link>
      </p>
    </main>
  )
}
