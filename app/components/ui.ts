export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-accent text-on-accent font-semibold px-5 py-3 shadow-[0_6px_18px_color-mix(in_srgb,var(--accent)_25%,transparent)] hover:bg-accent-hover active:scale-[0.97] transition-all disabled:opacity-50 disabled:active:scale-100 touch-manipulation'

export const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-line bg-surface text-foreground font-medium px-5 py-3 hover:border-line-strong active:scale-[0.97] transition-all disabled:opacity-50 disabled:active:scale-100 touch-manipulation'

export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 rounded-full text-muted font-medium px-4 py-2.5 hover:text-foreground hover:bg-white/5 active:scale-[0.97] transition-all touch-manipulation'

export const input =
  'w-full rounded-xl border border-line bg-surface px-4 py-3.5 text-foreground placeholder:text-faint outline-none focus:border-accent focus:ring-4 focus:ring-accent/10 transition-all'

export const card = 'rounded-2xl border border-line bg-surface'

// Een regel waarop je kunt tikken voor meer (Top 100, beoordelingen, namen bij Stats). Licht op bij aanraken en heeft
// rechts een pijltje: zie tapChevron en ChevronRightIcon.
export const tapRow =
  'w-full flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 text-left transition-colors hover:bg-white/5 active:bg-white/10 disabled:hover:bg-transparent disabled:active:bg-transparent touch-manipulation'

export const tapChevron = 'w-4 h-4 text-muted flex-shrink-0'

export function chip(active: boolean, tone: 'accent' | 'teal' | 'coral' = 'accent', size: 'md' | 'sm' = 'md') {
  const tones = {
    accent: 'border-accent text-accent bg-accent/12',
    teal: 'border-teal text-teal bg-teal/12',
    coral: 'border-coral text-coral bg-coral/12',
  }
  const sizes = {
    md: 'px-3.5 py-2 text-sm',
    sm: 'px-2.5 py-1 text-xs',
  }
  return `rounded-full border font-medium transition-all active:scale-[0.96] touch-manipulation ${sizes[size]} ${
    active ? tones[tone] : 'border-line text-muted hover:border-line-strong hover:text-foreground'
  }`
}
