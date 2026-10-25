import Link from 'next/link'
import { getLocale } from 'next-intl/server'

export async function generateMetadata() {
  return { title: (await getLocale()) === 'en' ? 'Privacy statement — Kijkassistent' : 'Privacyverklaring — Kijkassistent' }
}

const CONTACT = 'info@kijkassistent.nl'

// De Nederlandse tekst is leidend; voor de Engelse app staat er een vertaling naast (PrivacyEn hieronder).
export default async function Privacy() {
  if ((await getLocale()) === 'en') return <PrivacyEn />
  return (
    <main className="max-w-xl mx-auto px-5 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-muted hover:text-foreground transition-colors">← Terug</Link>
      <h1 className="font-display text-3xl mt-4 mb-2">Privacyverklaring</h1>
      <p className="text-muted mb-8">Laatst bijgewerkt: 25 oktober 2026</p>

      <Section title="Wie zijn wij">
        <p>
          Kijkassistent is een app die persoonlijke film- en serie-aanbevelingen geeft. De verantwoordelijke voor
          jouw gegevens is B. vd Woude, beheerder van Kijkassistent, te bereiken via{' '}
          <a href={`mailto:${CONTACT}`} className="text-accent">{CONTACT}</a>.
        </p>
      </Section>

      <Section title="Welke gegevens we bewaren">
        <ul className="list-disc pl-5 space-y-1">
          <li>Je e-mailadres en wachtwoord (het wachtwoord wordt versleuteld opgeslagen en is voor ons niet leesbaar).</li>
          <li>Je streamingdiensten en de genres die je hebt uitgesloten.</li>
          <li>Je favoriete films, series, acteurs en regisseurs, je beoordelingen en je kijklijst.</li>
          <li>
            Als je vanaf het tabblad &quot;Voor jou&quot; een titel beoordeelt, als favoriet markeert of op je kijklijst zet, bewaren
            we ook in welk tabblad je de titel zag en waarom hij werd aanbevolen. Beoordeel je hem later vanaf je kijklijst,
            dan gaat dat mee. Zo kunnen we meten hoe goed de aanbevelingen passen en ze verbeteren. Dit zien alleen wij,
            zonder je naam of e-mailadres.
          </li>
          <li>
            Welke aanbevelingen op &quot;Voor jou&quot; in beeld kwamen en welke je opende (titel, tabblad, plek in de lijst en
            percentage), en welke titels je zonder beoordeling van je kijklijst haalde. Zo kunnen we meten hoeveel van wat
            we laten zien echt bij je past. Dit zien alleen wij, zonder je naam of e-mailadres, en we bewaren het
            hooguit 18 maanden. Daarna houden we alleen anonieme totalen per maand over (bijvoorbeeld &quot;deze film
            werd in maart 40 keer getoond en 12 keer gekozen&quot;), waarin niet meer te zien is wie wat deed.
          </li>
          <li>
            Als je een partner koppelt: de koppeling zelf (jouw partner ziet jouw e-mailadres in de uitnodiging) en de
            gezamenlijke beoordelingen voor &quot;Samen&quot;.
          </li>
          <li>Tijdelijk opgeslagen aanbevelingen, zodat de app snel laadt, en welke tip van de week je hebt gekregen.</li>
          <li>
            Hoe vaak je Kijkassistent per dag opent en waarmee: de Android-app, de op je startscherm geïnstalleerde versie
            of de browser. Zo zien we of de app goed gebruikt wordt. Dit zien alleen wij, zonder je naam of e-mailadres,
            en we bewaren het hooguit 18 maanden.
          </li>
          <li>
            Als je je Letterboxd-export importeert: het bestand wordt alleen in je eigen browser gelezen en niet naar ons
            gestuurd. Alleen de films en beoordelingen die je zelf kiest te importeren worden opgeslagen, net als
            alles wat je zelf toevoegt.
          </li>
        </ul>
        <p className="mt-3">
          We gebruiken geen advertenties, geen tracking via andere partijen en geen analysetools van derden. Wat we
          meten, meten we zelf en alleen binnen de app. We verkopen geen gegevens.
        </p>
      </Section>

      <Section title="Waarvoor we ze gebruiken">
        <p>
          Uitsluitend om de app te laten werken en te verbeteren: inloggen, je smaakprofiel opbouwen, aanbevelingen
          berekenen en meten hoe goed die passen. De grondslag is de overeenkomst die je met ons sluit door een account
          te maken.
        </p>
        <p className="mt-3">
          Je e-mailadres gebruiken we ook voor een wekelijkse mail met een paar persoonlijke tips. Die staat standaard
          aan; afmelden kan met één klik onderaan elke mail, of bij{' '}
          <Link href="/settings" className="text-accent">Instellingen</Link>. Beoordeel je een titel of zet je hem op
          je kijklijst via een knop in die mail, dan bewaren we dat zoals in de app, met als herkomst &quot;mail&quot;. We
          zien niet of je de mail opent.
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
          We gebruiken alleen wat nodig is: je inlogsessie, een kopie van je laatste aanbevelingen en het uiterlijk
          (de skin) dat je hebt gekozen, in de opslag van je browser, en een cookie met de taal die je hebt gekozen
          (Nederlands of Engels). Daarom is er geen cookiebanner.
        </p>
        <p className="mt-3">
          In de videotheek (kijkassistent.nl/videotheek, ook zonder account) onthoudt je browser welke diensten je
          aantikte. We tellen per dag hoeveel bezoekers er komen, hoeveel er een doosje omdraaien en hoeveel er op
          &quot;account maken&quot; tikken. Daarvoor onthoudt je browser alleen welke van die stappen vandaag al zijn geteld.
          We bewaren alleen de aantallen per dag: geen IP-adres, geen account en niets wat naar jou te herleiden is.
        </p>
      </Section>

      <Section title="Hoe lang we gegevens bewaren">
        <p>
          Zolang je een account hebt; wat er in beeld kwam en wat je opende hooguit 18 maanden. Verwijder je je account,
          dan wissen we direct je account, je e-mailadres, een eventuele partnerkoppeling en alles wat naar jou leidt.
          Wat je van films en series vond (beoordelingen, favorieten, kijklijst, verborgen titels, oordelen bij
          &quot;Samen&quot;, favoriete acteurs en regisseurs) en je streamingdiensten en voorkeuren bewaren we daarna alleen
          anoniem: onder een willekeurige code, met alleen de maand in plaats van de datum, zodat niemand, ook wij niet,
          kan zien dat het van jou was. Samen met de anonieme totalen per maand gebruiken we dat om de aanbevelingen te
          verbeteren en te begrijpen wat mensen graag kijken.
        </p>
      </Section>

      <Section title="Jouw rechten">
        <p>
          Je mag vragen om inzage in, correctie van of verwijdering van je gegevens, en bezwaar maken tegen het
          gebruik ervan. Je account en alle gegevens verwijderen kan zelf bij{' '}
          <Link href="/settings" className="text-accent">Instellingen</Link> onder &quot;Account verwijderen&quot; (zie ook{' '}
          <Link href="/account-verwijderen" className="text-accent">hoe je je account verwijdert</Link>). Voor
          andere verzoeken mail je naar <a href={`mailto:${CONTACT}`} className="text-accent">{CONTACT}</a>; we
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

function PrivacyEn() {
  return (
    <main className="max-w-xl mx-auto px-5 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-muted hover:text-foreground transition-colors">← Back</Link>
      <h1 className="font-display text-3xl mt-4 mb-2">Privacy statement</h1>
      <p className="text-muted mb-2">Last updated: 25 October 2026</p>
      <p className="text-muted text-sm mb-8">
        This is a translation of the Dutch privacy statement. If the two differ, the Dutch version applies.
      </p>

      <Section title="Who we are">
        <p>
          Kijkassistent is an app that gives personal film and series recommendations. The controller of your data is
          B. vd Woude, administrator of Kijkassistent, who can be reached at{' '}
          <a href={`mailto:${CONTACT}`} className="text-accent">{CONTACT}</a>.
        </p>
      </Section>

      <Section title="What data we keep">
        <ul className="list-disc pl-5 space-y-1">
          <li>Your email address and password (the password is stored encrypted and we cannot read it).</li>
          <li>Your streaming services and the genres you have excluded.</li>
          <li>Your favourite films, series, actors and directors, your ratings and your watchlist.</li>
          <li>
            When you rate a title from the &quot;For you&quot; tab, mark it as a favourite or add it to your watchlist, we
            also keep which tab you saw it in and why it was recommended. If you rate it later from your watchlist, that
            information comes along. This lets us measure how well the recommendations fit and improve them. Only we
            can see this, without your name or email address.
          </li>
          <li>
            Which recommendations on &quot;For you&quot; came into view and which ones you opened (title, tab, position in the
            list and percentage), and which titles you removed from your watchlist without rating them. This lets us
            measure how much of what we show really suits you. Only we can see this, without your name or email
            address, and we keep it for at most 18 months. After that we only keep anonymous monthly totals (for example
            &quot;this film was shown 40 times in March and chosen 12 times&quot;), which no longer show who did what.
          </li>
          <li>
            If you link a partner: the link itself (your partner sees your email address in the invitation) and the
            shared ratings for &quot;Together&quot;.
          </li>
          <li>Temporarily stored recommendations, so the app loads quickly, and which tip of the week you received.</li>
          <li>
            How often you open Kijkassistent per day and with what: the Android app, the version installed on your home
            screen or the browser. This shows us whether the app is being used well. Only we can see this, without your
            name or email address, and we keep it for at most 18 months.
          </li>
          <li>
            If you import your Letterboxd export: the file is only read in your own browser and is not sent to us. Only
            the films and ratings you choose to import are stored, just like everything you add yourself.
          </li>
        </ul>
        <p className="mt-3">
          We don&apos;t use ads, tracking by other parties or third-party analytics tools. What we measure, we measure
          ourselves and only within the app. We don&apos;t sell data.
        </p>
      </Section>

      <Section title="What we use it for">
        <p>
          Only to make the app work and improve it: logging in, building your taste profile, calculating
          recommendations and measuring how well they fit. The legal basis is the agreement you enter into with us by
          creating an account.
        </p>
        <p className="mt-3">
          We also use your email address for a weekly email with a few personal tips. It is on by default; you can
          unsubscribe with one click at the bottom of every email, or in{' '}
          <Link href="/settings" className="text-accent">Settings</Link>. If you rate a title or add it to your
          watchlist using a button in that email, we store it just like in the app, with &quot;mail&quot; as its origin. We
          can&apos;t see whether you open the email.
        </p>
      </Section>

      <Section title="Who we share data with">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Supabase</strong> — database and login. The data is stored on servers in the EU (Ireland).
          </li>
          <li><strong>Vercel</strong> — hosting of the app.</li>
          <li>
            <strong>TMDB</strong> — for title data and searches. Your search terms are passed on, but not linked to your
            name or email address.
          </li>
          <li>
            <strong>Voyage AI</strong> — to compare descriptions of films and series. No personal data is sent.
          </li>
        </ul>
        <p className="mt-3">For parties outside the EU, the standard contractual clauses required by the GDPR apply.</p>
      </Section>

      <Section title="Cookies and local storage">
        <p>
          We only use what is necessary: your login session, a copy of your latest recommendations and the look (skin)
          you chose, in your browser&apos;s storage, and a cookie with the language you chose (Dutch or English). That&apos;s
          why there is no cookie banner.
        </p>
        <p className="mt-3">
          In the video store (kijkassistent.nl/videotheek, also without an account) your browser remembers which
          services you picked. We count per day how many visitors come, how many flip a tape over and how many tap
          &quot;create an account&quot;. For that, your browser only remembers which of those steps have already been counted
          today. We only keep the totals per day: no IP address, no account and nothing that can be traced back to you.
        </p>
      </Section>

      <Section title="How long we keep data">
        <p>
          As long as you have an account; what came into view and what you opened for at most 18 months. If you delete
          your account, we immediately erase your account, your email address, any partner link and everything that
          leads back to you. What you thought of films and series (ratings, favourites, watchlist, hidden titles,
          verdicts in &quot;Together&quot;, favourite actors and directors) and your streaming services and preferences are
          then only kept anonymously: under a random code, with only the month instead of the date, so that nobody, not
          even we, can see that it was yours. Together with the anonymous monthly totals, we use this to improve the
          recommendations and to understand what people like to watch.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You may ask to access, correct or delete your data, and object to its use. You can delete your account and all
          data yourself in <Link href="/settings" className="text-accent">Settings</Link> under &quot;Delete account&quot;
          (see also <Link href="/account-verwijderen" className="text-accent">how to delete your account</Link>). For
          other requests, email <a href={`mailto:${CONTACT}`} className="text-accent">{CONTACT}</a>; we respond
          within 30 days. If you are not satisfied, you can file a complaint with the Dutch Data Protection Authority
          (Autoriteit Persoonsgegevens).
        </p>
      </Section>

      <Section title="Age">
        <p>The app is not intended for children under 16.</p>
      </Section>

      <Section title="Changes">
        <p>If we change this statement, you&apos;ll see it from the date at the top.</p>
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
