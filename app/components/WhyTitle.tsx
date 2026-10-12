'use client'

import { useState } from 'react'
import { authFetch } from '@/lib/supabase'
import { card, input } from './ui'
import { CheckIcon, CloseIcon } from './Icons'

type Hit = { id: number; title: string; media_type: 'movie' | 'tv'; release_date?: string }
type Step = { name: string; passed: boolean; detail: string }
type Tab = { mode: 'focused' | 'balanced' | 'explore'; rank: number | null; of: number; score: number | null; chosen: boolean; chosenCount: number; lowestChosenScore: number | null }
type Result = {
  explanation: { steps: Step[]; scores?: Record<string, number>; sources?: string[]; tabs?: Tab[] } | null
  inLists: { mode: Tab['mode']; matchPercent: number }[]
  hidden: boolean
}

const TAB_NAMES: Record<Tab['mode'], string> = { focused: 'Puur mijn smaak', balanced: 'Mijn smaak, breder', explore: 'Verras me' }
const SCORE_NAMES: Record<string, string> = {
  lijsten: '"Lijkt hierop"-lijsten van wat je leuk vond',
  lijstenOke: '"Lijkt hierop"-lijsten van wat je oké vond',
  zoektocht: 'Bredere zoektocht (genres en thema\'s)',
  waarvanThema: 'waarvan via een thema',
  reeks: 'Hoort bij een reeks',
  verhaal: 'Verhaal (0 = middelste kandidaat)',
  buren: 'Lijkt op losse titels die je leuk vond',
  kenmerken: 'Kenmerken (thema\'s, regisseur, tijdperk, taal)',
  acteur: 'Favoriete acteur',
  regisseur: 'Favoriete regisseur',
  afkeuring: 'Aftrek door wat je afkeurde',
}

// Per tabblad in gewone taal: gekozen, of waarom niet.
function tabLine(tab: Tab): string {
  if (tab.chosen) return `Gekozen (plek ${tab.rank} van ${tab.of}).`
  if (tab.rank === null) return 'Deed hier niet mee: afgevallen bij een eerdere stap, of al gekozen in een eerder tabblad.'
  const where = `Plek ${tab.rank} van ${tab.of}, score ${tab.score}; de laagst gekozen titel heeft ${tab.lowestChosenScore ?? '-'}.`
  return tab.lowestChosenScore !== null && tab.score !== null && tab.score >= tab.lowestChosenScore
    ? `${where} Hoog genoeg, maar de plekken voor zijn genres waren al vol (per genre een beperkt aantal).`
    : `${where} De score is te laag voor dit tabblad.`
}

// Hulpmiddel voor de beheerder: zoek een titel en zie waar hij in de berekening van je eigen aanbevelingen afvalt.
// De controle zit in de route (app/api/admin/waarom); dit scherm staat alleen op de beheerpagina.
export default function WhyTitle() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [chosen, setChosen] = useState<Hit | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function search(event: React.FormEvent) {
    event.preventDefault()
    if (!query.trim()) {
      setError('Typ eerst een titel.')
      return
    }
    setError(null)
    setChosen(null)
    setResult(null)
    setBusy(true)
    try {
      const data = await (await authFetch(`/api/search-movies?query=${encodeURIComponent(query.trim())}`)).json()
      setHits((data.results ?? []).slice(0, 6))
      if ((data.results ?? []).length === 0) setError('Geen titel gevonden.')
    } catch {
      setError('Zoeken mislukt.')
    }
    setBusy(false)
  }

  async function explain(hit: Hit) {
    setChosen(hit)
    setResult(null)
    setError(null)
    setBusy(true)
    try {
      const data = await (await authFetch(`/api/admin/waarom?type=${hit.media_type}&id=${hit.id}`)).json()
      if (data.error) setError(data.error)
      else setResult(data)
    } catch {
      setError('De berekening mislukte.')
    }
    setBusy(false)
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-lg mb-1">Waarom staat deze titel (niet) in mijn lijst?</h2>
      <p className="text-sm text-muted mb-3 leading-relaxed">
        Rekent jouw eigen aanbevelingen opnieuw door en laat voor één titel zien waar hij afvalt. Dit duurt even en verandert niets aan je lijsten.
      </p>
      <form onSubmit={search} className="flex gap-2 mb-3">
        <input value={query} onChange={(e) => { setQuery(e.target.value); setError(null) }} placeholder="Palm Springs" className={input} aria-label="Titel" />
        <button type="submit" disabled={busy} className="rounded-xl border border-line px-4 text-sm font-medium hover:border-line-strong disabled:opacity-50">
          Zoek
        </button>
      </form>
      {error && <p className="text-sm text-coral mb-3">{error}</p>}

      {!chosen && hits.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {hits.map((hit) => (
            <li key={`${hit.media_type}-${hit.id}`}>
              <button onClick={() => explain(hit)} className="w-full text-left rounded-xl border border-line px-4 py-2.5 text-sm hover:border-line-strong">
                {hit.title}{' '}
                <span className="text-xs text-faint">
                  {hit.release_date?.slice(0, 4)} · {hit.media_type === 'tv' ? 'Serie' : 'Film'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {chosen && (
        <div className={`${card} p-4`}>
          <p className="font-medium">
            {chosen.title}{' '}
            <span className="text-xs text-faint">
              {chosen.release_date?.slice(0, 4)} · {chosen.media_type === 'tv' ? 'Serie' : 'Film'}
            </span>
          </p>
          {busy && <div className="h-24 mt-3 rounded-xl bg-surface-2 animate-skeleton" />}
          {result && (
            <>
              <p className="text-sm mt-2 mb-3">
                {result.inLists.length > 0
                  ? `Staat nu in ${result.inLists.map((t) => `${TAB_NAMES[t.mode]} (${t.matchPercent}%)`).join(' en ')}.`
                  : result.hidden
                    ? 'Staat niet in je lijsten: je hebt hem verborgen of als te oud weggezet.'
                    : 'Staat niet in je lijsten.'}
              </p>
              <ul className="flex flex-col gap-2.5 mb-4">
                {(result.explanation?.steps ?? []).map((step) => (
                  <li key={step.name} className="flex gap-2.5">
                    <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full ${step.passed ? 'bg-teal/15 text-teal' : 'bg-coral/15 text-coral'}`}>
                      {step.passed ? <CheckIcon className="w-3 h-3" /> : <CloseIcon className="w-3 h-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{step.name}</span>
                      <span className="block text-xs text-muted leading-relaxed">{step.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {result.explanation?.tabs && result.explanation.tabs.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Per tabblad</h3>
                  <ul className="flex flex-col gap-2 mb-4">
                    {result.explanation.tabs.map((tab) => (
                      <li key={tab.mode} className="text-sm">
                        <span className={`font-medium ${tab.chosen ? 'text-teal' : ''}`}>{TAB_NAMES[tab.mode]}</span>
                        <span className="block text-xs text-muted leading-relaxed">{tabLine(tab)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {result.explanation?.scores && (
                <>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Onderdelen van de score</h3>
                  <ul className="text-sm flex flex-col gap-1">
                    {Object.entries(result.explanation.scores).map(([key, value]) => (
                      <li key={key} className={`flex justify-between gap-3 ${key === 'waarvanThema' ? 'pl-4 text-muted' : ''}`}>
                        <span className="min-w-0">{SCORE_NAMES[key] ?? key}</span>
                        <span className="tabular-nums flex-shrink-0">{value}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          <button onClick={() => { setChosen(null); setResult(null) }} className="mt-4 text-sm text-accent hover:text-accent-hover">
            Andere titel
          </button>
        </div>
      )}
    </section>
  )
}
