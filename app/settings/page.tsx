'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import LegalLinks from '../components/LegalLinks'
import ExcludedGenreWarning from '../components/ExcludedGenreWarning'
import ExcludeChip from '../components/ExcludeChip'
import { supabase, getCurrentUser } from '@/lib/supabase'
import BottomNav from '../components/BottomNav'
import { WhatsNewSheet } from '../components/WhatsNew'
import { btnPrimary, input, card } from '../components/ui'
import { CheckIcon, ChevronLeftIcon, TrashIcon, UsersIcon } from '../components/Icons'

const AVAILABLE_SERVICES = [
  { id: 'netflix', label: 'Netflix' },
  { id: 'videoland', label: 'Videoland' },
  { id: 'disney_plus', label: 'Disney+' },
  { id: 'amazon_prime', label: 'Prime Video' },
  { id: 'hbo_max', label: 'HBO Max' },
  { id: 'npo_start', label: 'NPO Start' },
  { id: 'pathe_thuis', label: 'Pathé Thuis (huren)' },
]

// TMDB's vaste genre-lijsten (nl-NL). Film- en serie-ids overlappen nooit in
// betekenis (bv. actie is 28 bij films, 10759 bij series), dus ze kunnen allebei in
// dezelfde platte "excluded_genres"-kolom op het profiel worden opgeslagen.
const MOVIE_GENRES = [
  { id: 28, label: 'Actie' },
  { id: 12, label: 'Avontuur' },
  { id: 16, label: 'Animatie' },
  { id: 35, label: 'Komedie' },
  { id: 80, label: 'Misdaad' },
  { id: 99, label: 'Documentaire' },
  { id: 18, label: 'Drama' },
  { id: 10751, label: 'Familie' },
  { id: 14, label: 'Fantasy' },
  { id: 36, label: 'Historie' },
  { id: 27, label: 'Horror' },
  { id: 10402, label: 'Muziek' },
  { id: 9648, label: 'Mysterie' },
  { id: 10749, label: 'Romantiek' },
  { id: 878, label: 'Sciencefiction' },
  { id: 10770, label: 'Tv-film' },
  { id: 53, label: 'Thriller' },
  { id: 10752, label: 'Oorlog' },
  { id: 37, label: 'Western' },
]

const TV_GENRES = [
  { id: 10759, label: 'Actie en avontuur' },
  { id: 16, label: 'Animatie' },
  { id: 35, label: 'Komedie' },
  { id: 80, label: 'Misdaad' },
  { id: 99, label: 'Documentaire' },
  { id: 18, label: 'Drama' },
  { id: 10751, label: 'Familie' },
  { id: 10762, label: 'Kids' },
  { id: 9648, label: 'Mysterie' },
  { id: 10763, label: 'Nieuws' },
  { id: 10764, label: 'Reality' },
  { id: 10765, label: 'Sciencefiction en fantasy' },
  { id: 10766, label: 'Soap' },
  { id: 10767, label: 'Talkshow' },
  { id: 10768, label: 'Oorlog en politiek' },
  { id: 37, label: 'Western' },
]

type PartnerConnection = {
  id: string
  other_email: string
  status: 'pending' | 'accepted'
  direction: 'incoming' | 'outgoing'
  created_at: string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// Hoe lang we na de laatste wijziging wachten voordat we opslaan (zodat meerdere tikken achter elkaar één keer worden bewaard).
const AUTOSAVE_DELAY_MS = 500

function GroupTitle({ title }: { title: string }) {
  return <h2 className="text-xs font-semibold uppercase tracking-wide text-[#93A3B5] mb-3 mt-10 first:mt-0">{title}</h2>
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="font-display text-lg">{title}</h3>
      {hint && <p className="text-[#93A3B5] text-sm mt-0.5 leading-relaxed">{hint}</p>}
    </div>
  )
}

