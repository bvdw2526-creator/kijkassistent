'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import LegalLinks from '../components/LegalLinks'
import ExcludedGenreWarning from '../components/ExcludedGenreWarning'
import GenreExcludeGroups from '../components/GenreExcludeGroups'
import { supabase, getCurrentUser, authFetch } from '@/lib/supabase'
import PushSettings from '../components/PushSettings'
import BottomNav from '../components/BottomNav'
import LanguageSetting from '../components/LanguageSetting'
import { WhatsNewSheet } from '../components/WhatsNew'
import FeedbackSheet from '../components/FeedbackSheet'
import { btnPrimary, input, card } from '../components/ui'
import { CheckIcon, ChevronLeftIcon, TrashIcon, UsersIcon } from '../components/Icons'
import { SKINS } from '@/lib/skins'
import { MIN_YEAR_OPTIONS } from '@/lib/tooOld'
import { useSkin, setSkin } from '@/lib/useSkin'
import { toggleServiceList } from '@/lib/serviceToggle'

const AVAILABLE_SERVICES = [
  { id: 'netflix', label: 'Netflix' },
  { id: 'videoland', label: 'Videoland' },
  { id: 'disney_plus', label: 'Disney+' },
  { id: 'amazon_prime', label: 'Prime Video' },
  { id: 'hbo_max', label: 'HBO Max' },
  { id: 'apple_tv', label: 'Apple TV' },
  { id: 'skyshowtime', label: 'SkyShowtime' },
  { id: 'viaplay', label: 'Viaplay' },
  { id: 'npo_start', label: 'NPO Start' },
  { id: 'npo_plus', label: 'NPO Plus' },
  { id: 'nlziet', label: 'NLZIET' },
  { id: 'pathe_thuis', label: 'Pathé Thuis (huren)' },
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
  return <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-3 mt-10 laptop:first:mt-0">{title}</h2>
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3">
      <h3 className="font-display text-lg">{title}</h3>
      {hint && <p className="text-muted text-sm mt-0.5 leading-relaxed">{hint}</p>}
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
    <div className={`rounded-xl border ${tone === 'danger' ? 'border-coral/30' : 'border-line'}`}>
      <button
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left touch-manipulation"
      >
        <span className="min-w-0">
          <span className={`block text-sm font-medium ${tone === 'danger' ? 'text-coral' : ''}`}>{title}</span>
          {summary && <span className="block text-xs text-muted mt-0.5 truncate">{summary}</span>}
        </span>
        <ChevronLeftIcon className={`w-4 h-4 flex-shrink-0 text-muted transition-transform ${open ? '-rotate-90' : 'rotate-180'}`} />
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  )
}

