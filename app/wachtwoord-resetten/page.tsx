'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
      setError('Je wachtwoord moet minimaal 8 tekens lang zijn.')
      return
    }
    if (password !== passwordConfirm) {
      setError('De wachtwoorden komen niet overeen.')
      return
    }
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setError(
        /same|different from the old/i.test(updateError.message)
          ? 'Kies een wachtwoord dat anders is dan je vorige.'
          : /weak|pwned|leaked|easy to guess/i.test(updateError.message)
            ? 'Dit wachtwoord is te makkelijk te raden. Kies een ander wachtwoord.'
            : 'Het wachtwoord kon niet worden opgeslagen. Vraag opnieuw een link aan en probeer het nog eens.'
      )
      return
    }
    setDone(true)
    setTimeout(() => router.push('/'), 1800)
  }

  if (done) {
    return (
      <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
        <div className="w-12 h-12 rounded-full bg-[#52A9A0]/12 flex items-center justify-center mb-5">
          <CheckIcon className="w-6 h-6 text-[#52A9A0]" />
        </div>
        <h1 className="font-display text-2xl mb-2">Je wachtwoord is aangepast</h1>
        <p className="text-[#93A3B5] leading-relaxed">Je bent ingelogd en gaat zo door naar de app.</p>
      </main>
    )
  }

  if (status === 'ongeldig') {
    return (
      <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
        <h1 className="font-display text-2xl mb-2">Deze link werkt niet meer</h1>
        <p className="text-[#93A3B5] leading-relaxed mb-6">
          De link is verlopen of al gebruikt. Vraag een nieuwe aan; die is een korte tijd geldig.
        </p>
        <Link href="/wachtwoord-vergeten" className={btnPrimary}>
          Nieuwe link aanvragen
        </Link>
        <LegalLinks className="mt-10" />
      </main>
    )
  }

  if (status === 'controleren') {
    return (
      <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
        <p className="text-[#93A3B5]">Even controleren...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
      <p className="font-display text-xs tracking-[0.2em] uppercase text-[#E8A33D] mb-2">Kijkassistent</p>
      <h1 className="font-display text-3xl mb-1">Nieuw wachtwoord</h1>
      <p className="text-[#93A3B5] mb-8">Kies een nieuw wachtwoord van minimaal 8 tekens.</p>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          handleSubmit()
        }}
      >
        <input
          type="password"
          placeholder="Nieuw wachtwoord"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        <input
          type="password"
          placeholder="Herhaal je wachtwoord"
          autoComplete="new-password"
          required
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          className={input}
        />

        {error && (
          <p className="text-[#C97064] text-sm bg-[#C97064]/5 border border-[#C97064]/40 rounded-xl px-3.5 py-2.5">{error}</p>
        )}

        <button type="submit" disabled={loading} className={`${btnPrimary} mt-2`}>
          {loading ? 'Bezig...' : 'Wachtwoord opslaan'}
        </button>
      </form>

      <LegalLinks className="mt-10" />
    </main>
  )
}
