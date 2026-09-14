type IconProps = { className?: string }

const common = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  viewBox: '0 0 24 24',
}

export function HomeIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 9.8V19a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.8" />
    </svg>
  )
}

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.3-4.3" />
    </svg>
  )
}

export function BookmarkIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M6.5 4h11a1 1 0 0 1 1 1v15l-6.5-4-6.5 4V5a1 1 0 0 1 1-1Z" />
    </svg>
  )
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 13.5a1.7 1.7 0 0 0 .35 1.9l.06.06a2.1 2.1 0 1 1-2.96 2.96l-.06-.06a1.7 1.7 0 0 0-1.9-.35 1.7 1.7 0 0 0-1.03 1.55V20a2.1 2.1 0 1 1-4.2 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.9.35l-.06.06a2.1 2.1 0 1 1-2.96-2.96l.06-.06a1.7 1.7 0 0 0 .35-1.9 1.7 1.7 0 0 0-1.55-1.04H4a2.1 2.1 0 1 1 0-4.2h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.35-1.9l-.06-.06a2.1 2.1 0 1 1 2.96-2.96l.06.06a1.7 1.7 0 0 0 1.9.35H10.3a1.7 1.7 0 0 0 1.04-1.55V4a2.1 2.1 0 1 1 4.2 0v.1a1.7 1.7 0 0 0 1.04 1.55 1.7 1.7 0 0 0 1.9-.35l.06-.06a2.1 2.1 0 1 1 2.96 2.96l-.06.06a1.7 1.7 0 0 0-.35 1.9V10.3a1.7 1.7 0 0 0 1.55 1.04H20a2.1 2.1 0 1 1 0 4.2h-.1a1.7 1.7 0 0 0-1.55 1.04Z" />
    </svg>
  )
}

export function HeartIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M12 20s-7.2-4.4-9.8-8.9C.7 8.1 2 4.8 5.2 4.1c2-.4 3.9.5 4.9 2.1.5.8.7 1.2.9 1.6.2-.4.4-.8.9-1.6 1-1.6 2.9-2.5 4.9-2.1 3.2.7 4.5 4 3 6.9C19.2 15.6 12 20 12 20Z" />
    </svg>
  )
}

export function OkIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.5h7" />
    </svg>
  )
}

export function DislikeIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6m0-6-6 6" />
    </svg>
  )
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </svg>
  )
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M4 7h16M9 7V4.8A.8.8 0 0 1 9.8 4h4.4a.8.8 0 0 1 .8.8V7m-8 0 .8 12a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9L18 7" />
    </svg>
  )
}

export function ChevronLeftIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="m14.5 6-6 6 6 6" />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

export function UsersIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.6-3 2.7-4.7 5.5-4.7s4.9 1.7 5.5 4.7" />
      <path d="M15.5 5.3a3 3 0 0 1 0 5.9M17.5 14.6c2.3.4 3.8 1.9 4.2 4.4" />
    </svg>
  )
}

export function LogoutIcon({ className }: IconProps) {
  return (
    <svg {...common} className={className}>
      <path d="M15.5 8V6.2A1.2 1.2 0 0 0 14.3 5H5.7a1.2 1.2 0 0 0-1.2 1.2v11.6A1.2 1.2 0 0 0 5.7 19h8.6a1.2 1.2 0 0 0 1.2-1.2V16" />
      <path d="M9.5 12H21m0 0-3-3m3 3-3 3" />
    </svg>
  )
}

export function StarIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.7 15 9l6.9.9-5 4.8 1.3 6.8L12 18.2 5.8 21.5l1.3-6.8-5-4.8L9 9Z" />
    </svg>
  )
}
