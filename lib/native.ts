// Kleine brug naar de telefoon-app (Capacitor). In de Android- en iPhone-app zet Capacitor `window.Capacitor` op de
// pagina, met de plugins die in die app-versie zitten. Op de gewone website, of in een oudere app-versie zonder de
// plugin, valt alles netjes terug of gebeurt er niets.

type CapacitorBridge = {
  isNativePlatform?: () => boolean
  isPluginAvailable?: (name: string) => boolean
  Plugins?: {
    Haptics?: { impact?: (options: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }) => Promise<void> }
    Share?: { share?: (options: { title?: string; text?: string; url?: string; dialogTitle?: string }) => Promise<unknown> }
  }
}

function bridge(): CapacitorBridge | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { Capacitor?: CapacitorBridge }).Capacitor
}

function hasPlugin(name: string): boolean {
  const cap = bridge()
  return !!cap?.isNativePlatform?.() && !!cap.isPluginAvailable?.(name)
}

/** Een korte, lichte tik op de telefoon, bijvoorbeeld bij een beoordeling. Alleen in de app. */
export function tap() {
  if (!hasPlugin('Haptics')) return
  bridge()?.Plugins?.Haptics?.impact?.({ style: 'LIGHT' }).catch(() => {})
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * Deelt een tekst met link. In de app via het deelmenu van de telefoon, in de browser via het deelmenu van de browser
 * (als die dat kan) en anders door de tekst te kopiëren.
 */
export async function share(options: { title: string; text: string; url: string; dialogTitle?: string }): Promise<ShareResult> {
  if (hasPlugin('Share')) {
    try {
      await bridge()!.Plugins!.Share!.share!(options)
      return 'shared'
    } catch {
      // Sluit iemand het deelmenu zonder te kiezen, dan geeft de plugin ook een fout.
      return 'cancelled'
    }
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: options.title, text: options.text, url: options.url })
      return 'shared'
    } catch (e) {
      return e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : 'failed'
    }
  }
  try {
    await navigator.clipboard.writeText(`${options.text} ${options.url}`)
    return 'copied'
  } catch {
    return 'failed'
  }
}
