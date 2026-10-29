import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { serviceClient } from '@/lib/serviceClient'
import { pushConfigured } from '@/lib/push'
import { sendPartnerPushes } from '@/lib/pushJobs'

export const maxDuration = 20

// Na uitnodigen of accepteren (Instellingen en de uitnodigingspagina) roept de app dit aan. Wat er gemeld wordt, leest
// de server zelf uit de koppelingen van de ingelogde gebruiker; elke koppeling wordt per soort hooguit één keer gemeld.
export async function POST(request: NextRequest) {
  const guard = await guardRequest(request, 'push', LIMITS.push)
  if (!guard.ok) return guard.response
  if (!pushConfigured()) return NextResponse.json({ sent: 0 })
  try {
    const sent = await sendPartnerPushes(serviceClient(), guard.user.id)
    return NextResponse.json({ sent })
  } catch (err) {
    console.error('Partnermelding mislukt:', err)
    return NextResponse.json({ sent: 0 })
  }
}
