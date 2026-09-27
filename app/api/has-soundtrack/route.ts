import { NextRequest, NextResponse } from 'next/server'
import { guardRequest, LIMITS } from '@/lib/apiGuard'
import { hasSoundtrack } from '@/lib/spotifyApi'

export async function GET(request: NextRequest) {
  const guard = await guardRequest(request, 'has-soundtrack', LIMITS.hasSoundtrack)
  if (!guard.ok) return guard.response

  const title = request.nextUrl.searchParams.get('title')?.slice(0, 200) || ''
  if (!title) return NextResponse.json({ hasSoundtrack: false })

  return NextResponse.json({ hasSoundtrack: await hasSoundtrack(title) })
}
