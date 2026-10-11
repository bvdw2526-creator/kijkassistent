'use client'

import { useEffect, useRef } from 'react'
import { SKINS } from '@/lib/skins'
import { useSkin } from '@/lib/useSkin'

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789'
// Grootte van één teken in pixels.
const CELL = 18
// Eén stap omlaag per 80 ms: rustig genoeg om niet af te leiden en licht voor een telefoon.
const STEP_MS = 80
// Zoveel stappen tekenen we vooruit voor wie bewegende beelden heeft uitgezet: een stilstaand beeld met staarten.
const STILL_STEPS = 70

const randomGlyph = () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]

// Vallende tekens over de breedte van het scherm. Elke kolom heeft één "druppel": het voorste teken is licht, de
// tekens erachter hebben de accentkleur en doven langzaam uit.
function CodeRain() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const styles = getComputedStyle(document.documentElement)
    const trailColor = styles.getPropertyValue('--accent').trim() || '#3BE06B'
    const headColor = styles.getPropertyValue('--foreground').trim() || '#D7F5DC'
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Per kolom de rij van de druppel en het teken dat daar staat; een negatieve rij is "nog boven het scherm".
    let drops: { row: number; glyph: string }[] = []
    let animation = 0
    let lastStep = 0

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = Math.floor(canvas!.clientWidth * ratio)
      canvas!.height = Math.floor(canvas!.clientHeight * ratio)
      ctx!.setTransform(ratio, 0, 0, ratio, 0, 0)
      ctx!.font = `${CELL - 3}px ui-monospace, Consolas, monospace`
      ctx!.textBaseline = 'top'
      const columns = Math.ceil(canvas!.clientWidth / CELL)
      drops = Array.from({ length: columns }, () => ({ row: -Math.floor(Math.random() * 40), glyph: randomGlyph() }))
      if (still) for (let i = 0; i < STILL_STEPS; i++) step()
    }

    function step() {
      const rows = canvas!.clientHeight / CELL
      // Alles wat er staat een beetje doorzichtiger maken: zo krijgt elke druppel een uitdovende staart.
      ctx!.globalCompositeOperation = 'destination-out'
      ctx!.fillStyle = 'rgba(0, 0, 0, 0.1)'
      ctx!.fillRect(0, 0, canvas!.clientWidth, canvas!.clientHeight)
      ctx!.globalCompositeOperation = 'source-over'

      drops.forEach((drop, column) => {
        const x = column * CELL
        // Het vorige voorste teken krijgt de staartkleur, het nieuwe teken eronder wordt het lichte voorste teken.
        if (drop.row >= 0) {
          ctx!.clearRect(x, drop.row * CELL, CELL, CELL)
          ctx!.fillStyle = trailColor
          ctx!.fillText(drop.glyph, x, drop.row * CELL)
        }
        drop.row += 1
        drop.glyph = randomGlyph()
        if (drop.row >= 0) {
          ctx!.fillStyle = headColor
          ctx!.fillText(drop.glyph, x, drop.row * CELL)
        }
        // Onderaan aangekomen: op een willekeurig moment opnieuw boven beginnen, zodat de kolommen niet gelijk lopen.
        if (drop.row > rows && Math.random() > 0.95) drop.row = -Math.floor(Math.random() * 20)
      })
    }

    function loop(time: number) {
      if (time - lastStep >= STEP_MS) {
        lastStep = time
        step()
      }
      animation = requestAnimationFrame(loop)
    }

    resize()
    window.addEventListener('resize', resize)
    // requestAnimationFrame staat vanzelf stil als het tabblad niet zichtbaar is.
    if (!still) animation = requestAnimationFrame(loop)
    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(animation)
    }
  }, [])

  // Achter alle inhoud, vast bovenaan het scherm, en naar onderen toe wegvagend zodat tekst leesbaar blijft.
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[75vh] w-full opacity-35 [mask-image:linear-gradient(to_bottom,black_25%,transparent)]"
    />
  )
}

// De bewegende achtergrond van de gekozen skin, als die er een heeft (zie lib/skins.ts). Staat in de layout, dus
// achter elke pagina.
export default function SkinBackdrop() {
  const skin = useSkin()
  const effect = SKINS.find((s) => s.id === skin)?.effect
  return effect === 'coderegen' ? <CodeRain /> : null
}
