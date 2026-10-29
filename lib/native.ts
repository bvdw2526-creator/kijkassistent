// Kleine brug naar de telefoon-app (Capacitor). In de Android- en iPhone-app zet Capacitor `window.Capacitor` op de
// pagina, met de plugins die in die app-versie zitten. Op de gewone website, of in een oudere app-versie zonder de
// plugin, valt alles netjes terug of gebeurt er niets.

type PushPermission = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied'

type PushPlugin = {
  checkPermissions: () => Promise<{ receive: PushPermission }>
  requestPermissions: () => Promise<{ receive: PushPermission }>
  register: () => Promise<void>
  addListener: (event: string, callback: (data: unknown) => void) => Promise<{ remove: () => Promise<void> }>
}

type CapacitorBridge = {
  isNativePlatform?: () => boolean
  isPluginAvailable?: (name: string) => boolean
  Plugins?: {
    Haptics?: { impact?: (options: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }) => Promise<void> }
    Share?: { share?: (options: { title?: string; text?: string; url?: string; dialogTitle?: string }) => Promise<unknown> }
    PushNotifications?: PushPlugin
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

// ---- Pushmeldingen (vanaf app 4.3.0, plugin @capacitor/push-notifications) ----

export type PushState = 'unavailable' | 'prompt' | 'granted' | 'denied'

function pushPlugin(): PushPlugin | null {
  return hasPlugin('PushNotifications') ? (bridge()?.Plugins?.PushNotifications ?? null) : null
}

/** 'android' of 'ios' in de app, anders null. */
export function appPlatform(): 'android' | 'ios' | null {
  if (typeof navigator === 'undefined') return null
  if (navigator.userAgent.includes('KijkassistentApp/Android')) return 'android'
  if (navigator.userAgent.includes('KijkassistentApp/iOS')) return 'ios'
  return null
}

/** Mag de app meldingen sturen? 'unavailable' op de website of in een app-versie zonder de plugin. */
export async function pushState(): Promise<PushState> {
  const plugin = pushPlugin()
  if (!plugin) return 'unavailable'
  try {
    const { receive } = await plugin.checkPermissions()
    return receive === 'granted' ? 'granted' : receive === 'denied' ? 'denied' : 'prompt'
  } catch {
    return 'unavailable'
  }
}

/** Vraagt de telefoon om toestemming en meldt de telefoon daarna aan (zie PushSetup voor wat er met het adres gebeurt). */
export async function enablePush(): Promise<PushState> {
  const plugin = pushPlugin()
  if (!plugin) return 'unavailable'
  try {
    const { receive } = await plugin.requestPermissions()
    if (receive !== 'granted') return receive === 'denied' ? 'denied' : 'prompt'
    await plugin.register()
    return 'granted'
  } catch {
    return 'unavailable'
  }
}

/** Meldt de telefoon opnieuw aan als er al toestemming is; Capacitor geeft het adres dan via 'registration'. */
export async function registerPushIfAllowed() {
  const plugin = pushPlugin()
  if (!plugin) return
  if ((await pushState()) === 'granted') await plugin.register().catch(() => {})
}

/** Luisteraars voor het adres en voor tikken op een melding. Eén keer aanroepen per pagina-lading. */
export function listenForPush(handlers: { onToken: (token: string) => void; onOpen: (url: string) => void }) {
  const plugin = pushPlugin()
  if (!plugin) return
  Promise.resolve(plugin.addListener('registration', (data) => {
    const value = (data as { value?: string })?.value
    if (value) handlers.onToken(value)
  })).catch(() => {})
  Promise.resolve(plugin.addListener('pushNotificationActionPerformed', (data) => {
    const url = (data as { notification?: { data?: { url?: unknown } } })?.notification?.data?.url
    if (typeof url === 'string' && url.startsWith('/')) handlers.onOpen(url)
  })).catch(() => {})
}

const TOKEN_KEY = 'kijkassistent:pushToken'

export function rememberPushToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Geen opslag: dan kunnen we het adres bij uitloggen niet afmelden; de server ruimt het later op.
  }
}

export function storedPushToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
