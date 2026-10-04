'use client'

import { btnPrimary, btnGhost } from './ui'

// Bevestiging voor "Verbergen". Legt uit dat dit geen beoordeling is, zodat niemand denkt dat het meetelt voor de smaak.
export default function HideTitleConfirm({ title, onConfirm, onCancel }: { title: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] px-6 animate-fade-in" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm bg-[#1A2330] border border-[#2A3644] rounded-3xl p-6 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-xl mb-2">Verbergen?</h2>
        <p className="text-sm text-[#F2EFE9]/90 leading-relaxed mb-2">
          <span className="font-semibold">{title}</span> verdwijnt uit je aanbevelingen.
        </p>
        <p className="text-sm text-[#93A3B5] leading-relaxed mb-5">
          Dit is geen beoordeling: het telt niet mee voor je smaak en verandert je aanbevelingen verder niet. Het geldt alleen
          voor jouw eigen lijsten, niet voor Samen. Terugzetten kan later via Instellingen.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onCancel} className={btnGhost}>
            Annuleren
          </button>
          <button onClick={onConfirm} className={btnPrimary}>
            Ok
          </button>
        </div>
      </div>
    </div>
  )
}
