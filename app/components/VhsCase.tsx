import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { UsersIcon } from './Icons'

// Het genre van het gangpad waar het doosje in staat (zie app/components/VideotheekAisles.tsx).
export type VhsLabel = { text: string; sign: string; ink: string }

// Een aanbeveling als videobandhoesje, voor de Videotheek-skin. De poster zelf blijft onbewerkt (TMDB-voorwaarden: geen
// afgeleide werken); het hoesje, de rug, de glans en de stickers liggen eromheen en eroverheen.
// Dezelfde gegevens en hetzelfde tellen als de gewone kaart: MovieCard geeft alles door.
export default function VhsCase({
  movie,
  vhs,
  onClick,
  priority,
  upcomingLabel,
  isNew,
  isRecent,
  alsoSamen,
  hideMatch,
  seenRef,
  seenKey,
  rating,
  rank,
}: {
  movie: { title: string; poster_path: string | null; matchPercent?: number; watchOn?: string | null; release_date?: string }
  vhs: VhsLabel
  onClick: () => void
  priority?: boolean
  upcomingLabel?: string
  isNew?: boolean
  isRecent?: boolean
  alsoSamen?: boolean
  hideMatch?: boolean
  seenRef?: (el: HTMLElement | null) => void | (() => void)
  seenKey?: string
  // Waardering van TMDB (0–10), op de plek van het matchpercentage: op de openbare videotheek, waar we je smaak niet kennen.
  rating?: number
  // Plek in de Top 10 van een gangpad (openbare videotheek): een groot cijfer linksonder op de hoes.
  rank?: number
}) {
  const t = useTranslations('title')
  const tv = useTranslations('videotheek')
  const locale = useLocale()
  const year = movie.release_date?.slice(0, 4)
  const showMatch = !upcomingLabel && !hideMatch && typeof movie.matchPercent === 'number'
  const showRating = !showMatch && !upcomingLabel && typeof rating === 'number' && rating > 0
  return (
    <button
      ref={seenRef}
      data-seen-key={seenKey}
      onClick={onClick}
      aria-label={movie.title}
      className="group relative block w-full text-left touch-manipulation active:scale-[0.97] transition-transform"
    >
      {/* Het plastic doosje, met links de rug. */}
      <div className="relative rounded-[3px] border border-white/10 bg-[#111214] pt-[5px] pr-[5px] pb-[6px] pl-[17px] shadow-[0_6px_14px_rgba(0,0,0,0.45)]">
        <div className="absolute inset-y-0 left-0 flex w-[14px] items-center justify-center overflow-hidden border-r border-white/10 bg-[#0B0B0C]" aria-hidden="true">
          <span className="whitespace-nowrap font-display text-[9px] uppercase tracking-[0.08em] text-[#D3D1C7] [transform:rotate(180deg)] [writing-mode:vertical-rl]">
            {movie.title}
            {year ? ` · ${year}` : ''}
          </span>
        </div>

        {/* De balk boven de poster: "VIDEO" en het genre in de kleur van het gangpad. */}
        <div className="mb-1 flex items-center justify-between gap-1 bg-[#F4F1E8] px-1.5 py-[2px]" aria-hidden="true">
          <span className="font-display text-[12px] leading-none tracking-[0.14em] text-[#111]">{tv('video')}</span>
          <span
            className="truncate rounded-[2px] px-1 py-[1px] text-[9px] font-semibold uppercase leading-none"
            style={{ backgroundColor: vhs.sign, color: vhs.ink }}
          >
            {vhs.text}
          </span>
        </div>

        <div className="relative aspect-[2/3] w-full overflow-hidden bg-surface-2">
          {movie.poster_path ? (
            <Image
              src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
              alt={movie.title}
              fill
              sizes="(min-width: 1280px) 160px, 128px"
              priority={priority}
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-3 text-center">
              <span className="font-display text-sm text-faint">{movie.title}</span>
            </div>
          )}
          {/* Glans van het plastic hoesje. */}
          <div className="pointer-events-none absolute -left-[60%] -top-[20%] h-[150%] w-[45%] rotate-[25deg] bg-white/10" aria-hidden="true" />
        </div>

        {/* Een krasje op de rand. */}
        <div className="pointer-events-none absolute left-[20px] top-[45%] h-px w-2 rotate-[40deg] bg-white/20" aria-hidden="true" />
      </div>

      {/* Stickers. */}
      {typeof rank === 'number' && (
        <span
          className="absolute left-[11px] top-[22px] flex h-9 min-w-9 -rotate-[8deg] items-center justify-center rounded-[3px] border-2 border-[#111214] bg-[#F4F1E8] px-1 font-display text-2xl leading-none text-[#111214]"
          aria-label={tv('rankLabel', { rank })}
        >
          {rank}
        </span>
      )}
      {showMatch && (
        <span className="absolute -right-1.5 top-8 flex h-9 w-9 rotate-[10deg] items-center justify-center rounded-full border-2 border-[#F4F1E8] bg-coral text-[11px] font-bold text-[#3A0610]">
          {movie.matchPercent}%
        </span>
      )}
      {showRating && (
        <span
          className="absolute -right-1.5 top-8 flex h-9 w-9 rotate-[10deg] flex-col items-center justify-center rounded-full border-2 border-[#F4F1E8] bg-coral text-[11px] font-bold leading-none text-[#3A0610]"
          aria-label={tv('ratingLabel', { rating: rating.toLocaleString(locale === 'en' ? 'en-GB' : 'nl-NL') })}
        >
          <span aria-hidden="true" className="text-[8px]">★</span>
          {rating.toLocaleString(locale === 'en' ? 'en-GB' : 'nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
        </span>
      )}
      {upcomingLabel && (
        <span className="absolute -right-1.5 top-8 max-w-[85%] rotate-[6deg] bg-teal px-1.5 py-0.5 text-[10px] font-bold leading-tight text-[#06262C]">
          {upcomingLabel}
        </span>
      )}
      {movie.watchOn && (
        <span className="vt-price absolute -right-1.5 bottom-6 max-w-[80%] -rotate-[6deg] truncate bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.03em] text-on-accent">
          {movie.watchOn}
        </span>
      )}
      {(isNew || isRecent || alsoSamen) && (
        <span className="absolute bottom-2 left-5 flex rotate-[3deg] gap-1">
          {(isRecent || isNew) && (
            <span className="bg-teal px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#06262C]">{isRecent ? t('new') : t('added')}</span>
          )}
          {alsoSamen && (
            <span className="flex items-center gap-1 bg-[#F4F1E8] px-1.5 py-0.5 text-[10px] font-bold text-[#1D2446]" title={t('alsoTogether')}>
              <UsersIcon className="h-3 w-3" />
              {t('together')}
            </span>
          )}
        </span>
      )}
    </button>
  )
}
