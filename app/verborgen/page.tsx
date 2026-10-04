'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, getCurrentUser } from '@/lib/supabase'
import BottomNav from '../components/BottomNav'
import { card, btnSecondary } from '../components/ui'
import { ChevronLeftIcon } from '../components/Icons'

type HiddenTitle = {
  tmdb_id: number
  media_type: 'movie' | 'tv'
  title: string
  hidden_at: string
}

function formatHiddenDate(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Amsterdam' })
}

// Beheer van de titels die je hebt verborgen (zie "Verbergen" in de popup op Voor jou). Hier zet je ze terug.
export default function Verborgen() {
  const [items, setItems] = useState<HiddenTitle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getCurrentUser().then(async (user) => {
      if (!user) {
        if (!cancelled) setLoading(false)
        return
      }
      const { data, error: loadError } = await supabase
        .from('hidden_titles')
        .select('tmdb_id, media_type, title, hidden_at')
        .eq('user_id', user.id)
        .order('hidden_at', { ascending: false })
      if (cancelled) return
      if (loadError) {
        console.error('Verborgen titels ophalen mislukt:', loadError)
        setError(`Kon de verborgen titels niet ophalen: ${loadError.message}`)
      } else {
        setItems((data || []) as HiddenTitle[])
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRestore(item: HiddenTitle) {
    const user = await getCurrentUser()
    if (!user) return
    const key = `${item.media_type}-${item.tmdb_id}`
    setBusyKey(key)
    setError(null)
    // .select() erbij: een door RLS stilzwijgend genegeerde delete (0 rijen) mag niet als gelukt tellen.
    const { data: removed, error: deleteError } = await supabase
      .from('hidden_titles')
      .delete()
      .eq('user_id', user.id)
      .eq('tmdb_id', item.tmdb_id)
      .eq('media_type', item.media_type)
      .select()
    setBusyKey(null)
    if (deleteError || !removed || removed.length === 0) {
      console.error('Terugzetten mislukt:', deleteError)
      setError(`Kon "${item.title}" niet terugzetten${deleteError ? `: ${deleteError.message}` : '.'}`)
      return
    }
    setItems((current) => current.filter((i) => !(i.tmdb_id === item.tmdb_id && i.media_type === item.media_type)))
  }

  return (
    <>
      <main className="max-w-sm mx-auto px-5 pt-6 pb-28">
        <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-[#93A3B5] hover:text-[#F2EFE9] transition-colors mb-4">
          <ChevronLeftIcon className="w-4 h-4" />
          Instellingen
        </Link>
        <h1 className="font-display text-2xl mb-1">Verborgen films en series</h1>
        <p className="text-[#93A3B5] mb-6">
          Deze titels komen niet meer in je aanbevelingen. Ze tellen niet mee voor je smaak. Zet je een titel terug, dan kan hij
          weer verschijnen.
        </p>

        {error && (
          <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-4">{error}</p>
        )}

        {loading && (
          <div className="flex flex-col gap-2">
            <div className="h-16 rounded-2xl bg-[#1A2330] animate-skeleton" />
            <div className="h-16 rounded-2xl bg-[#1A2330] animate-skeleton" style={{ animationDelay: '80ms' }} />
          </div>
        )}

        {!loading && items.length === 0 && !error && (
          <p className="text-sm text-[#93A3B5]">Je hebt niets verborgen. Bij een film of serie op Voor jou vind je onderin de knop Verbergen.</p>
        )}

        {!loading && items.length > 0 && (
          <ul className="flex flex-col gap-2">
            {items.map((item) => {
              const key = `${item.media_type}-${item.tmdb_id}`
              return (
                <li key={key} className={`${card} flex items-center justify-between gap-3 px-4 py-3`}>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{item.title}</span>
                    <span className="block text-xs text-[#93A3B5] mt-0.5">
                      {item.media_type === 'tv' ? 'Serie' : 'Film'} · verborgen op {formatHiddenDate(item.hidden_at)}
                    </span>
                  </span>
                  <button onClick={() => handleRestore(item)} disabled={busyKey === key} className={`${btnSecondary} !px-4 !py-2 text-sm flex-shrink-0`}>
                    Terugzetten
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </main>
      <BottomNav />
    </>
  )
}
