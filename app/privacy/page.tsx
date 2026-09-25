import Link from 'next/link'

export const metadata = { title: 'Privacyverklaring — Kijkassistent' }

const CONTACT = 'bob@vdwoude.net'

export default function Privacy() {
  return (
    <main className="max-w-xl mx-auto px-5 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-[#93A3B5] hover:text-[#F2EFE9] transition-colors">← Terug</Link>
      <h1 className="font-display text-3xl mt-4 mb-2">Privacyverklaring</h1>
      <p className="text-[#93A3B5] mb-8">Laatst bijgewerkt: 24 september 2026</p>

      <Section title="Wie zijn wij">
        <p>
          Kijkassistent is een app die persoonlijke film- en serie-aanbevelingen geeft. De verantwoordelijke voor
          jouw gegevens is B. vd Woude, beheerder van Kijkassistent, te bereiken via{' '}
          <a href={`mailto:${CONTACT}`} className="text-[#E8A33D]">{CONTACT}</a>.
        </p>
      </Section>

      <Section title="Welke gegevens we bewaren">
        <ul className="list-disc pl-5 space-y-1">
          <li>Je e-mailadres en wachtwoord (het wachtwoord wordt versleuteld opgeslagen en is voor ons niet leesbaar).</li>
          <li>Je streamingdiensten en de genres die je hebt uitgesloten.</li>
          <li>Je favoriete films, series, acteurs en regisseurs, je beoordelingen en je kijklijst.</li>
          <li>
            Als je een partner koppelt: de koppeling zelf (jouw partner ziet jouw e-mailadres in de uitnodiging) en de
            gezamenlijke beoordelingen voor &quot;Samen&quot;.
          </li>
          <li>Tijdelijk opgeslagen aanbevelingen, zodat de app snel laadt, en welke tip van de week je hebt gekregen.</li>
          <li>
            Als je je Letterboxd-export importeert: het bestand wordt alleen in je eigen browser gelezen en niet naar ons
            gestuurd. Alleen de films en beoordelingen die je zelf kiest te importeren worden opgeslagen, net als
            alles wat je zelf toevoegt.
          </li>
        </ul>
        <p className="mt-3">
          We gebruiken geen advertenties, geen tracking en geen analysetools. We verkopen geen gegevens.
        </p>
      </Section>

      <Section title="Waarvoor we ze gebruiken">
        <p>
          Uitsluitend om de app te laten werken: inloggen, je smaakprofiel opbouwen en aanbevelingen berekenen. De
          grondslag is de overeenkomst die je met ons sluit door een account te maken.
        </p>
      </Section>

      <Section title="Met wie we gegevens delen">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Supabase</strong> — database en inloggen. De gegevens staan op servers in de EU (Ierland).
          </li>
          <li><strong>Vercel</strong> — hosting van de app.</li>
          <li>
            <strong>TMDB</strong> — voor titelgegevens en zoekopdrachten. Je zoektermen worden doorgestuurd, maar niet
            gekoppeld aan jouw naam of e-mailadres.
          </li>
          <li>
            <strong>Voyage AI</strong> — om samenvattingen van films en series te vergelijken. Er worden geen
            persoonsgegevens meegestuurd.
          </li>
        </ul>
        <p className="mt-3">Met partijen buiten de EU gelden de standaardcontractbepalingen die de AVG voorschrijft.</p>
      </Section>

      <Section title="Cookies en lokale opslag">
        <p>
          We gebruiken alleen wat nodig is: je inlogsessie en een kopie van je laatste aanbevelingen in de opslag van
          je browser. Daarom is er geen cookiebanner.
        </p>
      </Section>

      <Section title="Hoe lang we gegevens bewaren">
        <p>Zolang je een account hebt. Verwijder je je account, dan wissen we al je gegevens direct en volledig.</p>
      </Section>

      <Section title="Jouw rechten">
        <p>
          Je mag vragen om inzage in, correctie van of verwijdering van je gegevens, en bezwaar maken tegen het
          gebruik ervan. Je account en alle gegevens verwijderen kan zelf bij{' '}
          <Link href="/settings" className="text-[#E8A33D]">Instellingen</Link> onder &quot;Account verwijderen&quot; (zie ook{' '}
          <Link href="/account-verwijderen" className="text-[#E8A33D]">hoe je je account verwijdert</Link>). Voor
          andere verzoeken mail je naar <a href={`mailto:${CONTACT}`} className="text-[#E8A33D]">{CONTACT}</a>; we
          reageren binnen 30 dagen. Ben je niet tevreden, dan kun je een klacht indienen bij de Autoriteit
          Persoonsgegevens.
        </p>
      </Section>

      <Section title="Leeftijd">
        <p>De app is niet bedoeld voor kinderen jonger dan 16 jaar.</p>
      </Section>

      <Section title="Wijzigingen">
        <p>Passen we deze verklaring aan, dan zie je dat aan de datum bovenaan.</p>
      </Section>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="font-display text-xl mb-2">{title}</h2>
      <div className="text-[#F2EFE9]/90 text-sm">{children}</div>
    </section>
  )
}
