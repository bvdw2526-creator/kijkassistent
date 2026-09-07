'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const AVAILABLE_SERVICES = [
  { id: 'netflix', label: 'Netflix' },
  { id: 'videoland', label: 'Videoland' },
  { id: 'disney_plus', label: 'Disney+' },
  { id: 'amazon_prime', label: 'Prime Video' },
  { id: 'hbo_max', label: 'HBO Max' },
]

export default function Settings() {
  const [selected, setSelected] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('streaming_services')
      .eq('id', user.id)
      .single()
    setSelected(data?.streaming_services || [])
    setLoading(false)
  }

  function toggleService(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id]
    )
    setSaved(false)
  }

  async function handleSave() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update({ streaming_services: selected }).eq('id', user.id)
    setSaved(true)
  }

  if (loading) return <p className="p-8 text-[#9FB0C2]">Laden...</p>

  return (
    <main className="max-w-sm mx-auto px-6 py-10">
      <h1 className="font-display text-2xl mb-1">Mijn streamingdiensten</h1>
      <p className="text-[#9FB0C2] mb-6">Selecteer waar je een abonnement op hebt.</p>

      <div className="flex flex-col gap-2 mb-6">
        {AVAILABLE_SERVICES.map((service) => {
          const active = selected.includes(service.id)
          return (
            <button
              key={service.id}
              onClick={() => toggleService(service.id)}
              className={`text-left rounded-sm border px-4 py-2.5 transition-colors ${
                active ? 'border-[#E8A33D] text-[#E8A33D] bg-[#E8A33D]/10' : 'border-[#3A4A5C] hover:border-[#6B7A8C]'
              }`}
            >
              {service.label}
            </button>
          )
        })}
      </div>

      <button
        onClick={handleSave}
        className="bg-[#E8A33D] text-[#171F2B] font-medium rounded-sm px-5 py-2.5 hover:bg-[#F0B457] transition-colors"
      >
        Opslaan
      </button>
      {saved && <p className="text-[#52A9A0] text-sm mt-2">Opgeslagen</p>}

      <a href="/" className="block mt-6 text-[#E8A33D] hover:text-[#F0B457] transition-colors text-sm">
        Terug naar aanbevelingen
      </a>
    </main>
  )
}