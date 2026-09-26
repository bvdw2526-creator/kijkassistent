'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { btnPrimary, input } from '../components/ui'
import { CheckIcon } from '../components/Icons'
import LegalLinks from '../components/LegalLinks'

export default function WachtwoordVergeten() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

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
      setError('Je hebt dit net al aangevraagd. Wacht een paar minuten en probeer het dan opnieuw.')
      return
    }
    if (resetError && resetError.status !== 400 && resetError.status !== 422) {
      setError('Er ging iets mis. Probeer het over een paar minuten opnieuw.')
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
        <div className="w-12 h-12 rounded-full bg-[#52A9A0]/12 flex items-center justify-center mb-5">
          <CheckIcon className="w-6 h-6 text-[#52A9A0]" />
        </div>
        <h1 className="font-display text-2xl mb-2">Controleer je e-mail</h1>
        <p className="text-[#93A3B5] leading-relaxed mb-6">
          Hoort <span className="text-[#F2EFE9]">{email}</span> bij een account, dan hebben we je een mail gestuurd met een link om
          een nieuw wachtwoord te kiezen. Kijk ook in je spam als je hem niet ziet.
        </p>
        <Link href="/login" className="text-[#E8A33D] hover:text-[#F0B457] transition-colors text-sm">
          Terug naar inloggen
        </Link>
        <LegalLinks className="mt-10" />
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
      <p className="font-display text-xs tracking-[0.2em] uppercase text-[#E8A33D] mb-2">Kijkassistent</p>
      <h1 className="font-display text-3xl mb-1">Wachtwoord vergeten</h1>
      <p className="text-[#93A3B5] mb-8">Vul je e-mailadres in. Je krijgt een link om een nieuw wachtwoord te kiezen.</p>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
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

        {error && (
          <p className="text-[#C97064] text-sm bg-[#C97064]/5 border border-[#C97064]/40 rounded-xl px-3.5 py-2.5">{error}</p>
        )}

        <button type="submit" disabled={loading} className={`${btnPrimary} mt-2`}>
          {loading ? 'Bezig...' : 'Stuur me een link'}
        </button>
      </form>

      <p className="text-sm text-[#93A3B5] mt-6">
        <Link href="/login" className="text-[#E8A33D] hover:text-[#F0B457] transition-colors">
          Terug naar inloggen
        </Link>
      </p>

      <LegalLinks className="mt-10" />
    </main>
  )
}
