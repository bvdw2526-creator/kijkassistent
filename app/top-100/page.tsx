import Link from 'next/link'
import type { Metadata } from 'next'
import { TOP_TYPES, TOP_SERVICES } from '@/lib/topLists'
import LegalLinks from '../components/LegalLinks'
import { card } from '../components/ui'

export const metadata: Metadata = {
  title: 'De beste films en series per streamingdienst',
  description: 'De best beoordeelde films en series op Netflix, Videoland, Disney+, Amazon Prime Video en HBO Max in Nederland.',
}

export default function Top100Hub() {
  return (
    <main className="max-w-xl mx-auto px-5 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-[#93A3B5] hover:text-[#F2EFE9] transition-colors">
        ← Terug
      </Link>
      <h1 className="font-display text-3xl mt-4 mb-2">De beste films en series</h1>
      <p className="text-[#93A3B5] mb-8">
        De best beoordeelde titels, ook per streamingdienst in Nederland. Zo zie je meteen wat je kunt kijken met jouw abonnementen.
      </p>

      {Object.entries(TOP_TYPES).map(([typeSlug, typeInfo]) => (
        <section key={typeSlug} className="mb-8">
          <h2 className="font-display text-xl mb-3 capitalize">{typeInfo.label}</h2>
          <div className="flex flex-col gap-2">
            <Link href={`/top-100/${typeSlug}`} className={`${card} px-4 py-3 text-sm font-medium hover:border-[#3d4c60] transition-colors`}>
              De beste {typeInfo.label} (alle diensten)
            </Link>
            {Object.entries(TOP_SERVICES).map(([serviceSlug, service]) => (
              <Link
                key={serviceSlug}
                href={`/top-100/${typeSlug}/${serviceSlug}`}
                className={`${card} px-4 py-3 text-sm hover:border-[#3d4c60] transition-colors`}
              >
                De beste {typeInfo.label} op {service.label}
              </Link>
            ))}
          </div>
        </section>
      ))}

      <LegalLinks className="mt-12" />
    </main>
  )
}
