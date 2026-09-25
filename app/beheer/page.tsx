'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import BottomNav from '../components/BottomNav'
import { card } from '../components/ui'

type Totals = {
  accounts: number
  actief_vandaag: number
  actief_7_dagen: number
  gekoppelde_koppels: number
  onze_lijst: number
  samen_beoordelingen: number
  datenights_lopend: number
}

type Day = { dag: string; nieuw: number; actief: number; beoordelingen: number; favorieten: number; watchlist: number; samen: number }

type UserRow = {
  email: string
  created_at: string
  last_sign_in_at: string | null
  favorieten: number
  beoordelingen: number
  watchlist: number
  laatst_actief: string | null
  actieve_dagen_7: number
  diensten: number
  wizard_af: boolean
  gekoppeld: boolean
}

type Overview = { generated_at: string; totals: Totals; days: Day[]; users: UserRow[] }

const dayLabel = (dag: string) =>
  new Date(`${dag}T12:00:00`).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })

// laatst_actief is al in Nederlandse tijd (zonder tijdzone); zo tonen we het ook.
function lastActiveLabel(value: string | null): string {
  if (!value) return 'nog niets'
  const d = new Date(value)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  const yesterday = new Date(today.getTime() - 86400000).toDateString() === d.toDateString()
  const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return `vandaag ${time}`
  if (yesterday) return `gisteren ${time}`
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className={`${card} p-4`}>
      <p className="font-display text-3xl text-[#E8A33D] leading-none">{value}</p>
      <p className="text-xs text-[#93A3B5] mt-1.5">{label}</p>
    </div>
  )
}

export default function Beheer() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: result, error: rpcError } = await supabase.rpc('admin_usage_overview')
    if (rpcError) setError(rpcError.message)
    else {
      setError(null)
      setData(result as Overview)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    supabase.rpc('admin_usage_overview').then(({ data: result, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) setError(rpcError.message)
      else setData(result as Overview)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const maxActive = Math.max(1, ...(data?.days.map((d) => d.actief) ?? [1]))
  const lastDay = data?.days[data.days.length - 1]?.dag

  return (
    <>
      <main className="max-w-xl mx-auto px-5 pt-6 pb-28">
        <h1 className="font-display text-2xl mb-1">Gebruik</h1>
        <p className="text-[#93A3B5] mb-6">Alleen voor jou zichtbaar.</p>

        {loading && <div className="h-40 rounded-2xl bg-[#1A2330] animate-skeleton" />}

        {error && (
          <div className={`${card} p-5`}>
            <p className="text-sm text-[#C97064]">
              {error === 'Geen toegang' ? 'Dit overzicht is alleen voor de beheerder van de app.' : error}
            </p>
            <Link href="/" className="text-sm text-[#E8A33D] mt-3 inline-block">Terug naar de app</Link>
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Kpi label="Accounts" value={data.totals.accounts} />
              <Kpi label="Actief vandaag" value={data.totals.actief_vandaag} />
              <Kpi label="Actief afgelopen 7 dagen" value={data.totals.actief_7_dagen} />
              <Kpi label="Gekoppelde koppels" value={data.totals.gekoppelde_koppels} />
            </div>

            <div className={`${card} p-5`}>
              <p className="text-sm font-medium mb-1">Actieve gebruikers per dag</p>
              <p className="text-xs text-[#5E6D80] mb-4">Iedereen die iets heeft toegevoegd, beoordeeld of de app heeft gebruikt.</p>
              <div className="flex items-end gap-1.5 h-28">
                {data.days.map((d) => (
                  <div key={d.dag} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                    <span className="text-[10px] text-[#93A3B5]">{d.actief || ''}</span>
                    <div
                      className={`w-full rounded-t ${d.dag === lastDay ? 'bg-[#E8A33D]' : 'bg-[#E8A33D]/45'}`}
                      style={{ height: `${Math.max(3, (d.actief / maxActive) * 70)}%` }}
                      title={`${dayLabel(d.dag)}: ${d.actief} actief`}
                    />
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 mt-1.5">
                {data.days.map((d) => (
                  <span key={d.dag} className="flex-1 text-center text-[9px] text-[#5E6D80]">
                    {new Date(`${d.dag}T12:00:00`).getDate()}
                  </span>
                ))}
              </div>
            </div>

            <div className={`${card} p-5`}>
              <p className="text-sm font-medium mb-3">Per dag</p>
              <div className="grid grid-cols-[1fr_repeat(6,2.2rem)] gap-x-1 gap-y-1.5 text-xs">
                <span />
                {['nieuw', 'actief', 'beoord.', 'fav.', 'kijk', 'samen'].map((h) => (
                  <span key={h} className="text-[#5E6D80] text-right text-[10px]">{h}</span>
                ))}
                {[...data.days].reverse().map((d) => (
                  <div key={d.dag} className="contents">
                    <span className="text-[#93A3B5]">{dayLabel(d.dag)}</span>
                    {[d.nieuw, d.actief, d.beoordelingen, d.favorieten, d.watchlist, d.samen].map((n, i) => (
                      <span key={i} className={`text-right ${n === 0 ? 'text-[#3A4A5C]' : ''}`}>{n}</span>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className={`${card} p-5`}>
              <p className="text-sm font-medium mb-3">Samen</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="font-display text-2xl">{data.totals.onze_lijst}</p>
                  <p className="text-[11px] text-[#93A3B5]">op Onze lijst</p>
                </div>
                <div>
                  <p className="font-display text-2xl">{data.totals.samen_beoordelingen}</p>
                  <p className="text-[11px] text-[#93A3B5]">samen beoordeeld</p>
                </div>
                <div>
                  <p className="font-display text-2xl">{data.totals.datenights_lopend}</p>
                  <p className="text-[11px] text-[#93A3B5]">datenights lopend</p>
                </div>
              </div>
            </div>

            <div className={`${card} p-5`}>
              <p className="text-sm font-medium mb-3">Per gebruiker</p>
              <ul className="flex flex-col divide-y divide-[#2A3644]">
                {data.users.map((u) => (
                  <li key={u.email} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm font-medium truncate">{u.email}</span>
                      <span className="text-xs text-[#E8A33D] flex-shrink-0">{lastActiveLabel(u.laatst_actief)}</span>
                    </div>
                    <p className="text-xs text-[#93A3B5] mt-1">
                      {u.favorieten} favorieten · {u.beoordelingen} beoordelingen · {u.watchlist} op kijklijst · {u.actieve_dagen_7}/7 dagen actief
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {u.gekoppeld && <span className="rounded-full bg-[#52A9A0]/12 px-2 py-0.5 text-[10px] text-[#52A9A0]">gekoppeld</span>}
                      {!u.wizard_af && <span className="rounded-full bg-[#C97064]/12 px-2 py-0.5 text-[10px] text-[#C97064]">starthulp niet af</span>}
                      {u.diensten === 0 && <span className="rounded-full bg-[#C97064]/12 px-2 py-0.5 text-[10px] text-[#C97064]">geen streamingdiensten</span>}
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-[#5E6D80]">
                        sinds {new Date(u.created_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between text-xs text-[#5E6D80]">
              <span>Bijgewerkt {new Date(data.generated_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>
              <button onClick={load} className="text-[#E8A33D] touch-manipulation">Vernieuwen</button>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </>
  )
}
