'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HomeIcon, SearchIcon, BookmarkIcon, SettingsIcon } from './Icons'

const TABS = [
  { href: '/', label: 'Voor jou', icon: HomeIcon },
  { href: '/onboarding', label: 'Zoeken', icon: SearchIcon },
  { href: '/watchlist', label: 'Watchlist', icon: BookmarkIcon },
  { href: '/settings', label: 'Instellingen', icon: SettingsIcon },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 safe-bottom">
      <div className="mx-auto max-w-xl px-3 pb-3">
        <div className="flex items-center justify-around rounded-2xl border border-[#2A3644] bg-[#1A2330]/90 backdrop-blur-xl px-1.5 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className="relative flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-2 transition-colors touch-manipulation"
              >
                {active && (
                  <span className="absolute inset-0 rounded-xl bg-[#E8A33D]/10" aria-hidden />
                )}
                <Icon className={`relative w-5 h-5 transition-colors ${active ? 'text-[#E8A33D]' : 'text-[#93A3B5]'}`} />
                <span className={`relative text-[10.5px] font-medium tracking-tight transition-colors ${active ? 'text-[#E8A33D]' : 'text-[#93A3B5]'}`}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
