import { chip } from './ui'
import { CloseIcon } from './Icons'

// Knop voor een genre in de "uitsluiten"-lijsten. Aangevinkt = doorgestreept met een kruisje,
// zodat er niet aan te zien is als "geselecteerd omdat ik dit leuk vind".
export default function ExcludeChip({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button onClick={onClick} className={`${chip(active, 'coral')} inline-flex items-center gap-1.5`} aria-pressed={active}>
      {active && <CloseIcon className="w-3.5 h-3.5" />}
      <span className={active ? 'line-through decoration-[#C97064]/70' : ''}>{label}</span>
    </button>
  )
}
