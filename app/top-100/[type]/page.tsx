import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { TOP_TYPES } from '@/lib/topLists'
import TopListPage from '../../components/TopListPage'

// De lijst wordt een dag hergebruikt en daarna op de achtergrond vernieuwd.
export const revalidate = 86400

type Params = { params: Promise<{ type: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { type } = await params
  const info = TOP_TYPES[type]
  if (!info) return {}
  return {
    title: `Top 100: de beste ${info.label} aller tijden`,
    description: `De best beoordeelde ${info.label}, gewogen op het oordeel van duizenden kijkers. Zie ook per streamingdienst wat je in Nederland kunt kijken.`,
  }
}

export default async function Page({ params }: Params) {
  const { type } = await params
  if (!TOP_TYPES[type]) notFound()
  return <TopListPage typeSlug={type} serviceSlug={null} />
}
