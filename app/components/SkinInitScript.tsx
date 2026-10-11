'use client'

import { SKIN_INIT_SCRIPT } from '@/lib/skins'

// Zet de gekozen skin op <html> voordat de pagina getekend wordt, zodat de app niet eerst kort in de standaardkleuren
// verschijnt. Op de server is dit een gewoon script: de browser voert het uit tijdens het laden. Tekent React het
// daarna zelf nog eens (bij het ontwikkelen, na een wijziging), dan als gegevensblok: uitvoeren kan dan niet meer en
// is ook niet nodig, en zo blijft de waarschuwing van React over scripts in componenten weg.
export default function SkinInitScript() {
  return (
    <script
      type={typeof window === 'undefined' ? 'text/javascript' : 'text/plain'}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: SKIN_INIT_SCRIPT }}
    />
  )
}
