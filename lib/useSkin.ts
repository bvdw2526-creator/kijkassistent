'use client'

import { useSyncExternalStore } from 'react'
import { DEFAULT_SKIN, SKIN_BANNER_DISMISSED_KEY, SKIN_STORAGE_KEY, isSkinId, type SkinId } from './skins'

const SKIN_CHANGED_EVENT = 'kijkassistent:skin-gewijzigd'

function readSkin(): SkinId {
  try {
    const stored = localStorage.getItem(SKIN_STORAGE_KEY)
    return isSkinId(stored) ? stored : DEFAULT_SKIN
  } catch {
    // Geen toegang tot localStorage (bv. privévenster met geblokkeerde opslag): dan de standaardkleuren.
    return DEFAULT_SKIN
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(SKIN_CHANGED_EVENT, onChange)
  // Ook een wijziging in een ander tabblad overnemen.
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(SKIN_CHANGED_EVENT, onChange)
    window.removeEventListener('storage', onChange)
  }
}

// De gekozen skin, en opnieuw tekenen zodra hij wijzigt. Op de server is het altijd de standaardskin; het wisselen
// van de kleuren zelf gebeurt al eerder via het data-skin-attribuut (zie SKIN_INIT_SCRIPT in lib/skins.ts).
export function useSkin(): SkinId {
  return useSyncExternalStore(subscribe, readSkin, () => DEFAULT_SKIN)
}

export function setSkin(id: SkinId) {
  try {
    if (id === DEFAULT_SKIN) localStorage.removeItem(SKIN_STORAGE_KEY)
    else localStorage.setItem(SKIN_STORAGE_KEY, id)
    // Een skin kiezen brengt een weggeklikte banner terug.
    localStorage.removeItem(SKIN_BANNER_DISMISSED_KEY)
  } catch {
    // Opslaan lukt niet: de skin geldt dan alleen tot de pagina opnieuw laadt.
  }
  if (id === DEFAULT_SKIN) delete document.documentElement.dataset.skin
  else document.documentElement.dataset.skin = id
  window.dispatchEvent(new Event(SKIN_CHANGED_EVENT))
}
