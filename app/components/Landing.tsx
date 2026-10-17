import Image from 'next/image'
import Link from 'next/link'
import LegalLinks from './LegalLinks'
import { SOCIAL_LINKS } from '@/lib/socialLinks'
import { btnPrimary, btnSecondary, card } from './ui'
import { CheckIcon, UsersIcon, HeartIcon, StarIcon, InstagramIcon, FacebookIcon, TikTokIcon } from './Icons'

// De startpagina voor bezoekers zonder account (vaak via Instagram of Facebook). Doel: in één
// blik laten zien wat je krijgt, vóórdat iemand een e-mailadres moet invullen.
// De schermafbeeldingen in /public/start komen uit store-assets/screenshots (verkleind naar webp).

const SERVICES = ['Netflix', 'Videoland', 'Disney+', 'Prime Video', 'HBO Max', 'Apple TV', 'SkyShowtime', 'Viaplay', 'NPO Start', 'Pathé Thuis']

// Bewust klein onderaan: de pagina moet bezoekers naar een account sturen, niet weg naar sociale media.
const SOCIAL_ICONS = { Instagram: InstagramIcon, Facebook: FacebookIcon, TikTok: TikTokIcon }
const SOCIALS = SOCIAL_LINKS.map((s) => ({ ...s, Icon: SOCIAL_ICONS[s.label] }))

const STEPS = [
  { title: 'Kies je streamingdiensten', text: 'Je krijgt alleen tips voor wat je ook echt kunt kijken.' },
  { title: 'Vertel wat je mooi vindt', text: 'Kies een paar favoriete films en series. Hoe meer je aangeeft, hoe beter de tips.' },
  { title: 'Weet wat je vanavond kijkt', text: 'Persoonlijke tips met een matchpercentage en waar je ze kunt zien.' },
]

const SAMEN = [
  'Zie wat jullie állebei leuk zouden vinden',
  'Elke avond een tip van vanavond, spannend, lachen of ontspannen',
  'Een gezamenlijke kijklijst en jullie smaakmatch',
]

const FAQ = [
  { q: 'Wat kost het?', a: 'Niets. Kijkassistent is gratis en heeft geen advertenties.' },
  {
    q: 'Wat gebeurt er met mijn gegevens?',
    a: 'We gebruiken je beoordelingen alleen voor jouw tips. Geen advertenties, geen tracking, en je verwijdert je account zelf wanneer je wilt.',
  },
  { q: 'Werkt het op mijn telefoon?', a: 'Ja, gewoon in je browser. Je kunt de app ook op je beginscherm zetten.' },
]

function Screenshot({ src, alt, priority = false }: { src: string; alt: string; priority?: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-[280px] rounded-[2rem] border border-line-strong bg-surface p-2 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
      <Image
        src={src}
        alt={alt}
        width={600}
        height={943}
        priority={priority}
        className="w-full h-auto rounded-[1.6rem]"
      />
    </div>
  )
}