export default function Settings() {
  const t = useTranslations('settings')
  const tps = useTranslations('pushSettings')
  const tsk = useTranslations('skins')
  const tt = useTranslations('title')
  const tw = useTranslations('whatsNew')
  const tsv = useTranslations('services')
  const tf = useTranslations('feedback')
  const [selected, setSelected] = useState<string[]>([])
  const [excludedGenres, setExcludedGenres] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [onboardingComplete, setOnboardingComplete] = useState(true)
  const [showWhatsNew, setShowWhatsNew] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const skin = useSkin()
  // Eigen grens "Niet ouder dan" (profiles.min_year); null = geen grens. Wordt direct opgeslagen bij het kiezen.
  const [minYear, setMinYear] = useState<number | null>(null)
  // Wekelijkse tipsmail (profiles.weekly_mail); wordt direct opgeslagen bij het omzetten.
  const [weeklyMail, setWeeklyMail] = useState(true)

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
      .select('streaming_services, excluded_genres, onboarding_completed_at, min_year, weekly_mail')
      .eq('id', user.id)
      .single()
    const services: string[] = data?.streaming_services || []
    const genres: number[] = Array.isArray(data?.excluded_genres) ? data.excluded_genres : []
    lastSavedRef.current = snapshotOf(services, genres)
    setSelected(services)
    setExcludedGenres(genres)
    setMinYear(typeof data?.min_year === 'number' ? data.min_year : null)
    setWeeklyMail(data?.weekly_mail !== false)
    setOnboardingComplete(!!data?.onboarding_completed_at)
    setLoading(false)
  }

  async function chooseMinYear(year: number | null) {
    const previous = minYear
    setMinYear(year)
    const user = await getCurrentUser()
    if (!user) return
    const { error } = await supabase.from('profiles').update({ min_year: year }).eq('id', user.id)
    if (error) {
      console.error('Grens opslaan mislukt:', error)
      setMinYear(previous)
      setErrorMessage(t('errMinYear', { message: error.message }))
    }
  }

  async function toggleWeeklyMail() {
    const next = !weeklyMail
    setWeeklyMail(next)
    const user = await getCurrentUser()
    if (!user) return
    const { error } = await supabase.from('profiles').update({ weekly_mail: next }).eq('id', user.id)
    if (error) {
      console.error('Tipsmail-instelling opslaan mislukt:', error)
      setWeeklyMail(!next)
      setErrorMessage(t('errSetting', { message: error.message }))
    }
  }

  function toggleService(id: string) {
    setSelected((current) => toggleServiceList(current, id))
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
        setErrorMessage(t('errSave', { message: error.message }))
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
      setErrorMessage(t('errDelete', { message: error.message }))
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
      setErrorMessage(t('errLink', { message: error?.message ?? t('unknownError') }))
      return
    }
    setInviteLink(`${window.location.origin}/uitnodiging/${data}`)
  }

  async function shareInviteLink() {
    const text = t('shareText')
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
      setErrorMessage(t('copyFailed'))
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
          ? t('noAccountForEmail')
          : t('errInvite', { message: error.message })
      )
      return
    }
    setPartnerEmail('')
    authFetch('/api/push/partner', { method: 'POST' }).catch(() => {})
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
      setErrorMessage(t('errAccept', { message: error.message }))
      return
    }
    authFetch('/api/push/partner', { method: 'POST' }).catch(() => {})
    loadConnections()
  }

  async function removeConnection(id: string) {
    setErrorMessage(null)
    const { error } = await supabase.from('partner_connections').delete().eq('id', id)
    if (error) {
      console.error('Koppeling verwijderen mislukt:', error)
      setErrorMessage(t('errRemoveLink', { message: error.message }))
      return
    }
    setConnections(connections.filter((c) => c.id !== id))
  }

  // Tijdens het laden blijven de titel en de menubalk staan, net als op de andere pagina's. Anders verdwijnt de balk
  // even en lijkt het alsof de hele pagina opnieuw laadt.
  if (loading) {
    return (
      <>
        <main className="max-w-sm laptop:max-w-5xl mx-auto px-5 pt-6 pb-32">
          <h1 className="font-display text-2xl mb-1">{t('heading')}</h1>
          <p className="text-muted mb-6 laptop:mb-8">{t('intro')}</p>
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-surface animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        </main>
        <BottomNav />
      </>
    )
  }

  const linkRow = 'flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3.5 mb-2 hover:border-line-strong transition-colors'

  const acceptedPartner = connections.find((c) => c.status === 'accepted')
  const hasIncoming = connections.some((c) => c.status === 'pending' && c.direction === 'incoming')
  const partnerSummary = acceptedPartner
    ? t('linkedWith', { email: acceptedPartner.other_email })
    : hasIncoming
      ? t('invitationWaiting')
      : connections.length > 0
        ? t('waitingForReply')
        : t('notLinked')
  const genreSummary = excludedGenres.length > 0 ? t('excludedCount', { count: excludedGenres.length }) : t('nothingExcluded')

  return (
    <>
      <main className="max-w-sm laptop:max-w-5xl mx-auto px-5 pt-6 pb-32">
        <h1 className="font-display text-2xl mb-1">{t('heading')}</h1>
        <p className="text-muted mb-6 laptop:mb-8">{t('intro')}</p>

        {/* Taal staat bovenaan, zodat je die meteen vindt als de app in een taal staat die je niet leest. */}
        <div className="mb-6 laptop:max-w-md">
          <LanguageSetting />
        </div>

        {!onboardingComplete && (
          <Link
            href="/wizard"
            className="flex items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3.5 mb-3 hover:border-accent transition-colors"
          >
            <span>
              <span className="block text-sm font-medium text-accent">{t('finishProfile')}</span>
              <span className="block text-xs text-muted mt-0.5">{t('finishProfileSub')}</span>
            </span>
          </Link>
        )}

        {errorMessage && (
          <p className="text-sm text-coral border border-coral/40 bg-coral/5 rounded-xl px-3.5 py-2.5 mb-6">
            {errorMessage}
          </p>
        )}

        {/* Op laptop twee kolommen: links wat je kijkt en je lijsten, rechts de rest. Elders gewoon onder elkaar. */}
        <div className="laptop:grid laptop:grid-cols-2 laptop:gap-x-12 laptop:items-start">
          <div>
            <GroupTitle title={t('groupWatch')} />
            <SectionTitle title={t('services')} hint={t('servicesHint')} />
            <div className="grid grid-cols-2 gap-2 mb-6">
              {AVAILABLE_SERVICES.map((service) => {
                const active = selected.includes(service.id)
                return (
                  <button
                    key={service.id}
                    onClick={() => toggleService(service.id)}
                    className={`flex items-center gap-2 text-left rounded-xl border px-4 py-3 transition-all touch-manipulation active:scale-[0.97] ${
                      active ? 'border-accent text-accent bg-accent/10' : 'border-line hover:border-line-strong'
                    }`}
                  >
                    <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-md border transition-all ${
                      active ? 'border-accent bg-accent' : 'border-control'
                    }`}>
                      {active && <CheckIcon className="w-3 h-3 text-on-accent" />}
                    </span>
                    <span className="text-sm font-medium">{service.id === 'pathe_thuis' ? tsv('patheRent') : service.label}</span>
                  </button>
                )
              })}
            </div>

            <Collapsible title={t('excludeGenres')} summary={genreSummary}>
              <p className="text-muted text-sm mb-3 leading-relaxed">
                {t('excludeHint')}
              </p>
              <GenreExcludeGroups excluded={excludedGenres} onToggle={toggleGenre} />
            </Collapsible>

            <div className="mt-4">
              <ExcludedGenreWarning excludedGenreIds={excludedGenres} onAllow={toggleGenre} />
            </div>

            <div className="mt-6">
              <SectionTitle
                title={t('minYear')}
                hint={t('minYearHint')}
              />
              <div className="flex flex-wrap gap-2">
                {[null, ...MIN_YEAR_OPTIONS].map((year) => {
                  const active = minYear === year
                  return (
                    <button
                      key={year ?? 'alles'}
                      onClick={() => chooseMinYear(year)}
                      aria-pressed={active}
                      className={`rounded-full border px-3.5 py-2 text-sm font-medium transition-all touch-manipulation active:scale-[0.96] ${
                        active ? 'border-accent bg-accent/12 text-accent' : 'border-line text-muted hover:border-line-strong hover:text-foreground'
                      }`}
                    >
                      {year === null ? t('all') : t('fromYear', { year })}
                    </button>
                  )
                })}
              </div>
            </div>

            <GroupTitle title={t('groupMail')} />
            <button
              role="switch"
              aria-checked={weeklyMail}
              onClick={toggleWeeklyMail}
              className={`${linkRow} w-full text-left touch-manipulation`}
            >
              <span>
                <span className="block text-sm font-medium">{t('weeklyMail')}</span>
                <span className="block text-xs text-muted mt-0.5">{t('weeklyMailSub')}</span>
              </span>
              <span className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors ${weeklyMail ? 'bg-accent' : 'bg-control'}`}>
                <span
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${weeklyMail ? 'left-[22px]' : 'left-0.5'}`}
                />
              </span>
            </button>

            <PushSettings title={<GroupTitle title={tps('heading')} />} rowClass={linkRow} />

            <GroupTitle title={t('groupLists')} />
            <Link href="/onboarding" className={linkRow}>
              <span>
                <span className="block text-sm font-medium">{t('manageFavorites')}</span>
                <span className="block text-xs text-muted mt-0.5">{t('manageFavoritesSub')}</span>
              </span>
            </Link>
            <Link href="/verborgen" className={linkRow}>
              <span>
                <span className="block text-sm font-medium">{t('manageHidden')}</span>
                <span className="block text-xs text-muted mt-0.5">{t('manageHiddenSub')}</span>
              </span>
            </Link>
            {/* Alleen op een computer: de export van Letterboxd haal je ook op een computer op. */}
            <Link href="/import" className={`hidden [@media(pointer:fine)]:flex ${linkRow}`}>
              <span>
                <span className="block text-sm font-medium">{t('importLetterboxd')}</span>
                <span className="block text-xs text-muted mt-0.5">{t('importLetterboxdSub')}</span>
              </span>
            </Link>
          </div>

          <div>
            <GroupTitle title={t('groupTogether')} />
            <Collapsible title={t('linkPartner')} summary={partnerSummary} openWhen={hasIncoming}>
              <p className="text-muted text-sm mb-4 leading-relaxed">
                {t('partnerIntro')}
              </p>

              <div className="mb-5">
                {!inviteLink ? (
                  <button onClick={createInviteLink} disabled={inviteLinkLoading} className={`${btnPrimary} w-full`}>
                    <UsersIcon className="w-4 h-4" />
                    {inviteLinkLoading ? tt('loadingShort') : t('createInviteLink')}
                  </button>
                ) : (
                  <div className={`${card} p-4`}>
                    <p className="text-xs text-muted mb-2">{t('shareLinkHint')}</p>
                    <input readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} className={`${input} text-xs mb-3`} />
                    <div className="flex gap-2">
                      <button onClick={shareInviteLink} className={`${btnPrimary} flex-1`}>
                        {linkCopied ? <CheckIcon className="w-4 h-4" /> : null}
                        {linkCopied ? t('copied') : t('share')}
                      </button>
                      <button onClick={createInviteLink} disabled={inviteLinkLoading} className="text-sm text-muted px-3">
                        {t('newLink')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-faint mb-2">{t('orByEmail')}</p>
              <div className="flex gap-2 mb-4">
                <input
                  type="email"
                  value={partnerEmail}
                  onChange={(e) => setPartnerEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
                  placeholder={t('partnerEmail')}
                  className={`${input} flex-1`}
                />
                <button onClick={sendInvite} disabled={inviteLoading} className={btnPrimary}>
                  {t('invite')}
                </button>
              </div>

              {connections.length === 0 && (
                <p className="text-muted text-sm flex items-center gap-2">
                  <UsersIcon className="w-4 h-4 text-faint" />
                  {t('noConnection')}
                </p>
              )}
              {connections.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {connections.map((c) => (
                    <div key={c.id} className={`${card} flex items-center gap-3 flex-wrap px-4 py-3`}>
                      <span className="flex-1 text-sm min-w-[160px]">
                        {c.other_email}
                        <span className="block text-xs text-faint mt-0.5">
                          {c.status === 'accepted'
                            ? t('linked')
                            : c.direction === 'incoming'
                              ? t('wantsToLink')
                              : t('waitingForReply')}
                        </span>
                      </span>
                      <div className="flex gap-2">
                        {c.status === 'pending' && c.direction === 'incoming' && (
                          <button
                            onClick={() => acceptConnection(c.id)}
                            className="text-sm font-medium border border-teal text-teal rounded-full px-3.5 py-1.5 hover:bg-teal/10 transition-colors touch-manipulation active:scale-[0.96]"
                          >
                            {t('accept')}
                          </button>
                        )}
                        <button
                          onClick={() => removeConnection(c.id)}
                          className="text-muted hover:text-coral transition-colors p-1.5"
                          aria-label={tt('remove')}
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Collapsible>

            <GroupTitle title={t('groupLooks')} />
            <SectionTitle title={t('skin')} hint={t('skinHint')} />
            <div className="flex flex-col gap-2">
              {SKINS.map((s) => {
                const active = skin === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => setSkin(s.id)}
                    aria-pressed={active}
                    className={`flex items-center gap-3 text-left rounded-xl border px-4 py-3 transition-all touch-manipulation active:scale-[0.98] ${
                      active ? 'border-accent bg-accent/10' : 'border-line hover:border-line-strong'
                    }`}
                  >
                    <span className="flex flex-shrink-0 -space-x-1.5" aria-hidden="true">
                      {s.swatch.map((color) => (
                        <span key={color} className="h-5 w-5 rounded-full border border-white/20" style={{ backgroundColor: color }} />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-medium ${active ? 'text-accent' : ''}`}>{tsk(`${s.id}Label`)}</span>
                      <span className="block text-xs text-muted mt-0.5 leading-snug">{tsk(`${s.id}Description`)}</span>
                    </span>
                    {active && <CheckIcon className="w-4 h-4 flex-shrink-0 text-accent" />}
                  </button>
                )
              })}
            </div>

            <GroupTitle title={t('groupAbout')} />
            <button
              onClick={() => setShowWhatsNew(true)}
              className="w-full text-left rounded-xl border border-line px-4 py-3.5 mb-2 hover:border-line-strong transition-colors touch-manipulation"
            >
              <span className="block text-sm font-medium">{tw('title')}</span>
              <span className="block text-xs text-muted mt-0.5">{t('whatsNewSub')}</span>
            </button>

            <button
              onClick={() => setShowFeedback(true)}
              className="w-full text-left rounded-xl border border-line px-4 py-3.5 mb-2 hover:border-line-strong transition-colors touch-manipulation"
            >
              <span className="block text-sm font-medium">{tf('row')}</span>
              <span className="block text-xs text-muted mt-0.5">{tf('rowSub')}</span>
            </button>

            {isAdmin && (
              <Link href="/beheer" className={linkRow}>
                <span>
                  <span className="block text-sm font-medium">{t('usage')}</span>
                  <span className="block text-xs text-muted mt-0.5">{t('usageSub')}</span>
                </span>
              </Link>
            )}

            <div className="mt-10">
              <Collapsible title={t('deleteAccount')} tone="danger">
                <p className="text-muted text-sm mb-3 leading-relaxed">
                  {t('deleteIntro')}
                </p>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="text-sm font-medium text-coral border border-coral/40 rounded-full px-4 py-2.5 hover:bg-coral/10 transition-colors touch-manipulation"
                  >
                    {t('deleteAccount')}
                  </button>
                ) : (
                  <div className="rounded-xl border border-coral/40 bg-coral/5 p-4">
                    <p className="text-sm mb-3">{t('deleteConfirm')}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDeleteAccount}
                        disabled={deleting}
                        className="text-sm font-semibold bg-coral text-on-accent rounded-full px-4 py-2.5 disabled:opacity-50 touch-manipulation"
                      >
                        {deleting ? t('deleting') : t('deleteYes')}
                      </button>
                      <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="text-sm text-muted px-4 py-2.5">
                        {tt('cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </Collapsible>
            </div>
          </div>
        </div>

        <LegalLinks className="mt-10" />
      </main>

      {/* Melding over het automatisch opslaan, boven de onderste balk. */}
      <div className="fixed inset-x-0 bottom-24 z-30 flex justify-center pointer-events-none" aria-live="polite">
        {saveState !== 'idle' && (
          <span
            className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium shadow-[0_6px_18px_rgba(0,0,0,0.35)] animate-fade-in ${
              saveState === 'error' ? 'bg-coral text-on-accent' : 'bg-surface text-foreground border border-line'
            }`}
          >
            {saveState === 'saved' && <CheckIcon className="w-4 h-4 text-teal" />}
            {saveState === 'saving' ? t('saving') : saveState === 'saved' ? t('saved') : t('saveFailed')}
          </span>
        )}
      </div>

      {showWhatsNew && <WhatsNewSheet all onClose={() => setShowWhatsNew(false)} />}
      {showFeedback && <FeedbackSheet onClose={() => setShowFeedback(false)} />}

      <BottomNav />
    </>
  )
}
