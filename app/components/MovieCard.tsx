type MovieCardMovie = {
  id: number
  title: string
  poster_path: string | null
  matchPercent?: number
  watchOn?: string | null
}

export default function MovieCard({
  movie,
  onClick,
  badge,
}: {
  movie: MovieCardMovie
  onClick: () => void
  badge?: string
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left touch-manipulation active:scale-[0.97] transition-transform"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl border border-[#2A3644] bg-[#212C3B] shadow-[0_4px_14px_rgba(0,0,0,0.3)]">
        {movie.poster_path ? (
          <img
            src={`https://image.tmdb.org/t/p/w342${movie.poster_path}`}
            alt={movie.title}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-active:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-3 text-center">
            <span className="font-display text-sm text-[#5E6D80]">{movie.title}</span>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />

        {typeof movie.matchPercent === 'number' && (
          <span className="absolute top-2 left-2 rounded-full bg-black/55 backdrop-blur-sm px-2 py-0.5 text-[11px] font-semibold text-[#E8A33D] ring-1 ring-white/10">
            {movie.matchPercent}%
          </span>
        )}

        {badge && (
          <span className="absolute top-2 right-2 rounded-full bg-black/55 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-[#93A3B5] ring-1 ring-white/10">
            {badge}
          </span>
        )}

        <div className="absolute inset-x-0 bottom-0 p-2.5">
          <p className="text-[13px] font-semibold leading-tight text-white line-clamp-2">{movie.title}</p>
          {movie.watchOn && (
            <p className="mt-0.5 text-[11px] font-medium text-[#E8A33D]/90 truncate">{movie.watchOn}</p>
          )}
        </div>
      </div>
    </button>
  )
}
