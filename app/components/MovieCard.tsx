import Image from 'next/image'
import { UsersIcon } from './Icons'

type MovieCardMovie = {
  id: number
  title: string
  poster_path: string | null
  matchPercent?: number
  watchOn?: string | null
  release_date?: string
}

export default function MovieCard({
  movie,
  onClick,
  badge,
  priority,
  upcomingLabel,
  isNew,
  alsoSamen,
  hideMatch,
}: {
  movie: MovieCardMovie
  onClick: () => void
  badge?: string
  priority?: boolean
  // Titel die nog moet uitkomen: dit label (bv. "Binnenkort · 29 okt.") komt in plaats van het matchpercentage.
  upcomingLabel?: string
  // Titel die er sinds je vorige bezoek bij is gekomen (zie lib/newTitles.ts).
  isNew?: boolean
  // Dezelfde titel staat ook in jullie Samen-lijst: dan kun je kiezen of je hem alleen of samen kijkt.
  alsoSamen?: boolean
  // Geen matchpercentage tonen (bij Verras me: daar gaat het om ontdekken, en het percentage zou er laag en ontmoedigend
  // uitvallen).
  hideMatch?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left touch-manipulation active:scale-[0.97] transition-transform"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-[#2A3644] bg-[#212C3B] shadow-[0_4px_14px_rgba(0,0,0,0.3)]">
        {movie.poster_path ? (
          <Image
            src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
            alt={movie.title}
            fill
            sizes="(min-width: 640px) 33vw, 50vw"
            priority={priority}
            className="object-cover transition-transform duration-300 group-active:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-3 text-center">
            <span className="font-display text-sm text-[#5E6D80]">{movie.title}</span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

        {upcomingLabel && (
          <span className="absolute top-2 left-2 rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5 text-[11px] font-semibold text-[#52A9A0] ring-1 ring-[#52A9A0]/40">
            {upcomingLabel}
          </span>
        )}

        {!upcomingLabel && !hideMatch && typeof movie.matchPercent === 'number' && (
          <span className="absolute top-2 left-2 rounded-full bg-black/55 backdrop-blur-sm px-2 py-0.5 text-[11px] font-semibold text-[#E8A33D] ring-1 ring-white/10">
            {movie.matchPercent}%
          </span>
        )}

        {(isNew || alsoSamen) && !badge && (
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
            {isNew && (
              <span className="rounded-full bg-[#52A9A0]/90 px-2 py-0.5 text-[10px] font-semibold text-[#10151C]">Nieuw</span>
            )}
            {alsoSamen && (
              <span
                className="flex items-center gap-1 rounded-full bg-black/60 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold text-[#E8A33D] ring-1 ring-[#E8A33D]/40"
                title="Staat ook bij Samen"
              >
                <UsersIcon className="w-3 h-3" />
                Samen
              </span>
            )}
          </div>
        )}

        {badge && (
          <span className="absolute top-2 right-2 rounded-full bg-black/55 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-[#93A3B5] ring-1 ring-white/10">
            {badge}
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="text-[13px] font-semibold leading-tight text-white line-clamp-2">{movie.title}</p>
          {!upcomingLabel && movie.release_date && (
            <p className="mt-0.5 text-[11px] font-medium text-white/65">{movie.release_date.slice(0, 4)}</p>
          )}
          {movie.watchOn && (
            <p className="mt-0.5 text-[11px] font-medium text-[#E8A33D]/90 truncate">{movie.watchOn}</p>
          )}
        </div>
      </div>
    </button>
  )
}
