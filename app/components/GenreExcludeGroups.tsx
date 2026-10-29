'use client'
import { useTranslations } from 'next-intl'
import ExcludeChip from './ExcludeChip'

// TMDB heeft aparte genrelijsten voor films en series. Acht genres staan in allebei met
// hetzelfde id (bv. Drama = 18). Omdat excluded_genres één platte lijst ids is, geldt
// uitsluiten van zo'n genre altijd voor films én series. Daarom tonen we die maar één keer,
// anders lijken twee knoppen los te kiezen terwijl ze samen aan en uit gaan.
const BOTH = [16, 35, 80, 99, 18, 10751, 9648, 37]
const MOVIE_ONLY = [28, 12, 14, 36, 27, 10402, 10749, 878, 10770, 53, 10752]
const TV_ONLY = [10759, 10762, 10763, 10764, 10765, 10766, 10767, 10768]

export default function GenreExcludeGroups({
  excluded,
  onToggle,
}: {
  excluded: number[]
  onToggle: (id: number) => void
}) {
  const tg = useTranslations('genres')
  const groups = [
    { key: 'groupBoth', ids: BOTH },
    { key: 'groupMovieOnly', ids: MOVIE_ONLY },
    { key: 'groupTvOnly', ids: TV_ONLY },
  ] as const
  return (
    <>
      {groups.map((g) => (
        <div key={g.key} className="mb-5 last:mb-4">
          <h3 className="text-sm font-semibold text-accent mb-2">{tg(g.key)}</h3>
          <div className="flex flex-wrap gap-2">
            {g.ids.map((id) => (
              <ExcludeChip key={id} active={excluded.includes(id)} label={tg(`g${id}`)} onClick={() => onToggle(id)} />
            ))}
          </div>
        </div>
      ))}
    </>
  )
}
