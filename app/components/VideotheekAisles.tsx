'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { OTHER_AISLE, aisleFor, type Aisle } from '@/lib/videotheek'
import type { VhsLabel } from './VhsCase'

type Shelved = { id: number; media_type: 'movie' | 'tv'; genre_ids?: number[] }

// Titels verdeeld over de gangpaden van de videotheek (zie lib/videotheek.ts), in de volgorde waarin ze binnenkomen: het
// gangpad van de eerste titel staat bovenaan, en binnen een gangpad blijft de volgorde staan. In de app (Videotheek-skin)
// zijn dat je aanbevelingen, de beste eerst; op de openbare pagina /videotheek komen ze al per gangpad op volgorde.
// `renderCard` krijgt de plek van de titel in de hele lijst mee, zodat het tellen van getoond en geopend in de app
// hetzelfde blijft als zonder skin, en het genre van het gangpad, voor op het videobandhoesje.
export default function VideotheekAisles<T extends Shelved>({
  items,
  renderCard,
  intro,
  minPerAisle = 1,
}: {
  items: T[]
  renderCard: (item: T, index: number, vhs: VhsLabel) => ReactNode
  // Tekst boven de gangpaden; zonder deze de uitleg voor je eigen advies. `null` = geen tekst.
  intro?: ReactNode
  // Gangpaden met minder doosjes dan dit gaan samen in één schap "Van alles", achteraan. In de app: met weinig advies
  // (bv. een nieuw account) staan er anders gangpaden met één doosje, en lege planken vallen in een winkel extra op.
  minPerAisle?: number
}) {
  const t = useTranslations('videotheek')
  const grouped: { aisle: Aisle; entries: { item: T; index: number }[] }[] = []
  items.forEach((item, index) => {
    const aisle = aisleFor(item.genre_ids)
    const existing = grouped.find((a) => a.aisle.id === aisle.id)
    if (existing) existing.entries.push({ item, index })
    else grouped.push({ aisle, entries: [{ item, index }] })
  })
  const full = grouped.filter((a) => a.aisle.id !== OTHER_AISLE.id && a.entries.length >= minPerAisle)
  const rest = grouped.filter((a) => !full.includes(a)).flatMap((a) => a.entries).sort((a, b) => a.index - b.index)
  const aisles = rest.length > 0 ? [...full, { aisle: OTHER_AISLE as Aisle, entries: rest }] : full

  return (
    <div className="animate-fade-in">
      {intro !== null && <p className="text-sm text-muted mb-4">{intro ?? t('intro')}</p>}
      {aisles.map(({ aisle, entries }) => {
        const label = t(`aisle_${aisle.id}`)
        const vhs: VhsLabel = { text: label, sign: aisle.sign, ink: aisle.ink }
        return (
          <section key={aisle.id} className="mb-8" aria-label={label}>
            {/* Twee draadjes waar het bord aan hangt. */}
            <div className="flex justify-center gap-28 h-3" aria-hidden="true">
              <span className="w-0.5 bg-line-strong" />
              <span className="w-0.5 bg-line-strong" />
            </div>
            <h2
              className="mx-auto w-fit min-w-[55%] -rotate-1 rounded-md border-[3px] border-[#F4F1E8] px-5 py-1.5 text-center font-display text-xl uppercase tracking-[0.16em] leading-tight"
              style={{ backgroundColor: aisle.sign, color: aisle.ink }}
            >
              {label}
            </h2>
            <p className="text-center text-[11px] text-faint mt-1.5">{t('count', { count: entries.length })}</p>
            <div className="-mx-5 mt-2">
              {/* Telefoon: één plank die je opzij schuift. Laptop: de doosjes lopen over meerdere rijen door, en elk doosje
                  staat op een eigen stukje plank zonder tussenruimte, zodat elke rij een doorlopende plank heeft. */}
              <div className="vt-shelf flex items-end gap-3 overflow-x-auto no-scrollbar px-5 pt-2 laptop:flex-wrap laptop:gap-x-0 laptop:gap-y-6 laptop:overflow-visible">
                {entries.map(({ item, index }) => (
                  <div
                    key={`${item.media_type}-${item.id}`}
                    className="grid w-32 flex-shrink-0 laptop:w-40 laptop:px-2 laptop:pb-0 laptop:border-b-[10px] laptop:border-[#8A5A2B]"
                  >
                    {renderCard(item, index, vhs)}
                  </div>
                ))}
              </div>
              {/* De plank (op laptop zit hij onder elk doosje, zie hierboven). */}
              <div className="mx-3 h-2.5 rounded-sm bg-[#8A5A2B] border-b-4 border-[#5C3A1A] laptop:hidden" aria-hidden="true" />
            </div>
          </section>
        )
      })}
    </div>
  )
}
