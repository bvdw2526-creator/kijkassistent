export const btnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-full bg-[#E8A33D] text-[#171F2B] font-semibold px-5 py-3 shadow-[0_6px_18px_rgba(232,163,61,0.25)] hover:bg-[#F0B457] active:scale-[0.97] transition-all disabled:opacity-50 disabled:active:scale-100 touch-manipulation'

export const btnSecondary =
  'inline-flex items-center justify-center gap-1.5 rounded-full border border-[#2A3644] bg-[#1A2330] text-[#F2EFE9] font-medium px-5 py-3 hover:border-[#3d4c60] active:scale-[0.97] transition-all disabled:opacity-50 disabled:active:scale-100 touch-manipulation'

export const btnGhost =
  'inline-flex items-center justify-center gap-1.5 rounded-full text-[#93A3B5] font-medium px-4 py-2.5 hover:text-[#F2EFE9] hover:bg-white/5 active:scale-[0.97] transition-all touch-manipulation'

export const input =
  'w-full rounded-xl border border-[#2A3644] bg-[#1A2330] px-4 py-3.5 text-[#F2EFE9] placeholder:text-[#5E6D80] outline-none focus:border-[#E8A33D] focus:ring-4 focus:ring-[#E8A33D]/10 transition-all'

export const card = 'rounded-2xl border border-[#2A3644] bg-[#1A2330]'

export function chip(active: boolean, tone: 'accent' | 'teal' | 'coral' = 'accent', size: 'md' | 'sm' = 'md') {
  const tones = {
    accent: 'border-[#E8A33D] text-[#E8A33D] bg-[#E8A33D]/12',
    teal: 'border-[#52A9A0] text-[#52A9A0] bg-[#52A9A0]/12',
    coral: 'border-[#C97064] text-[#C97064] bg-[#C97064]/12',
  }
  const sizes = {
    md: 'px-3.5 py-2 text-sm',
    sm: 'px-2.5 py-1 text-xs',
  }
  return `rounded-full border font-medium transition-all active:scale-[0.96] touch-manipulation ${sizes[size]} ${
    active ? tones[tone] : 'border-[#2A3644] text-[#93A3B5] hover:border-[#3d4c60] hover:text-[#F2EFE9]'
  }`
}
