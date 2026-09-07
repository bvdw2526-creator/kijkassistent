'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
    <main className="max-w-sm mx-auto px-6 py-16">
      <h1 className="font-display text-3xl mb-1">Kijkassistent</h1>
      <p className="text-[#9FB0C2] mb-8">Log in of maak een account aan.</p>

      <div className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="E-mailadres"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-[#202B3A] border border-[#3A4A5C] rounded-sm px-3 py-2.5 text-[#F2EFE9] placeholder:text-[#6B7A8C] outline-none focus:border-[#E8A33D] transition-colors"
        />
        <input
          type="password"
          placeholder="Wachtwoord"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-[#202B3A] border border-[#3A4A5C] rounded-sm px-3 py-2.5 text-[#F2EFE9] placeholder:text-[#6B7A8C] outline-none focus:border-[#E8A33D] transition-colors"
        />

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="bg-[#E8A33D] text-[#171F2B] font-medium rounded-sm px-4 py-2.5 mt-2 hover:bg-[#F0B457] transition-colors disabled:opacity-50"
        >
          Inloggen
        </button>
        <button
          onClick={handleSignUp}
          disabled={loading}
          className="border border-[#3A4A5C] rounded-sm px-4 py-2.5 hover:border-[#E8A33D] hover:text-[#E8A33D] transition-colors disabled:opacity-50"
        >
          Account aanmaken
        </button>

        {error && <p className="text-[#C97064] text-sm mt-1">{error}</p>}
      </div>
    </main>
  )
}