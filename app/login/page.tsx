'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { btnPrimary, btnSecondary, input } from '../components/ui'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSignUp() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signUp({ email, password })
    setLoading(false)
    if (error) setError(error.message)
    else router.push('/')
  }

  async function handleSignIn() {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
    else router.push('/')
  }

  return (
    <main className="min-h-screen flex flex-col justify-center max-w-sm mx-auto px-6 py-16">
      <p className="font-display text-xs tracking-[0.2em] uppercase text-[#E8A33D] mb-2">Welkom terug</p>
      <h1 className="font-display text-3xl mb-1">Kijkassistent</h1>
      <p className="text-[#93A3B5] mb-8">Log in of maak een account aan.</p>

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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={input}
        />
        <input
          type="password"
          placeholder="Wachtwoord"
          autoComplete="current-password"
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
          Inloggen
        </button>
        <button type="button" onClick={handleSignUp} disabled={loading} className={btnSecondary}>
          Account aanmaken
        </button>
      </form>
    </main>
  )
}
