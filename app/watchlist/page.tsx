'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useTranslations } from 'next-intl'
import { supabase, getCurrentUser } from '@/lib/supabase'
import { setWatchlistCount } from '@/lib/watchlistCount'
import { logRecommendationEvent } from '@/lib/recommendationEvents'
import BottomNav from '../components/BottomNav'
import TitleInfoSheet from '../components/TitleInfoSheet'
import { card, chip } from '../components/ui'
import { TrashIcon, HeartIcon, OkIcon, DislikeIcon, StarIcon } from '../components/Icons'
import { tap } from '@/lib/native'

// 'halloween': vanaf de Halloween-rij op Voor jou (zie app/components/HalloweenRow.tsx).
type RecommendationMode = 'focused' | 'balanced' | 'explore' | 'samen' | 'halloween'

type WatchlistItem = {
  id: number
  title: string
  poster_path: string | null
  media_type: 'movie' | 'tv'
  watchOn: string | null
  watchUrl: string | null
  sourceMode: RecommendationMode | null
  // Waarom de titel werd aanbevolen toen hij vanaf Voor jou op de lijst kwam (tabblad, percentage, redenen, scores), en
  // wanneer. Gaat bij beoordelen of favoriet maken mee, zodat te meten is of de aanbeveling raak was (zie outcomeInfo).
  sourceInfo: Record<string, unknown> | null
  addedAt: string | null
  // Alleen bij de gezamenlijke lijst: wie de titel toevoegde.
  addedByYou?: boolean
}

// Zelfde labels als op de aanbevelingenpagina (app/page.tsx), als sleutels onder "home" in messages/*.json — hier alleen
// als platte tekst getoond, geen tabblad-navigatie nodig. Halloween staat onder "watchlist".
const MODE_LABELS: Record<RecommendationMode, string> = {
  focused: 'focusedLabel',
  balanced: 'balancedLabel',
  explore: 'exploreLabel',
  samen: 'samenLabel',
  halloween: 'halloween',
}

// Weggehaald zonder oordeel: telt bij de trefkans als afgehaakt (zie lib/recommendationEvents.ts). Beoordelen of favoriet
// maken vanaf de lijst staat al in source_info en hoort hier niet bij. Met connectionId = van Onze lijst.
function logAfgehaakt(userId: string, item: WatchlistItem, connectionId: string | null) {
  const mode = typeof item.sourceInfo?.mode === 'string' ? item.sourceInfo.mode : item.sourceMode
  const days = item.addedAt ? Math.floor((Date.now() - new Date(item.addedAt).getTime()) / 86_400_000) : null
  logRecommendationEvent(userId, {
    event: 'afgehaakt',
    screen: connectionId ? 'onze_lijst' : 'kijklijst',
    mode: mode ?? null,
    media_type: item.media_type,
    tmdb_id: item.id,
    connection_id: connectionId,
    days_on_list: days !== null && days >= 0 ? days : null,
  })
}

