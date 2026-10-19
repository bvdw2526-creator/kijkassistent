'use client'

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// Telt hoe vaak iemand die ingelogd is de app opent (tabel app_opens, zie 20261019_app_opens.sql), per dag en per soort:
// de Android-app, de geïnstalleerde versie (oude TWA of PWA) of de browser. Alleen voor het beheer-dashboard.
// Openen = de pagina laden, inloggen, of terugkomen nadat de app minstens een half uur op de achtergrond stond.
const AWAY_MS = 30 * 60 * 1000

function platform(): 'android_app' | 'installed' | 'web' {
  if (navigator.userAgent.includes('KijkassistentApp/Android')) return 'android_app'
  if (window.matchMedia('(display-mode: standalone)').matches) return 'installed'
  return 'web'
}

export default function AppOpenTracker() {
  useEffect(() => {
    let logged = false
    let hiddenAt: number | null = null

    const log = () => {
      logged = true
      supabase.rpc('log_app_open', { p_platform: platform() }).then(({ error }) => {
        if (error) console.warn('App-gebruik opslaan mislukt:', error.message)
      })
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session && !logged) log()
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && !logged) log()
      if (event === 'SIGNED_OUT') logged = false
    })

    const onVisibility = async () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= AWAY_MS) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) log()
      }
      hiddenAt = null
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  return null
}
