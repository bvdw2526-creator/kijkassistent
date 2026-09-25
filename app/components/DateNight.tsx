'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { btnPrimary, btnGhost, card } from './ui'
import { CloseIcon } from './Icons'

type DateNightState = {
  connected: boolean
  status?: 'none' | 'waiting' | 'chosen'
  chooser_is_me?: boolean
  surprise?: boolean
  revealed?: boolean
  planned_at?: string | null
  title?: string | null
  poster_path?: string | null
  watch_on?: string | null
  media_type?: 'movie' | 'tv' | null
}

type ListItem = {
  tmdb_id: number
  media_type: 'movie' | 'tv'
  title: string
  poster_path: string | null
  watch_on: string | null
}

const pad = (n: number) => String(n).padStart(2, '0')

function nextFridayValue(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatPlanned(iso: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })
  const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  return `${day} om ${time}`
}

// Datenight: de een laat de ander kiezen wat jullie gaan kijken (uit Onze lijst), eventueel als
// verrassing. Alle regels (wie mag kiezen, wat verborgen blijft) staan in de database; dit is de weergave.
export default function DateNight({ showIdle }: { showIdle: boolean }) {
  const [state, setState] = useState<DateNightState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chooserOpen, setChooserOpen] = useState(false)
  const [items, setItems] = useState<ListItem[] | null>(null)
  const [selected, setSelected] = useState<ListItem | null>(null)
  const [surprise, setSurprise] = useState(false)
  const [date, setDate] = useState('')
  const [time, setTime] = useState('20:00')

  const refresh = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('datenight_state')
    if (!rpcError && data) setState(data as DateNightState)
  }, [])

  // Ook opnieuw ophalen zodra je terugkomt in de app: zo zie je het bericht van je partner.
  useEffect(() => {
    let cancelled = false
    supabase.rpc('datenight_state').then(({ data, error: rpcError }) => {
      if (!cancelled && !rpcError && data) setState(data as DateNightState)
    })
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true)
    setError(null)
    const { error: rpcError } = await action()
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return false
    }
    await refresh()
    return true
  }

  async function openChooser() {
    setChooserOpen(true)
    setSelected(null)
    setSurprise(false)
    setDate(nextFridayValue())
    setTime('20:00')
    const { data } = await supabase
      .from('couple_watchlist')
      .select('tmdb_id, media_type, title, poster_path, watch_on')
      .order('added_at', { ascending: false })
    setItems((data || []) as ListItem[])
  }

  async function choose() {
    if (!selected) return
    const plannedAt = date && time ? new Date(`${date}T${time}`).toISOString() : null
    const ok = await run(() =>
      supabase.rpc('datenight_choose', {
        p_tmdb_id: selected.tmdb_id,
        p_media_type: selected.media_type,
        p_title: selected.title,
        p_poster_path: selected.poster_path,
        p_watch_on: selected.watch_on,
        p_surprise: surprise,
        p_planned_at: plannedAt,
      })
    )
    if (ok) setChooserOpen(false)
  }

  if (!state || !state.connected) return null
  if (state.status === 'none' && !showIdle) return null

  const kind = selected?.media_type === 'tv' ? 'serie' : 'film'

  return (
    <>
      {state.status === 'none' && (
        <div className={`${card} p-4 mb-5`}>
          <p className="text-sm font-medium">Datenight</p>
          <p className="text-xs text-[#93A3B5] mt-1 mb-3 leading-relaxed">
            Laat je partner kiezen wat jullie gaan kijken, uit jullie gezamenlijke lijst. Eventueel als verrassing.
          </p>
          <button onClick={() => run(() => supabase.rpc('datenight_request'))} disabled={busy} className={`${btnPrimary} w-full`}>
            Laat mijn partner kiezen
          </button>
        </div>
      )}

      {state.status === 'waiting' && !state.chooser_is_me && (
        <div className={`${card} p-4 mb-5`}>
          <p className="text-sm font-medium">Datenight</p>
          <p className="text-sm text-[#93A3B5] mt-1 mb-3">Je partner mag kiezen wat jullie gaan kijken. Even geduld.</p>
          <button onClick={() => run(() => supabase.rpc('datenight_clear'))} disabled={busy} className={btnGhost}>
            Annuleren
          </button>
        </div>
      )}

      {state.status === 'waiting' && state.chooser_is_me && (
        <div className="rounded-2xl border border-[#E8A33D]/40 bg-[#E8A33D]/5 p-4 mb-5">
          <p className="font-display text-xs tracking-[0.2em] uppercase text-[#E8A33D] mb-2">Datenight</p>
          <p className="text-sm mb-3 leading-relaxed">Jij mag kiezen wat jullie gaan kijken! Je kiest uit jullie gezamenlijke lijst.</p>
          <button onClick={openChooser} className={`${btnPrimary} w-full`}>
            Kies uit Onze lijst
          </button>
        </div>
      )}

      {state.status === 'chosen' && state.revealed && (
        <div className="rounded-2xl border border-[#E8A33D]/40 bg-[#E8A33D]/5 p-4 mb-5">
          <p className="font-display text-xs tracking-[0.2em] uppercase text-[#E8A33D] mb-3">#datenight</p>
          <div className="flex gap-4">
            {state.poster_path ? (
              <div className="relative w-20 aspect-[2/3] rounded-xl flex-shrink-0 overflow-hidden shadow-lg">
                <Image src={`https://image.tmdb.org/t/p/w200${state.poster_path}`} alt={state.title ?? ''} fill sizes="80px" className="object-cover" />
              </div>
            ) : (
              <div className="w-20 aspect-[2/3] rounded-xl bg-[#212C3B] flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-display text-xl leading-tight">{state.title}</p>
              <p className="text-sm text-[#93A3B5] mt-1">
                {state.media_type === 'tv' ? 'Serie' : 'Film'}
                {state.watch_on ? ` · ${state.watch_on}` : ''}
              </p>
              {state.planned_at && <p className="text-sm text-[#E8A33D] mt-2">{formatPlanned(state.planned_at)}</p>}
              {state.surprise && state.chooser_is_me && state.planned_at && new Date(state.planned_at) > new Date() && (
                <p className="text-xs text-[#93A3B5] mt-2">Verrassing: je partner ziet dit pas op dat moment.</p>
              )}
            </div>
          </div>
          <button onClick={() => run(() => supabase.rpc('datenight_clear'))} disabled={busy} className={`${btnGhost} mt-3`}>
            Klaar, bedankt
          </button>
        </div>
      )}

      {state.status === 'chosen' && !state.revealed && (
        <div className="rounded-2xl border border-[#E8A33D]/40 bg-[#E8A33D]/5 p-4 mb-5">
          <p className="font-display text-xs tracking-[0.2em] uppercase text-[#E8A33D] mb-2">#datenight</p>
          <p className="text-sm leading-relaxed">
            Je partner heeft iets voor jullie uitgekozen. Het is een verrassing!
            {state.planned_at ? ` Je ziet het op ${formatPlanned(state.planned_at)}.` : ''}
          </p>
          <button onClick={() => run(() => supabase.rpc('datenight_clear'))} disabled={busy} className={`${btnGhost} mt-3`}>
            Annuleren
          </button>
        </div>
      )}

      {error && <p className="text-sm text-[#C97064] mb-4">{error}</p>}

      {chooserOpen && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 animate-fade-in"
          onClick={() => setChooserOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-[#1A2330] border border-[#2A3644] rounded-t-3xl sm:rounded-3xl max-h-[88vh] overflow-y-auto animate-sheet-up sm:animate-pop-in safe-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start justify-between gap-3 mb-4">
                <h2 className="font-display text-xl leading-tight">
                  {selected ? 'Jouw keuze' : 'Kies uit Onze lijst'}
                </h2>
                <button onClick={() => setChooserOpen(false)} className="text-[#93A3B5] p-1" aria-label="Sluiten">
                  <CloseIcon className="w-5 h-5" />
                </button>
              </div>

              {!selected && items === null && <div className="h-24 rounded-xl bg-[#212C3B] animate-skeleton" />}
              {!selected && items !== null && items.length === 0 && (
                <p className="text-sm text-[#93A3B5] leading-relaxed">
                  Jullie gezamenlijke lijst is nog leeg. Zet eerst iets op Onze lijst (bij Samen of via de tab Kijklijst), dan kun je hier kiezen.
                </p>
              )}
              {!selected && items && items.length > 0 && (
                <ul className="flex flex-col divide-y divide-[#2A3644]">
                  {items.map((item) => (
                    <li key={`${item.media_type}-${item.tmdb_id}`}>
                      <button onClick={() => setSelected(item)} className="flex w-full items-center gap-3 py-2.5 text-left touch-manipulation">
                        {item.poster_path ? (
                          <div className="relative w-10 aspect-[2/3] rounded-md overflow-hidden flex-shrink-0">
                            <Image src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt={item.title} fill sizes="40px" className="object-cover" />
                          </div>
                        ) : (
                          <div className="w-10 aspect-[2/3] rounded-md bg-[#212C3B] flex-shrink-0" />
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium truncate">{item.title}</span>
                          <span className="block text-xs text-[#93A3B5]">
                            {item.media_type === 'tv' ? 'Serie' : 'Film'}
                            {item.watch_on ? ` · ${item.watch_on}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {selected && (
                <div className="flex flex-col gap-4">
                  <p className="font-display text-lg leading-tight">{selected.title}</p>

                  <label className="flex items-start gap-3 rounded-xl border border-[#2A3644] p-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={surprise}
                      onChange={(e) => setSurprise(e.target.checked)}
                      className="mt-1 h-4 w-4 accent-[#E8A33D]"
                    />
                    <span className="text-sm leading-relaxed">
                      <span className="font-medium">Maak er een verrassing van</span>
                      <span className="block text-xs text-[#93A3B5] mt-0.5">
                        Je partner ziet pas wat het is op het moment dat jullie gaan kijken.
                      </span>
                    </span>
                  </label>

                  <div>
                    <p className="text-xs text-[#93A3B5] mb-1.5">{surprise ? 'Wanneer kijken jullie? (verplicht)' : 'Wanneer kijken jullie? (optioneel)'}</p>
                    <div className="flex gap-2">
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="flex-1 min-w-0 rounded-lg border border-[#2A3644] bg-[#10151C] px-2.5 py-2 text-sm outline-none focus:border-[#E8A33D]"
                      />
                      <input
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                        className="w-24 rounded-lg border border-[#2A3644] bg-[#10151C] px-2.5 py-2 text-sm outline-none focus:border-[#E8A33D]"
                      />
                    </div>
                  </div>

                  <button
                    onClick={choose}
                    disabled={busy || (surprise && (!date || !time))}
                    className={`${btnPrimary} w-full`}
                  >
                    Ik kies deze {kind} voor ons #datenight
                  </button>
                  <button onClick={() => setSelected(null)} className={btnGhost}>
                    Terug naar de lijst
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
