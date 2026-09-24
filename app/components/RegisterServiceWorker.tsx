'use client'

import { useEffect } from 'react'

// Registreert de minimale service worker (public/sw.js) die een "geen verbinding"-pagina toont.
// Alleen in productie: tijdens ontwikkelen zou een service worker het herladen in de weg zitten.
export default function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Geen service worker is geen probleem: de app werkt gewoon zonder offline-pagina.
    })
  }, [])
  return null
}
