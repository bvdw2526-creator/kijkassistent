'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import LegalLinks from '../components/LegalLinks'
import ExcludedGenreWarning from '../components/ExcludedGenreWarning'
import { supabase, getCurrentUser } from '@/lib/supabase'
import BottomNav from '../components/BottomNav'
import { btnPrimary, input, chip, card } from '../components/ui'
import { CheckIcon, TrashIcon, UsersIcon } from '../components/Icons'

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

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="font-display text-lg">{title}</h2>
      {hint && <p className="text-[#93A3B5] text-sm mt-0.5 leading-relaxed">{hint}</p>}
    </div>
  )
}

export default function Settings() {
  const [selected, setSelected] = useState<string[]>([])
  const [excludedGenres, setExcludedGenres] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [onboardingComplete, setOnboardingComplete] = useState(true)

  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [connections, setConnections] = useState<PartnerConnection[]>([])
  const [partnerEmail, setPartnerEmail] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState('')
  const [inviteLinkLoading, setInviteLinkLoading] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  useEffect(() => {
    loadProfile()
    loadConnections()
  }, [])

  async function loadProfile() {
    const user = await getCurrentUser()
    if (!user) return
    const { data } = await supabase
      .from('profiles')
      .select('streaming_services, excluded_genres, onboarding_completed_at')
      .eq('id', user.id)
      .single()
    setSelected(data?.streaming_services || [])
    setExcludedGenres(data?.excluded_genres || [])
    setOnboardingComplete(!!data?.onboarding_completed_at)
    setLoading(false)
  }

  function toggleService(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((s) => s !== id) : [...current, id]
    )
    setSaved(false)
  }

  function toggleGenre(id: number) {
    setExcludedGenres((current) =>
      current.includes(id) ? current.filter((g) => g !== id) : [...current, id]
    )
    setSaved(false)
  }

  async function handleSave() {
    const user = await getCurrentUser()
    if (!user) return
    setSaved(false)
    setErrorMessage(null)
    const { error } = await supabase
      .from('profiles')
      .update({ streaming_services: selected, excluded_genres: excludedGenres })
      .eq('id', user.id)
    if (error) {
      console.error('Voorkeuren opslaan mislukt:', error)
      setErrorMessage(
        `Kon niet opslaan: ${error.message}. Is de migratie "excluded_genres" al uitgevoerd in Supabase?`
      )
      return
    }
    setSaved(true)
  }

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

  return (
    <>
      <main className="max-w-sm mx-auto px-5 pt-6 pb-28">
        <h1 className="font-display text-2xl mb-1">Mijn voorkeuren</h1>
        <p className="text-[#93A3B5] mb-6">Stel in wat je aanbevelingen beter maakt.</p>

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

        <Link
          href="/onboarding"
          className="flex items-center justify-between gap-3 rounded-xl border border-[#2A3644] px-4 py-3.5 mb-3 hover:border-[#3d4c60] transition-colors"
        >
          <span>
            <span className="block text-sm font-medium">Favorieten beheren</span>
            <span className="block text-xs text-[#93A3B5] mt-0.5">Films, series, acteurs en regisseurs vind je bij Zoeken</span>
          </span>
        </Link>

        <Link
          href="/profiel"
          className="flex items-center justify-between gap-3 rounded-xl border border-[#2A3644] px-4 py-3.5 mb-6 hover:border-[#3d4c60] transition-colors"
        >
          <span>
            <span className="block text-sm font-medium">Jouw kijkprofiel</span>
            <span className="block text-xs text-[#93A3B5] mt-0.5">Statistieken over je favorieten en beoordelingen</span>
          </span>
        </Link>

        {errorMessage && (
          <p className="text-sm text-[#C97064] border border-[#C97064]/40 bg-[#C97064]/5 rounded-xl px-3.5 py-2.5 mb-6">
            {errorMessage}
          </p>
        )}

        <SectionTitle title="Streamingdiensten" hint="Selecteer waar je een abonnement op hebt. Pathé Thuis is huren per titel: aanvinken betekent dat titels die je daar kunt huren ook worden getoond." />
        <div className="grid grid-cols-2 gap-2 mb-8">
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

        <SectionTitle
          title="Genres uitsluiten"
          hint="Vink hier alleen aan wat je niet wilt zien. Aangevinkte genres worden nooit aanbevolen, ook niet als een favoriet erop lijkt."
        />
        <h3 className="text-sm text-[#93A3B5] mb-2">Films</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {MOVIE_GENRES.map((genre) => (
            <button key={genre.id} onClick={() => toggleGenre(genre.id)} className={chip(excludedGenres.includes(genre.id), 'coral')}>
              {genre.label}
            </button>
          ))}
        </div>
        <h3 className="text-sm text-[#93A3B5] mb-2">Series</h3>
        <div className="flex flex-wrap gap-2 mb-8">
          {TV_GENRES.map((genre) => (
            <button key={genre.id} onClick={() => toggleGenre(genre.id)} className={chip(excludedGenres.includes(genre.id), 'coral')}>
              {genre.label}
            </button>
          ))}
        </div>

        <ExcludedGenreWarning excludedGenreIds={excludedGenres} onAllow={toggleGenre} />

        <button onClick={handleSave} className={`${btnPrimary} w-full mb-10`}>
          {saved ? <CheckIcon className="w-4 h-4" /> : null}
          {saved ? 'Opgeslagen' : 'Opslaan'}
        </button>

        <SectionTitle
          title="Partner koppelen"
          hint="Nodig je partner uit voor de Samen-aanbevelingen. Diegene moet de uitnodiging zelf accepteren voordat jullie smaak wordt gecombineerd."
        />

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
          <p className="text-[#93A3B5] text-sm mb-8 flex items-center gap-2">
            <UsersIcon className="w-4 h-4 text-[#5E6D80]" />
            Nog geen koppeling met een partner.
          </p>
        )}
        {connections.length > 0 && (
          <div className="flex flex-col gap-1.5 mb-8">
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

        <div className="mt-12 pt-6 border-t border-[#2A3644]">
          <SectionTitle
            title="Account verwijderen"
            hint="Wist je account en al je gegevens (favorieten, beoordelingen, watchlist en koppelingen). Dit kan niet ongedaan worden gemaakt."
          />
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
        </div>

        <LegalLinks className="mt-10" />
      </main>

      <BottomNav />
    </>
  )
}