export default function Landing() {
  return (
    <main className="max-w-xl laptop:max-w-5xl mx-auto px-6 pb-16">
      <header className="flex items-center justify-between py-6">
        <p className="font-display text-sm tracking-[0.2em] uppercase text-accent">Kijkassistent</p>
        <Link href="/login" className="text-sm text-muted hover:text-foreground transition-colors">
          Inloggen
        </Link>
      </header>

      {/* Hoofdboodschap */}
      <section className="pt-6 laptop:pt-12 laptop:grid laptop:grid-cols-2 laptop:gap-12 laptop:items-center">
        <div>
          <h1 className="font-display text-4xl laptop:text-5xl leading-tight mb-4">
            Weten wat je vanavond gaat kijken.
          </h1>
          <p className="text-muted text-lg leading-relaxed mb-8">
            Geen half uur meer scrollen. Persoonlijke tips voor films en series, alleen van wat er op jouw
            streamingdiensten staat. Ook voor samen met je partner.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/register" className={btnPrimary}>
              Gratis account maken
            </Link>
            <Link href="/login" className={btnSecondary}>
              Inloggen
            </Link>
          </div>
          <p className="text-sm text-faint mt-4 flex flex-wrap gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><CheckIcon className="w-4 h-4 text-teal" />Gratis</span>
            <span className="inline-flex items-center gap-1.5"><CheckIcon className="w-4 h-4 text-teal" />Geen advertenties</span>
            <span className="inline-flex items-center gap-1.5"><CheckIcon className="w-4 h-4 text-teal" />Klaar in een paar minuten</span>
          </p>
        </div>
        <div className="mt-12 laptop:mt-0">
          <Screenshot src="/start/voor-jou.webp" alt="Persoonlijke tips met matchpercentage in Kijkassistent" priority />
        </div>
      </section>

      {/* Diensten */}
      <section className="mt-16">
        <p className="text-sm text-muted text-center mb-3">Werkt met</p>
        <div className="flex flex-wrap justify-center gap-2">
          {SERVICES.map((s) => (
            <span key={s} className="rounded-full border border-line px-3.5 py-1.5 text-sm text-muted">
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* Zo werkt het */}
      <section className="mt-16">
        <h2 className="font-display text-2xl laptop:text-3xl mb-6">Zo werkt het</h2>
        <ol className="grid gap-3 laptop:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className={`${card} p-5`}>
              <span className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-accent/12 text-accent font-semibold mb-3">
                {i + 1}
              </span>
              <h3 className="font-semibold mb-1">{step.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Samen kijken */}
      <section className="mt-16 laptop:grid laptop:grid-cols-2 laptop:gap-12 laptop:items-center">
        <div className="laptop:order-2">
          <p className="inline-flex items-center gap-2 text-sm text-accent mb-2">
            <UsersIcon className="w-4 h-4" /> Samen kijken
          </p>
          <h2 className="font-display text-2xl laptop:text-3xl mb-3">
            Geen discussie meer over wat jullie gaan kijken.
          </h2>
          <p className="text-muted leading-relaxed mb-5">
            Koppel je partner en Kijkassistent zoekt wat bij jullie allebei past.
          </p>
          <ul className="flex flex-col gap-2.5 mb-2">
            {SAMEN.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <HeartIcon className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-10 laptop:mt-0 laptop:order-1">
          <Screenshot src="/start/samen.webp" alt="De tip van vanavond voor jullie samen" />
        </div>
      </section>

      {/* Vragen */}
      <section className="mt-16">
        <h2 className="font-display text-2xl laptop:text-3xl mb-6">Goed om te weten</h2>
        <div className="grid gap-3 laptop:grid-cols-3">
          {FAQ.map((item) => (
            <div key={item.q} className={`${card} p-5`}>
              <h3 className="font-semibold mb-1.5 flex items-center gap-2">
                <StarIcon className="w-4 h-4 text-accent" />
                {item.q}
              </h3>
              <p className="text-muted text-sm leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Afsluiter */}
      <section className={`${card} mt-16 p-8 text-center`}>
        <h2 className="font-display text-2xl laptop:text-3xl mb-2">Wat kijk jij vanavond?</h2>
        <p className="text-muted mb-6">Maak een gratis account en krijg binnen een paar minuten je eerste tips.</p>
        <Link href="/register" className={btnPrimary}>
          Gratis account maken
        </Link>
      </section>

      <div className="mt-12 flex items-center justify-center gap-4">
        <span className="text-sm text-faint">Volg ons</span>
        {SOCIALS.map(({ label, href, Icon }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Kijkassistent op ${label}`}
            className="w-10 h-10 inline-flex items-center justify-center rounded-full border border-line text-muted hover:text-accent hover:border-accent transition-colors"
          >
            <Icon className="w-5 h-5" />
          </a>
        ))}
      </div>

      <LegalLinks className="mt-8" />
    </main>
  )
}
