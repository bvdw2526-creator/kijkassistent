'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronLeftIcon } from './Icons'

// Een rij die zijwaarts scrolt, met pijltjes op apparaten met een muis (op een pc scrolt het muiswiel niet zijwaarts en
// kun je niet vegen). Op telefoons en tablets veeg je gewoon; daar blijven de pijltjes weg. Zelfde opzet als de rij in
// app/components/HalloweenRow.tsx. contentKey: verandert als de titels veranderen, zodat de pijltjes opnieuw kloppen.
export default function ScrollRow({
  children,
  contentKey,
  className = '',
}: {
  children: React.ReactNode
  contentKey: string
  className?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState({ left: false, right: false })
  const t = useTranslations('title')

  function updateMore() {
    const el = scroller.current
    if (!el) return
    const next = { left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 }
    setMore((current) => (current.left === next.left && current.right === next.right ? current : next))
  }

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(updateMore)
    observer.observe(el)
    updateMore()
    return () => observer.disconnect()
  }, [contentKey])

  function scrollBy(direction: 1 | -1) {
    const el = scroller.current
    el?.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  const arrow =
    'absolute top-1/2 -translate-y-1/2 z-10 hidden [@media(pointer:fine)]:flex h-9 w-9 items-center justify-center rounded-full border border-line bg-background/85 text-foreground shadow-lg hover:border-accent hover:text-accent transition-colors'

  return (
    <div className="relative">
      {more.left && (
        <button onClick={() => scrollBy(-1)} aria-label={t('scrollPrev')} className={`${arrow} left-0`}>
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
      )}
      {more.right && (
        <button onClick={() => scrollBy(1)} aria-label={t('scrollNext')} className={`${arrow} right-0`}>
          <ChevronLeftIcon className="w-4 h-4 rotate-180" />
        </button>
      )}
      <div ref={scroller} onScroll={updateMore} className={className}>
        {children}
      </div>
    </div>
  )
}
