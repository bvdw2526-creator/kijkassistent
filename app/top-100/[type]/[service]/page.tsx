import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { TOP_TYPES, TOP_SERVICES } from '@/lib/topLists'
import TopListPage from '../../../components/TopListPage'

// De lijst wordt een dag hergebruikt en daarna op de achtergrond vernieuwd.
export const revalidate = 86400

type Params = { params: Promise<{ type: string; service: string }> }

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { type, service } = await params
  const info = TOP_TYPES[type]
  const provider = TOP_SERVICES[service]
  if (!info || !provider) return {}
  return {
    title: `De beste ${info.label} op ${provider.label}`,
    description: `De best beoordeelde ${info.label} die je nu bij ${provider.label} in Nederland kunt kijken, gewogen op het oordeel van duizenden kijkers.`,
  }
}

export default async function Page({ params }: Params) {
  const { type, service } = await params
  if (!TOP_TYPES[type] || !TOP_SERVICES[service]) notFound()
  return <TopListPage typeSlug={type} serviceSlug={service} />
}
