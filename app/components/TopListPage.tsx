import Link from 'next/link'
import { getTopList, TOP_TYPES, TOP_SERVICES, TOP_SIZE } from '@/lib/topLists'
import { withLatinTitles } from '@/lib/titleFallback'
import TopList from './TopList'
import LegalLinks from './LegalLinks'

// Gedeelde weergave voor alle lijsten onder /top-100 (server component; de lijst wordt een dag hergebruikt).
export default async function TopListPage({ typeSlug, serviceSlug }: { typeSlug: string; serviceSlug: string | null }) {
  const typeInfo = TOP_TYPES[typeSlug]
  const service = serviceSlug ? TOP_SERVICES[serviceSlug] : null
  const raw = await getTopList(typeInfo.type, service ? service.providerId : null)
  const items = await withLatinTitles(raw)

  const where = service ? ` op ${service.label}` : ''
  const heading = items.length >= TOP_SIZE ? `Top ${TOP_SIZE}: de beste ${typeInfo.label}${where}` : `De beste ${typeInfo.label}${where}`

  return (
    <main className="max-w-xl mx-auto px-5 py-10 leading-relaxed">
      <Link href="/top-100" className="text-sm text-[#93A3B5] hover:text-[#F2EFE9] transition-colors">
        ← Alle lijsten
      </Link>
      <h1 className="font-display text-3xl mt-4 mb-2">{heading}</h1>
      <p className="text-[#93A3B5] mb-6">
        {service
          ? `De best beoordeelde ${typeInfo.label} die je nu bij ${service.label} in Nederland kunt kijken (met een abonnement). `
          : `De best beoordeelde ${typeInfo.label}, ongeacht waar je ze kunt kijken. `}
        We rangschikken op het gewogen gebruikersoordeel van TMDB: een titel heeft veel stemmen nodig om hoog te komen, zodat
        pas uitgekomen titels niet bovenaan staan.
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-[#93A3B5]">De lijst kon niet worden opgehaald. Probeer het later opnieuw.</p>
      ) : (
        <TopList items={items} />
      )}

      <LegalLinks className="mt-12" />
    </main>
  )
}
