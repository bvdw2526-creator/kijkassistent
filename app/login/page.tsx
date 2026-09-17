'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { btnPrimary, input } from '../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSignIn() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      setError(
        error.message === 'Email not confirmed'
          ? 'Bevestig eerst je e-mailadres via de link die we je gestuurd hebben.'
          : error.message === 'Invalid login credentials'
            ? 'E-mailadres of wachtwoord klopt niet.'
            : error.message
      )
      return
    }
    router.push('/')
  }

  return (
    <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
      <p className="font-display text-xs tracking-[0.2em] uppercase text-[#E8A33D] mb-2">Welkom terug</p>
      <h1 className="font-display text-3xl mb-1">Kijkassistent</h1>
      <p className="text-[#93A3B5] mb-8">Log in met je e-mailadres en wachtwoord.</p>

      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          handleSignIn()
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
          placeholder="Wachtwoord"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />

        {error && (
          <p className="text-[#C97064] text-sm bg-[#C97064]/5 border border-[#C97064]/40 rounded-xl px-3.5 py-2.5">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={`${btnPrimary} mt-2`}>
          {loading ? 'Bezig...' : 'Inloggen'}
        </button>
      </form>

      <p className="text-sm text-[#93A3B5] mt-6">
        Nog geen account?{' '}
        <Link href="/register" className="text-[#E8A33D] hover:text-[#F0B457] transition-colors">
          Account aanmaken
        </Link>
      </p>
    </main>
  )
}
