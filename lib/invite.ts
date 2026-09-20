const KEY = 'kijkassistent:pending-invite'

// Wie via een uitnodigingslink binnenkomt maar nog moet inloggen of registreren, komt na
// afloop weer bij die uitnodiging uit. Het token blijft daarvoor tijdelijk in de browser staan.
export function rememberInvite(token: string) {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    // Zonder opslag moet de gebruiker de link na het inloggen gewoon opnieuw openen.
  }
}

export function takePendingInvitePath(): string | null {
  try {
    const token = localStorage.getItem(KEY)
    if (!token) return null
    localStorage.removeItem(KEY)
    return `/uitnodiging/${encodeURIComponent(token)}`
  } catch {
    return null
  }
}
