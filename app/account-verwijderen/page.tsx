import Link from 'next/link'

export const metadata = { title: 'Account en gegevens verwijderen — Kijkassistent' }

const CONTACT = 'info@kijkassistent.nl'

// Openbaar bereikbaar zonder in te loggen: Google Play eist een webadres waar gebruikers kunnen
// lezen hoe ze hun account en gegevens laten verwijderen.
export default function AccountVerwijderen() {
  return (
    <main className="max-w-xl mx-auto px-5 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-muted hover:text-foreground transition-colors">← Terug</Link>
      <h1 className="font-display text-3xl mt-4 mb-2">Account en gegevens verwijderen</h1>
      <p className="text-muted mb-8">Voor gebruikers van Kijkassistent (app en website).</p>

      <Section title="Zelf verwijderen in de app">
        <ol className="list-decimal pl-5 space-y-1">
          <li>Log in bij Kijkassistent.</li>
          <li>Open <strong>Instellingen</strong> (rechts in de onderste balk).</li>
          <li>Scroll naar onderen en kies <strong>Account verwijderen</strong>.</li>
          <li>Bevestig met <strong>Ja, verwijder alles</strong>.</li>
        </ol>
        <p className="mt-3">
          Je account en alles wat naar jou leidt, worden direct en definitief gewist. Dit kan niet ongedaan worden
          gemaakt. Wat je van films en series vond, bewaren we alleen anoniem (zie hieronder).
        </p>
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
      </Section>

      <Section title="Wat we anoniem bewaren">
        <p>
          Om de aanbevelingen voor iedereen beter te maken, bewaren we vóór het wissen een anonieme kopie van je smaak:
          welke films en series je beoordeelde, als favoriet had, op je kijklijst had of verborg, je oordelen bij
          &quot;Samen&quot;, je favoriete acteurs en regisseurs, je streamingdiensten en je voorkeuren. Dat gebeurt onder een
          willekeurige code, zonder e-mailadres, account of partner, en met alleen de maand in plaats van de precieze
          datum. Het is daarna niet meer naar jou te herleiden, ook niet door ons.
        </p>
      </Section>

      <Section title="Kun je niet meer inloggen?">
        <p>
          Stuur dan een e-mail naar <a href={`mailto:${CONTACT}`} className="text-accent">{CONTACT}</a>, vanaf het
          e-mailadres waarmee je je hebt aangemeld, en vraag om verwijdering. We verwijderen je account en je gegevens
          binnen 30 dagen en laten het je weten als het gedaan is.
        </p>
      </Section>

      <Section title="Meer informatie">
        <p>
          Lees in onze <Link href="/privacy" className="text-accent">privacyverklaring</Link> welke gegevens we
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
      <div className="text-foreground/90 text-sm">{children}</div>
    </section>
  )
}
