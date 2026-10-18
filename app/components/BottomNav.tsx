'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { HomeIcon, SearchIcon, BookmarkIcon, ChartIcon, SettingsIcon } from './Icons'

// label = sleutel onder "nav" in messages/*.json.
const TABS = [
  { href: '/', label: 'forYou', icon: HomeIcon },
  { href: '/onboarding', label: 'search', icon: SearchIcon },
  { href: '/watchlist', label: 'watchlist', icon: BookmarkIcon },
  { href: '/profiel', label: 'stats', icon: ChartIcon },
  { href: '/settings', label: 'settings', icon: SettingsIcon },
]

export default function BottomNav() {
  const pathname = usePathname()
  const t = useTranslations('nav')

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 safe-bottom">
      <div className="mx-auto max-w-xl px-3 pb-3">
        <div className="flex items-center justify-around rounded-2xl border border-line bg-surface/90 backdrop-blur-xl px-1.5 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                onClick={(e) => {
                  // Nogmaals op een al-actieve tab tikken navigeert nergens heen (zelfde route),
                  // dus dan springen we terug naar boven — bv. de zoekbalk na het scrollen.
                  if (active) {
                    e.preventDefault()
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                }}
                className="relative flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 transition-colors touch-manipulation"
              >
                {active && (
                  <span className="absolute inset-0 rounded-xl bg-accent/10" aria-hidden />
                )}
                <Icon className={`relative w-5 h-5 transition-colors ${active ? 'text-accent' : 'text-muted'}`} />
                <span className={`relative text-[10.5px] font-medium tracking-tight transition-colors ${active ? 'text-accent' : 'text-muted'}`}>
                  {t(label)}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