// Een rij die je opent en sluit: de titel, eventueel een korte samenvatting ("3 uitgesloten") en de inhoud eronder.
function Collapsible({
  title,
  summary,
  openWhen = false,
  tone = 'default',
  children,
}: {
  title: string
  summary?: string
  // Staat de rij open om een andere reden (bv. er wacht een uitnodiging), dan blijft hij open tot de pagina opnieuw laadt.
  openWhen?: boolean
  tone?: 'default' | 'danger'
  children: React.ReactNode
}) {
  const [userOpen, setUserOpen] = useState(false)
  const open = userOpen || openWhen
  return (
    <div className={`rounded-xl border ${tone === 'danger' ? 'border-[#C97064]/30' : 'border-[#2A3644]'}`}>
      <button
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left touch-manipulation"
      >
        <span className="min-w-0">
          <span className={`block text-sm font-medium ${tone === 'danger' ? 'text-[#C97064]' : ''}`}>{title}</span>
          {summary && <span className="block text-xs text-[#93A3B5] mt-0.5 truncate">{summary}</span>}
        </span>
        <ChevronLeftIcon className={`w-4 h-4 flex-shrink-0 text-[#93A3B5] transition-transform ${open ? '-rotate-90' : 'rotate-180'}`} />
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  )
}

export default function Settings() {
  const [selected, setSelected] = useState<string[]>([])
  const [excludedGenres, setExcludedGenres] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [onboardingComplete, setOnboardingComplete] = useState(true)
  const [showWhatsNew, setShowWhatsNew] = useState(false)

  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [connections, setConnections] = useState<PartnerConnection[]>([])
  const [partnerEmail, setPartnerEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteLinkLoading, setInviteLinkLoading] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  // Wat er het laatst is opgeslagen (of geladen), om te zien of er iets te bewaren is.
  const lastSavedRef = useRef('')
  const saveChainRef = useRef<Promise<void>>(Promise.resolve())
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestRef = useRef({ selected: [] as string[], excludedGenres: [] as number[], loading: true })

  useEffect(() => {
    loadProfile()
    loadConnections()
    supabase.rpc('is_app_admin').then(({ data }) => setIsAdmin(data === true))
  }, [])

  const snapshotOf = (services: string[], genres: number[]) =>
    JSON.stringify({ s: [...services].sort(), g: [...genres].sort((a, b) => a - b) })

  async function loadProfile() {
    const user = await getCurrentUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('streaming_services, excluded_genres, onboarding_completed_at')
      .eq('id', user.id)
      .single()
    const services: string[] = data?.streaming_services || []
    const genres: number[] = Array.isArray(data?.excluded_genres) ? data.excluded_genres : []
    lastSavedRef.current = snapshotOf(services, genres)
    setSelected(services)
    setExcludedGenres(genres)
    setOnboardingComplete(!!data?.onboarding_completed_at)
    setLoading(false)
  }

  function toggleService(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id]
    )
  }

  function toggleGenre(id: number) {
    setExcludedGenres((current) =>
      current.includes(id) ? current.filter((g) => g !== id) : [...current, id]
    )
  }

  // Slaat de streamingdiensten en uitgesloten genres op. Meerdere keren achter elkaar wordt netjes op volgorde gedaan.
  function saveNow(services: string[], genres: number[]) {
    const snapshot = snapshotOf(services, genres)
    if (snapshot === lastSavedRef.current) return
    saveChainRef.current = saveChainRef.current.then(async () => {
      if (snapshot === lastSavedRef.current) return
      const user = await getCurrentUser()
      if (!user) return
      setSaveState('saving')
      setErrorMessage(null)
      const { error } = await supabase
        .from('profiles')
        .update({ streaming_services: services, excluded_genres: genres })
        .eq('id', user.id)
      if (error) {
        console.error('Voorkeuren opslaan mislukt:', error)
        setErrorMessage(`Kon niet opslaan: ${error.message}`)
        setSaveState('error')
        return
      }
      lastSavedRef.current = snapshot
      setSaveState('saved')
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSaveState('idle'), 2200)
    })
  }

  // Automatisch opslaan: kort na de laatste wijziging.
  useEffect(() => {
    latestRef.current = { selected, excludedGenres, loading }
    if (loading) return
    if (snapshotOf(selected, excludedGenres) === lastSavedRef.current) return
    const timer = setTimeout(() => saveNow(selected, excludedGenres), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // saveNow en snapshotOf gebruiken alleen refs en vaste functies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, excludedGenres, loading])

  // Verlaat je de pagina binnen een halve seconde na een wijziging, dan bewaren we die alsnog.
  useEffect(() => {
    return () => {
      const { selected: s, excludedGenres: g, loading: l } = latestRef.current
      if (!l) saveNow(s, g)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDeleteAccount() {
    setDeleting(true)
    setErrorMessage(null)
    const { error } = await supabase.rpc('delete_my_account')
    if (error) {
      console.error('Account verwijderen mislukt:', error)
      setErrorMessage(`Kon je account niet verwijderen: ${error.message}`)
      setDeleting(false)
      setConfirmDelete(false)
      return
    }
    localStorage.clear()
    await supabase.auth.signOut()
    router.push('/')
  }

  async function loadConnections() {
    const { data, error } = await supabase.rpc('list_partner_connections')
    if (error) {
      console.error('Koppelingen ophalen mislukt:', error)
      return
    }
    if (data) setConnections(data)
  }

  async function createInviteLink() {
    setErrorMessage(null)
    setInviteLinkLoading(true)
    setLinkCopied(false)
    const { data, error } = await supabase.rpc('create_partner_invite')
    setInviteLinkLoading(false)
    if (error || !data) {
      console.error('Uitnodigingslink maken mislukt:', error)
      setErrorMessage(`Kon de link niet maken: ${error?.message ?? 'onbekende fout'}`)
      return
    }
    setInviteLink(`${window.location.origin}/uitnodiging/${data}`)
  }

  async function shareInviteLink() {
    const text = 'Kijk samen met mij! Koppel je aan mij in Kijkassistent:'
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Kijkassistent', text, url: inviteLink })
        return
      } catch {
        // Delen geannuleerd of niet beschikbaar: dan valt het terug op kopiëren.
      }
    }
    try {
      await navigator.clipboard.writeText(inviteLink)
      setLinkCopied(true)
    } catch {
      setErrorMessage('Kopiëren lukt niet. Selecteer de link en kopieer hem zelf.')
    }
  }

  async function sendInvite() {
    if (!partnerEmail) return
    setErrorMessage(null)
    setInviteLoading(true)
    const { error } = await supabase.rpc('invite_partner', { partner_email: partnerEmail })
    setInviteLoading(false)
    if (error) {
      console.error('Partner uitnodigen mislukt:', error)
      setErrorMessage(
        error.message.includes('Geen account gevonden')
          ? 'Geen account gevonden met dit e-mailadres.'
          : `Kon niet uitnodigen: ${error.message}. Is de migratie "partner_connections" al uitgevoerd in Supabase?`
      )
      return
    }
    setPartnerEmail('')
    loadConnections()
  }

  async function acceptConnection(id: string) {
    setErrorMessage(null)
    const { error } = await supabase
      .from('partner_connections')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', id)
    if (error) {
      console.error('Uitnodiging accepteren mislukt:', error)
      setErrorMessage(`Kon de uitnodiging niet accepteren: ${error.message}`)
      return
    }
    loadConnections()
  }

  async function removeConnection(id: string) {
    setErrorMessage(null)
    const { error } = await supabase.from('partner_connections').delete().eq('id', id)
    if (error) {
      console.error('Koppeling verwijderen mislukt:', error)
      setErrorMessage(`Kon de koppeling niet verwijderen: ${error.message}`)
      return
    }
    setConnections(connections.filter((c) => c.id !== id))
  }

  if (loading) {
    return (
      <main className="max-w-sm mx-auto px-5 pt-6 pb-28">
        <div className="h-7 w-40 rounded-lg bg-[#1A2330] animate-skeleton mb-8" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-[#1A2330] animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </main>
    )
  }

  const linkRow = 'flex items-center justify-between gap-3 rounded-xl border border-[#2A3644] px-4 py-3.5 mb-2 hover:border-[#3d4c60] transition-colors'

  const acceptedPartner = connections.find((c) => c.status === 'accepted')
  const hasIncoming = connections.some((c) => c.status === 'pending' && c.direction === 'incoming')
  const partnerSummary = acceptedPartner
    ? `Gekoppeld met ${acceptedPartner.other_email}`
    : hasIncoming
      ? 'Er wacht een uitnodiging op je'
      : connections.length > 0
        ? 'Wacht op reactie'
        : 'Nog niet gekoppeld'
  const genreSummary = excludedGenres.length > 0 ? `${excludedGenres.length} uitgesloten` : 'Niets uitgesloten'

  return (
    <>
      <main className="max-w-sm mx-auto px-5 pt-6 pb-32">
        <h1 className="font-display text-2xl mb-1">Mijn voorkeuren</h1>
        <p className="text-[#93A3B5] mb-6">Stel in wat je aanbevelingen beter maakt. Wijzigingen worden automatisch opgeslagen.</p>

        {!onboardingComplete && (
          <Link
            href="/wizard"
            className="flex items-center justify-between gap-3 rounded-xl border border-[#E8A33D]/40 bg-[#E8A33D]/10 px-4 py-3.5 mb-3 hover:border-[#E8A33D] transition-colors"
          >
            <span>
              <span className="block text-sm font-medium text-[#E8A33D]">Maak je profiel af</span>
              <span className="block text-xs text-[#93A3B5] mt-0.5">Rond de starthulp af voor scherpere aanbevelingen</span>
            </span>
          </Link>
        )}

        {errorMessage && (
          <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-6">
            {errorMessage}
          </p>
        )}

        <GroupTitle title="Wat je kijkt" />
        <SectionTitle title="Streamingdiensten" hint="Selecteer waar je een abonnement op hebt. Pathé Thuis is huren per titel: aanvinken betekent dat titels die je daar kunt huren ook worden getoond." />
        <div className="grid grid-cols-2 gap-2 mb-6">
          {AVAILABLE_SERVICES.map((service) => {
            const active = selected.includes(service.id)
            return (
              <button
                key={service.id}
                onClick={() => toggleService(service.id)}
                className={`flex items-center gap-2 text-left rounded-xl border px-4 py-3 transition-all touch-manipulation active:scale-[0.97] ${
                  active ? 'border-[#E8A33D] text-[#E8A33D] bg-[#E8A33D]/10' : 'border-[#2A3644] hover:border-[#3d4c60]'
                }`}
              >
                <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-md border transition-all ${
                  active ? 'border-[#E8A33D] bg-[#E8A33D]' : 'border-[#3A4A5C]'
                }`}>
                  {active && <CheckIcon className="w-3 h-3 text-[#171F2B]" />}
                </span>
                <span className="text-sm font-medium">{service.label}</span>
              </button>
            )
          })}
        </div>

        <Collapsible title="Genres uitsluiten" summary={genreSummary}>
          <p className="text-[#93A3B5] text-sm mb-3 leading-relaxed">
            Vink hier alleen aan wat je niet wilt zien. Aangevinkte genres worden nooit aanbevolen, ook niet als een favoriet erop lijkt.
          </p>
          <h4 className="text-sm text-[#93A3B5] mb-2">Films</h4>
          <div className="flex flex-wrap gap-2 mb-4">
            {MOVIE_GENRES.map((genre) => (
              <ExcludeChip key={genre.id} active={excludedGenres.includes(genre.id)} label={genre.label} onClick={() => toggleGenre(genre.id)} />
            ))}
          </div>
          <h4 className="text-sm text-[#93A3B5] mb-2">Series</h4>
          <div className="flex flex-wrap gap-2">
            {TV_GENRES.map((genre) => (
              <ExcludeChip key={genre.id} active={excludedGenres.includes(genre.id)} label={genre.label} onClick={() => toggleGenre(genre.id)} />
            ))}
          </div>
        </Collapsible>

        <div className="mt-4">
          <ExcludedGenreWarning excludedGenreIds={excludedGenres} onAllow={toggleGenre} />
        </div>

        <GroupTitle title="Mijn lijsten" />
        <Link href="/onboarding" className={linkRow}>
          <span>
            <span className="block text-sm font-medium">Favorieten beheren</span>
            <span className="block text-xs text-[#93A3B5] mt-0.5">Films, series, acteurs en regisseurs vind je bij Zoeken</span>
          </span>
        </Link>
        <Link href="/verborgen" className={linkRow}>
          <span>
            <span className="block text-sm font-medium">Verborgen films of series beheren</span>
            <span className="block text-xs text-[#93A3B5] mt-0.5">Bekijk wat je hebt verborgen en zet het terug</span>
          </span>
        </Link>
        {/* Alleen op een computer: de export van Letterboxd haal je ook op een computer op. */}
        <Link href="/import" className={`hidden [@media(pointer:fine)]:flex ${linkRow}`}>
          <span>
            <span className="block text-sm font-medium">Importeren uit Letterboxd</span>
            <span className="block text-xs text-[#93A3B5] mt-0.5">Neem je films en beoordelingen over met je Letterboxd-export</span>
          </span>
        </Link>

        <GroupTitle title="Samen kijken" />
        <Collapsible title="Partner koppelen" summary={partnerSummary} openWhen={hasIncoming}>
          <p className="text-[#93A3B5] text-sm mb-4 leading-relaxed">
            Nodig je partner uit voor de Samen-aanbevelingen. Diegene moet de uitnodiging zelf accepteren voordat jullie smaak wordt gecombineerd.
          </p>

          <div className="mb-5">
            {!inviteLink ? (
              <button onClick={createInviteLink} disabled={inviteLinkLoading} className={`${btnPrimary} w-full`}>
                <UsersIcon className="w-4 h-4" />
                {inviteLinkLoading ? 'Bezig...' : 'Uitnodigingslink maken'}
              </button>
            ) : (
              <div className={`${card} p-4`}>
                <p className="text-xs text-[#93A3B5] mb-2">Deel deze link met je partner. Hij werkt één keer en is 7 dagen geldig.</p>
                <input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} className={`${input} text-xs mb-3`} />
                <div className="flex gap-2">
                  <button onClick={shareInviteLink} className={`${btnPrimary} flex-1`}>
                    {linkCopied ? <CheckIcon className="w-4 h-4" /> : null}
                    {linkCopied ? 'Gekopieerd' : 'Delen'}
                  </button>
                  <button onClick={createInviteLink} disabled={inviteLinkLoading} className="text-sm text-[#93A3B5] px-3">
                    Nieuwe link
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-[#5E6D80] mb-2">Of nodig iemand uit die al een account heeft, via het e-mailadres:</p>
          <div className="flex gap-2 mb-4">
            <input
              type="email"
              value={partnerEmail}
              onChange={(e) => setPartnerEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
              placeholder="E-mailadres van je partner"
              className={`${input} flex-1`}
            />
            <button onClick={sendInvite} disabled={inviteLoading} className={btnPrimary}>
              Uitnodigen
            </button>
          </div>

          {connections.length === 0 && (
            <p className="text-[#93A3B5] text-sm flex items-center gap-2">
              <UsersIcon className="w-4 h-4 text-[#5E6D80]" />
              Nog geen koppeling met een partner.
            </p>
          )}
          {connections.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {connections.map((c) => (
                <div key={c.id} className={`${card} flex items-center gap-3 flex-wrap px-4 py-3`}>
                  <span className="flex-1 text-sm min-w-[160px]">
                    {c.other_email}
                    <span className="block text-xs text-[#5E6D80] mt-0.5">
                      {c.status === 'accepted'
                        ? 'Gekoppeld'
                        : c.direction === 'incoming'
                          ? 'Wil koppelen'
                          : 'Wacht op reactie'}
                    </span>
                  </span>
                  <div className="flex gap-2">
                    {c.status === 'pending' && c.direction === 'incoming' && (
                      <button
                        onClick={() => acceptConnection(c.id)}
                        className="text-sm font-medium border border-[#52A9A0] text-[#52A9A0] rounded-full px-3.5 py-1.5 hover:bg-[#52A9A0]/10 transition-colors touch-manipulation active:scale-[0.96]"
                      >
                        Accepteren
                      </button>
                    )}
                    <button
                      onClick={() => removeConnection(c.id)}
                      className="text-[#93A3B5] hover:text-[#C97064] transition-colors p-1.5"
                      aria-label="Verwijderen"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Collapsible>

        <GroupTitle title="Over de app" />
        <button
          onClick={() => setShowWhatsNew(true)}
          className="w-full text-left rounded-xl border border-[#2A3644] px-4 py-3.5 mb-2 hover:border-[#3d4c60] transition-colors touch-manipulation"
        >
          <span className="block text-sm font-medium">Wat is er nieuw</span>
          <span className="block text-xs text-[#93A3B5] mt-0.5">De laatste verbeteringen aan Kijkassistent</span>
        </button>

        {isAdmin && (
          <Link href="/beheer" className={linkRow}>
            <span>
              <span className="block text-sm font-medium">Gebruiksoverzicht</span>
              <span className="block text-xs text-[#93A3B5] mt-0.5">Wie de app gebruikt, per dag en per gebruiker (alleen voor jou)</span>
            </span>
          </Link>
        )}

        <div className="mt-10">
          <Collapsible title="Account verwijderen" tone="danger">
            <p className="text-[#93A3B5] text-sm mb-3 leading-relaxed">
              Wist je account en al je gegevens (favorieten, beoordelingen, kijklijst en koppelingen). Dit kan niet ongedaan worden gemaakt.
            </p>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-sm font-medium text-[#C97064] border border-[#C97064]/40 rounded-full px-4 py-2.5 hover:bg-[#C97064]/10 transition-colors touch-manipulation"
              >
                Account verwijderen
              </button>
            ) : (
              <div className="rounded-xl border border-[#C97064]/40 bg-[#C97064]/5 p-4">
                <p className="text-sm mb-3">Weet je het zeker? Alles wordt direct en definitief gewist.</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="text-sm font-semibold bg-[#C97064] text-[#171F2B] rounded-full px-4 py-2.5 disabled:opacity-50 touch-manipulation"
                  >
                    {deleting ? 'Verwijderen...' : 'Ja, verwijder alles'}
                  </button>
                  <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="text-sm text-[#93A3B5] px-4 py-2.5">
                    Annuleren
                  </button>
                </div>
              </div>
            )}
          </Collapsible>
        </div>

        <LegalLinks className="mt-10" />
      </main>

      {/* Melding over het automatisch opslaan, boven de onderste balk. */}
      <div className="fixed inset-x-0 bottom-24 z-30 flex justify-center pointer-events-none" aria-live="polite">
        {saveState !== 'idle' && (
          <span
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium shadow-[0_6px_18px_rgba(0,0,0,0.35)] animate-fade-in ${
              saveState === 'error' ? 'bg-[#C97064] text-[#171F2B]' : 'bg-[#1A2330] text-[#F2EFE9] border border-[#2A3644]'
            }`}
          >
            {saveState === 'saved' && <CheckIcon className="w-4 h-4 text-[#52A9A0]" />}
            {saveState === 'saving' ? 'Opslaan...' : saveState === 'saved' ? 'Opgeslagen' : 'Opslaan mislukt'}
          </span>
        )}
      </div>

      {showWhatsNew && <WhatsNewSheet all onClose={() => setShowWhatsNew(false)} />}

      <BottomNav />
    </>
  )
}
