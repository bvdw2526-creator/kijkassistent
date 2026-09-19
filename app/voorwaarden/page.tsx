import Link from 'next/link'

export const metadata = { title: 'Gebruiksvoorwaarden — Kijkassistent' }

const CONTACT = 'bob@vdwoude.net'

export default function Voorwaarden() {
  return (
    <main className="max-w-xl mx-auto px-5 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-[#93A3B5] hover:text-[#F2EFE9] transition-colors">← Terug</Link>
      <h1 className="font-display text-3xl mt-4 mb-2">Gebruiksvoorwaarden</h1>
      <p className="text-[#93A3B5] mb-8">Laatst bijgewerkt: 19 september 2026</p>

      <div className="text-sm text-[#F2EFE9]/90 space-y-5">
        <p>
          Kijkassistent geeft persoonlijke aanbevelingen voor films en series. Door een account te maken ga je
          akkoord met deze voorwaarden.
        </p>
        <p>
          <strong>Aanbevelingen zijn suggesties.</strong> Ze zijn automatisch berekend en kunnen ernaast zitten.
          Informatie over films, series en waar je ze kunt kijken komt van TMDB en JustWatch en kan onjuist of
          verouderd zijn. Controleer bij je streamingdienst of een titel echt beschikbaar is.
        </p>
        <p>
          <strong>Gebruik.</strong> Je bent zelf verantwoordelijk voor je account en wachtwoord. Gebruik de app niet
          om de dienst te verstoren of overmatig te belasten, bijvoorbeeld met geautomatiseerde aanvragen.
        </p>
        <p>
          <strong>Beschikbaarheid.</strong> We doen ons best de app beschikbaar te houden, maar geven daar geen
          garantie op. Functies kunnen veranderen of verdwijnen. De app wordt geleverd zoals hij is, en we zijn niet
          aansprakelijk voor schade door het gebruik ervan, voor zover de wet dat toestaat.
        </p>
        <p>
          <strong>Beëindigen.</strong> Je kunt je account op elk moment zelf verwijderen bij Instellingen. Bij
          misbruik kunnen we een account blokkeren.
        </p>
        <p>
          <strong>Privacy.</strong> Hoe we met je gegevens omgaan staat in de{' '}
          <Link href="/privacy" className="text-[#E8A33D]">privacyverklaring</Link>.
        </p>
        <p>
          <strong>Bronnen.</strong> Dit product gebruikt de TMDB API, maar wordt niet gesteund of gecertificeerd
          door TMDB. Streaminggegevens komen van JustWatch.
        </p>
        <p>
          <strong>Toepasselijk recht.</strong> Nederlands recht is van toepassing.
        </p>
        <p>
          Vragen? Mail naar <a href={`mailto:${CONTACT}`} className="text-[#E8A33D]">{CONTACT}</a>.
        </p>
      </div>
    </main>
  )
}
