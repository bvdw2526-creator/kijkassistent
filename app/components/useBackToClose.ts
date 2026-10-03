'use client'

import { useEffect, useRef } from 'react'

// Terugknop (Android) of terugveeg (iPhone) sluit eerst de open pop-up, in plaats van de pagina of de hele app te
// verlaten. Bij het openen komt er één extra regel in de browsergeschiedenis; "terug" haalt die weg en sluit de pop-up.
// Sluit je de pop-up met een knop, dan ruimen we die extra regel zelf weer op.
export function useBackToClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const marker = Math.random()
    // De bestaande state blijft behouden: Next.js bewaart daar zijn eigen routegegevens in.
    window.history.pushState({ ...window.history.state, kijkSheet: marker }, '', window.location.href)
    let closedByBack = false
    const onPop = () => {
      closedByBack = true
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (closedByBack) return
      // Even wachten: opent dezelfde pop-up meteen opnieuw (bv. een andere titel), dan is de regel al van een nieuwe pop-up.
      setTimeout(() => {
        if (window.history.state?.kijkSheet === marker) window.history.back()
      }, 0)
    }
  }, [open])
}