export default function Watchlist() {
  const t = useTranslations('watchlist')
  const th = useTranslations('home')
  const tt = useTranslations('title')
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'movie' | 'tv'>('movie')
  const [error, setError] = useState<string | null>(null)
  const [infoItem, setInfoItem] = useState<WatchlistItem | null>(null)
  const [scope, setScope] = useState<'mine' | 'shared'>('mine')
  const [sharedItems, setSharedItems] = useState<WatchlistItem[]>([])
  const [connectionId, setConnectionId] = useState<string | null>(null)

  async function loadWatchlist() {
    const user = await getCurrentUser()
    if (!user) return

    // Gezamenlijke lijst ("Onze lijst"): alleen als er een gekoppelde partner is.
    const { data: connections } = await supabase
      .from('partner_connections')
      .select('id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},partner_id.eq.${user.id}`)
      .limit(1)
    const connId = connections?.[0]?.id ?? null
    if (connId) {
      setConnectionId(connId)
      const { data: shared } = await supabase
        .from('couple_watchlist')
        .select('tmdb_id, title, poster_path, media_type, watch_on, watch_url, added_by, added_at, source_info')
        .eq('connection_id', connId)
        .order('added_at', { ascending: false })
      setSharedItems(
        (shared || []).map((w) => ({
          id: w.tmdb_id,
          title: w.title,
          poster_path: w.poster_path,
          media_type: w.media_type as 'movie' | 'tv',
          watchOn: w.watch_on,
          watchUrl: w.watch_url,
          sourceMode: null,
          sourceInfo: w.source_info,
          addedAt: w.added_at,
          addedByYou: w.added_by === user.id,
        }))
      )
    }

    const { data } = await supabase
      .from('watchlist')
      .select('tmdb_id, title, poster_path, media_type, watch_on, watch_url, source_mode, added_at, source_info')
      .eq('user_id', user.id)
      .order('added_at', { ascending: false })

    if (data) {
      setItems(
        data.map((w) => ({
          id: w.tmdb_id,
          title: w.title,
          poster_path: w.poster_path,
          media_type: w.media_type as 'movie' | 'tv',
          watchOn: w.watch_on,
          watchUrl: w.watch_url,
          sourceMode: w.source_mode as RecommendationMode | null,
          sourceInfo: w.source_info,
          addedAt: w.added_at,
        }))
      )
    }
    setLoading(false)
  }

  useEffect(() => {
    loadWatchlist()
  }, [])

  // Het getal bij Kijklijst in het menu gelijk houden met je eigen lijst, ook als je hier iets weghaalt.
  useEffect(() => {
    if (!loading) setWatchlistCount(items.length)
  }, [items, loading])

  // Waarom de titel ooit werd aanbevolen, voor bij de beoordeling of favoriet: zo is te meten hoe vaak een aanbeveling die
  // je echt ging kijken raak was. Oudere titels hebben alleen het tabblad; titels die niet via Voor jou op de lijst kwamen
  // (Zoeken, Top 100, tip van de week) niets.
  function outcomeInfo(item: WatchlistItem): Record<string, unknown> | null {
    if (!item.sourceInfo && !item.sourceMode) return null
    return {
      ...(item.sourceInfo ?? { mode: item.sourceMode }),
      via: scope === 'shared' ? 'onze lijst' : 'kijklijst',
      addedAt: item.addedAt,
    }
  }

  async function handleRate(item: WatchlistItem, rating: 'dislike' | 'ok' | 'love') {
    tap()
    const user = await getCurrentUser()
    if (!user) return
    setError(null)

    // Op "Onze lijst" beoordeel je net als bij Samen persoonlijk; de markering in couple_ratings zorgt dat je
    // partner een vraagje krijgt om de titel ook zelf te beoordelen (zie PartnerRated). Mislukt die markering,
    // dan wordt je eigen beoordeling toch gewoon opgeslagen.
    if (scope === 'shared' && connectionId) {
      const { error: coupleError } = await supabase.from('couple_ratings').upsert(
        {
          connection_id: connectionId,
          tmdb_id: item.id,
          media_type: item.media_type,
          title: item.title,
          rating,
          rated_by: user.id,
        },
        { onConflict: 'connection_id,tmdb_id,media_type' }
      )
      if (coupleError) console.error('Samen-markering opslaan mislukt:', coupleError)
    }

    const info = outcomeInfo(item)
    const { data: ratingRow, error: ratingError } = await supabase
      .from('ratings')
      .upsert(
        {
          user_id: user.id,
          tmdb_id: item.id,
          title: item.title,
          rating,
          media_type: item.media_type,
          ...(info ? { source_info: info } : {}),
        },
        { onConflict: 'user_id,tmdb_id,media_type' }
      )
      .select()

    if (ratingError) {
      console.error('Rating opslaan mislukt:', ratingError)
      setError(t('errRating', { message: ratingError.message }))
      return
    }
    if (!ratingRow || ratingRow.length === 0) {
      // Waarschijnlijk een ontbrekende UPDATE-policy op ratings (RLS).
      setError(t('errNoRowSaved'))
      return
    }

    // Beoordeeld = gezien: de titel gaat van de gezamenlijke lijst af (en van je eigen lijst, als hij daar ook
    // op staat, zoals bij een gewone beoordeling).
    if (scope === 'shared' && connectionId) {
      const { data: removedShared, error: removeSharedError } = await supabase
        .from('couple_watchlist')
        .delete()
        .eq('connection_id', connectionId)
        .eq('tmdb_id', item.id)
        .eq('media_type', item.media_type)
        .select()
      if (removeSharedError || !removedShared || removedShared.length === 0) {
        console.error('Verwijderen van gezamenlijke watchlist mislukt:', removeSharedError)
        setError(t('errRatedNotRemovedShared'))
        return
      }
      await supabase
        .from('watchlist')
        .delete()
        .eq('user_id', user.id)
        .eq('tmdb_id', item.id)
        .eq('media_type', item.media_type)
      setSharedItems((current) => current.filter((i) => !(i.id === item.id && i.media_type === item.media_type)))
      setItems((current) => current.filter((i) => !(i.id === item.id && i.media_type === item.media_type)))
      return
    }

    // .select() erbij zodat een door RLS stilzwijgend genegeerde delete (0 rijen, geen
    // "error") niet ten onrechte als gelukt wordt behandeld — anders staat het item na
    // een refresh gewoon weer op de watchlist.
    const { data: deletedRow, error: deleteError } = await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', user.id)
      .eq('tmdb_id', item.id)
      .eq('media_type', item.media_type)
      .select()

    if (deleteError) {
      console.error('Verwijderen van watchlist mislukt:', deleteError)
      setError(t('errRemove', { message: deleteError.message }))
      return
    }
    if (!deletedRow || deletedRow.length === 0) {
      // Waarschijnlijk een ontbrekende DELETE-policy op watchlist (RLS).
      setError(t('errNoRowDeleted'))
      return
    }

    setItems((current) => current.filter((i) => !(i.id === item.id && i.media_type === item.media_type)))
  }

  // Favoriet = gezien en geweldig gevonden (zoals bij Zoeken en in de aanbevelingen). De titel gaat daarmee van
  // je kijklijst af, en op "Onze lijst" ook van de gezamenlijke lijst.
  async function handleFavorite(item: WatchlistItem) {
    const user = await getCurrentUser()
    if (!user) return
    setError(null)

    const info = outcomeInfo(item)
    const { error: favoriteError } = await supabase.from('favorite_movies').insert({
      user_id: user.id,
      tmdb_id: item.id,
      title: item.title,
      media_type: item.media_type,
      ...(info ? { source_info: info } : {}),
    })
    // 23505 = staat al bij je favorieten: dan is het doel al bereikt.
    if (favoriteError && favoriteError.code !== '23505') {
      console.error('Favoriet toevoegen mislukt:', favoriteError)
      setError(t('errFavorite', { message: favoriteError.message }))
      return
    }

    if (scope === 'shared' && connectionId) {
      const { error: removeSharedError } = await supabase
        .from('couple_watchlist')
        .delete()
        .eq('connection_id', connectionId)
        .eq('tmdb_id', item.id)
        .eq('media_type', item.media_type)
      if (removeSharedError) {
        console.error('Verwijderen van gezamenlijke watchlist mislukt:', removeSharedError)
        setError(t('errFavNotRemovedShared'))
        return
      }
      setSharedItems((current) => current.filter((i) => !(i.id === item.id && i.media_type === item.media_type)))
    }

    const { error: removeMineError } = await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', user.id)
      .eq('tmdb_id', item.id)
      .eq('media_type', item.media_type)
    if (removeMineError) {
      console.error('Verwijderen van watchlist mislukt:', removeMineError)
      setError(t('errFavNotRemovedMine'))
      return
    }
    setItems((current) => current.filter((i) => !(i.id === item.id && i.media_type === item.media_type)))
  }

  // Alleen van de watchlist af, zonder rating — zo blijft de titel ongewaardeerd en
  // telt hij weer gewoon mee als kandidaat in de aanbevelingscategorieën.
  async function handleRemove(item: WatchlistItem) {
    const user = await getCurrentUser()
    if (!user) return
    setError(null)

    const { data: deletedRow, error: deleteError } = await supabase
      .from('watchlist')
      .delete()
      .eq('user_id', user.id)
      .eq('tmdb_id', item.id)
      .eq('media_type', item.media_type)
      .select()

    if (deleteError) {
      console.error('Verwijderen van watchlist mislukt:', deleteError)
      setError(t('errRemove', { message: deleteError.message }))
      return
    }
    if (!deletedRow || deletedRow.length === 0) {
      // Waarschijnlijk een ontbrekende DELETE-policy op watchlist (RLS).
      setError(t('errNoRowDeleted'))
      return
    }

    logAfgehaakt(user.id, item, null)
    setItems((current) => current.filter((i) => !(i.id === item.id && i.media_type === item.media_type)))
  }

  // Van de gezamenlijke lijst mag ieder van jullie een titel weghalen (bv. als je hem gekeken hebt).
  async function handleRemoveShared(item: WatchlistItem) {
    if (!connectionId) return
    setError(null)
    const { data: deletedRow, error: deleteError } = await supabase
      .from('couple_watchlist')
      .delete()
      .eq('connection_id', connectionId)
      .eq('tmdb_id', item.id)
      .eq('media_type', item.media_type)
      .select()
    if (deleteError) {
      console.error('Verwijderen van gezamenlijke watchlist mislukt:', deleteError)
      setError(t('errRemoveShared', { message: deleteError.message }))
      return
    }
    if (!deletedRow || deletedRow.length === 0) {
      setError(t('errNoRowDeleted'))
      return
    }
    const user = await getCurrentUser()
    if (user) logAfgehaakt(user.id, item, connectionId)
    setSharedItems((current) => current.filter((i) => !(i.id === item.id && i.media_type === item.media_type)))
  }

  const shown = scope === 'mine' ? items : sharedItems
  const movieItems = shown.filter((i) => i.media_type === 'movie')
  const tvItems = shown.filter((i) => i.media_type === 'tv')
  const visible = tab === 'movie' ? movieItems : tvItems

  return (
    <>
      <main className="max-w-xl laptop:max-w-5xl mx-auto px-5 pt-6 pb-28">
        <h1 className="font-display text-2xl mb-1">{t('heading')}</h1>
        <p className="text-muted mb-6">{scope === 'shared' ? t('subShared') : t('subMine')}</p>

        {connectionId && (
          <div className="flex gap-1 p-1 rounded-full bg-surface border border-line mb-4 laptop:max-w-xl">
            {(['mine', 'shared'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={`flex-1 px-4 py-1.5 text-sm font-medium rounded-full transition-all touch-manipulation ${
                  scope === s ? 'bg-accent text-on-accent' : 'text-muted'
                }`}
              >
                {s === 'mine' ? t('myList', { count: items.length }) : t('ourList', { count: sharedItems.length })}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="text-sm text-coral border border-coral/40 bg-coral/5 rounded-xl px-3.5 py-2.5 mb-6">
            {error}
          </p>
        )}

        <div className="flex gap-1 p-1 rounded-full bg-surface border border-line mb-6 w-fit">
          <button
            onClick={() => setTab('movie')}
            className={`px-4 py-1.5 text-sm font-medium whitespace-nowrap rounded-full transition-all touch-manipulation ${
              tab === 'movie' ? 'bg-accent text-on-accent' : 'text-muted'
            }`}
          >
            {th('filmsCount', { count: movieItems.length })}
          </button>
          <button
            onClick={() => setTab('tv')}
            className={`px-4 py-1.5 text-sm font-medium whitespace-nowrap rounded-full transition-all touch-manipulation ${
              tab === 'tv' ? 'bg-accent text-on-accent' : 'text-muted'
            }`}
          >
            {th('seriesCount', { count: tvItems.length })}
          </button>
        </div>

        {loading && (
          <div className="flex flex-col gap-3 laptop:grid laptop:grid-cols-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-surface animate-skeleton" style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
        )}

        {!loading && visible.length === 0 && (
          <p className="text-muted border border-dashed border-line rounded-2xl px-4 py-10 text-center">
            {scope === 'shared'
              ? t('emptyShared')
              : t('emptyMine')}
          </p>
        )}

        <div className="flex flex-col gap-3 laptop:grid laptop:grid-cols-2">
          {visible.map((item) => (
            <div key={`${item.media_type}-${item.id}`} className={`${card} p-3`}>
              <div className="flex gap-3">
                <button onClick={() => setInfoItem(item)} className="flex-shrink-0 touch-manipulation" aria-label={t('infoAbout', { title: item.title })}>
                {item.poster_path ? (
                  <div className="relative w-16 aspect-[2/3] rounded-lg flex-shrink-0 overflow-hidden">
                    <Image
                      src={`https://image.tmdb.org/t/p/w200${item.poster_path}`}
                      alt={item.title}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-16 aspect-[2/3] rounded-lg bg-surface-2 flex-shrink-0" />
                )}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => setInfoItem(item)} className="font-medium leading-tight text-left touch-manipulation">
                      {item.title}
                    </button>
                    <button
                      onClick={() => (scope === 'shared' ? handleRemoveShared(item) : handleRemove(item))}
                      className="text-muted hover:text-coral transition-colors p-1 -mt-1 -mr-1 flex-shrink-0"
                      aria-label={tt('remove')}
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-muted mt-1">
                    {scope === 'shared' && <span>{item.addedByYou ? t('addedByYou') : t('addedByPartner')}</span>}
                    {scope === 'mine' && item.sourceMode && MODE_LABELS[item.sourceMode] && (
                      <span>{item.sourceMode === 'halloween' ? t('halloween') : th(MODE_LABELS[item.sourceMode])}</span>
                    )}
                    {item.watchOn && (
                      <>
                        {(scope === 'shared' || (item.sourceMode && MODE_LABELS[item.sourceMode])) && ' · '}
                        {item.watchUrl ? (
                          <a
                            href={item.watchUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:text-accent-hover transition-colors"
                          >
                            {item.watchOn}
                          </a>
                        ) : (
                          <span className="text-accent">{item.watchOn}</span>
                        )}
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap mt-3 pl-[76px]">
                <button
                  onClick={() => handleFavorite(item)}
                  className={`${chip(false, 'accent', 'sm')} flex items-center gap-1`}
                >
                  <StarIcon className="w-3 h-3" /> {tt('favorite')}
                </button>
                <button
                  onClick={() => handleRate(item, 'love')}
                  className={`${chip(false, 'accent', 'sm')} flex items-center gap-1`}
                >
                  <HeartIcon className="w-3 h-3" /> {tt('rateLove')}
                </button>
                <button
                  onClick={() => handleRate(item, 'ok')}
                  className={`${chip(false, 'teal', 'sm')} flex items-center gap-1`}
                >
                  <OkIcon className="w-3 h-3" /> {t('ok')}
                </button>
                <button
                  onClick={() => handleRate(item, 'dislike')}
                  className={`${chip(false, 'coral', 'sm')} flex items-center gap-1`}
                >
                  <DislikeIcon className="w-3 h-3" /> {tt('rateDislike')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {infoItem && (
        <TitleInfoSheet item={infoItem} onClose={() => setInfoItem(null)}>
          <div className="flex gap-1.5 flex-wrap mb-1">
            <button
              onClick={async () => {
                await handleFavorite(infoItem)
                setInfoItem(null)
              }}
              className={chip(false, 'accent', 'sm')}
            >
              {tt('favorite')}
            </button>
            {(['love', 'ok', 'dislike'] as const).map((rating) => (
              <button
                key={rating}
                onClick={async () => {
                  await handleRate(infoItem, rating)
                  setInfoItem(null)
                }}
                className={chip(false, rating === 'love' ? 'accent' : rating === 'ok' ? 'teal' : 'coral', 'sm')}
              >
                {rating === 'love' ? tt('rateLove') : rating === 'ok' ? t('ok') : tt('rateDislike')}
              </button>
            ))}
          </div>
        </TitleInfoSheet>
      )}

      <BottomNav />
    </>
  )
}
