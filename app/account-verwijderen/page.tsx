import Link from 'next/link'

export const metadata = { title: 'Account en gegevens verwijderen — Kijkassistent' }

const CONTACT = 'bob@vdwoude.net'

// Openbaar bereikbaar zonder in te loggen: Google Play eist een webadres waar gebruikers kunnen
// lezen hoe ze hun account en gegevens laten verwijderen.
export default function AccountVerwijderen() {
  return (
    <main className="max-w-xl mx-auto px-5 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-[#93A3B5] hover:text-[#F2EFE9] transition-colors">← Terug</Link>
      <h1 className="font-display text-3xl mt-4 mb-2">Account en gegevens verwijderen</h1>
      <p className="text-[#93A3B5] mb-8">Voor gebruikers van Kijkassistent (app en website).</p>

      <Section title="Zelf verwijderen in de app">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Log in bij Kijkassistent.</li>
          <li>Open <strong>Instellingen</strong> (rechts in de onderste balk).</li>
          <li>Scroll naar onderen en kies <strong>Account verwijderen</strong>.</li>
          <li>Bevestig met <strong>Ja, verwijder alles</strong>.</li>
        </ol>
        <p className="mt-3">Je account en je gegevens worden direct en definitief gewist. Dit kan niet ongedaan worden gemaakt.</p>
      </Section>

      <Section title="Wat er wordt verwijderd">
        <ul className="list-disc pl-5 space-y-1">
          <li>Je account, met je e-mailadres en inloggegevens.</li>
          <li>Je favoriete films, series, acteurs en regisseurs.</li>
          <li>Je beoordelingen en je kijklijst.</li>
          <li>Je instellingen, zoals streamingdiensten en uitgesloten genres.</li>
          <li>Een eventuele koppeling met een partner en de gezamenlijke lijst en beoordelingen.</li>
          <li>Opgeslagen aanbevelingen die voor jou zijn berekend.</li>
        </ul>
        <p className="mt-3">Wat we niet bewaren, kunnen we ook niet verwijderen: er blijft niets van je account achter.</p>
      </Section>

      <Section title="Kun je niet meer inloggen?">
        <p>
          Stuur dan een e-mail naar <a href={`mailto:${CONTACT}`} className="text-[#E8A33D]">{CONTACT}</a>, vanaf het
          e-mailadres waarmee je je hebt aangemeld, en vraag om verwijdering. We verwijderen je account en je gegevens
          binnen 30 dagen en laten het je weten als het gedaan is.
        </p>
      </Section>

      <Section title="Meer informatie">
        <p>
          Lees in onze <Link href="/privacy" className="text-[#E8A33D]">privacyverklaring</Link> welke gegevens we
          bewaren en waarvoor.
        </p>
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
