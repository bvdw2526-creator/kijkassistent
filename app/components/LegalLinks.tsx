import Image from 'next/image'
import Link from 'next/link'

// Bronvermelding die TMDB (en voor de streamingdata JustWatch) verplicht stelt, plus de
// wettelijke pagina's — op één plek zodat inlog, registratie en instellingen hetzelfde tonen.
export default function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <footer className={`text-xs text-[#5E6D80] leading-relaxed text-center ${className}`}>
      <p>
        Dit product gebruikt de TMDB API, maar wordt niet gesteund of gecertificeerd door TMDB.
        Streaminggegevens via JustWatch.
      </p>
      {/* Het logo heeft een witte achtergrond, dus staat het in een lichte pil op het donkere thema. */}
      <a
        href="https://www.themoviedb.org"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block rounded-lg bg-white px-3 py-1.5 mt-3"
        aria-label="The Movie Database (TMDB)"
      >
        <Image src="/tmdb-logo.jpg" alt="TMDB" width={344} height={147} className="h-7 w-auto" />
      </a>
      <p className="mt-2">
        <Link href="/privacy" className="hover:text-[#93A3B5] underline underline-offset-2">Privacy</Link>
        {' · '}
        <Link href="/voorwaarden" className="hover:text-[#93A3B5] underline underline-offset-2">Voorwaarden</Link>
      </p>
    </footer>
  )
}
