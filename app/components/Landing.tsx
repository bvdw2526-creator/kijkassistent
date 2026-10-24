import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import LegalLinks from './LegalLinks'
import LanguageSwitch from './LanguageSwitch'
import { SOCIAL_LINKS } from '@/lib/socialLinks'
import { btnPrimary, btnSecondary, card } from './ui'
import { CheckIcon, UsersIcon, HeartIcon, StarIcon, InstagramIcon, FacebookIcon, TikTokIcon } from './Icons'

// De startpagina voor bezoekers zonder account (vaak via Instagram of Facebook). Doel: in één
// blik laten zien wat je krijgt, vóórdat iemand een e-mailadres moet invullen.
// De schermafbeeldingen in /public/start komen uit store-assets/screenshots (verkleind naar webp).
// Teksten staan in messages/nl.json en messages/en.json onder "landing".

const SERVICES = ['Netflix', 'Videoland', 'Disney+', 'Prime Video', 'HBO Max', 'Apple TV', 'SkyShowtime', 'Viaplay', 'NPO Start', 'Pathé Thuis']

// Bewust klein onderaan: de pagina moet bezoekers naar een account sturen, niet weg naar sociale media.
const SOCIAL_ICONS = { Instagram: InstagramIcon, Facebook: FacebookIcon, TikTok: TikTokIcon }
const SOCIALS = SOCIAL_LINKS.map((s) => ({ ...s, Icon: SOCIAL_ICONS[s.label] }))

const STEPS = [1, 2, 3] as const
const SAMEN = ['together1', 'together2', 'together3'] as const
const FAQ = [1, 2, 3] as const

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
  const t = useTranslations('landing')
  const common = useTranslations('common')

  return (
    <main className="max-w-xl laptop:max-w-5xl mx-auto px-6 pb-16">
      <header className="flex items-center justify-between py-6">
        <p className="font-display text-sm tracking-[0.2em] uppercase text-accent">Kijkassistent</p>
        <div className="flex items-center gap-4">
          <LanguageSwitch />
          <Link href="/login" className="text-sm text-muted hover:text-foreground transition-colors">
            {common('login')}
          </Link>
        </div>
      </header>

      {/* Hoofdboodschap */}
      <section className="pt-6 laptop:pt-12 laptop:grid laptop:grid-cols-2 laptop:gap-12 laptop:items-center">
        <div>
          <h1 className="font-display text-4xl laptop:text-5xl leading-tight mb-4">{t('heroTitle')}</h1>
          <p className="text-muted text-lg leading-relaxed mb-8">{t('heroText')}</p>
          {/* Eerst proberen zonder account (/tip): voor bezoekers van Instagram en TikTok die nog niet willen aanmelden. */}
          <div className="mb-6">
            <Link
              href="/tip"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-1.5 rounded-full border-2 border-accent text-accent font-semibold px-5 py-3 hover:bg-accent/10 active:scale-[0.97] transition-all touch-manipulation"
            >
              {t('tryFirst')}
            </Link>
            <p className="text-sm text-muted mt-2">{t('tryText')}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link href="/register" className={btnPrimary}>
              {common('createFreeAccount')}
            </Link>
            <Link href="/login" className={btnSecondary}>
              {common('login')}
            </Link>
          </div>
          <p className="text-sm text-faint mt-4 flex flex-wrap gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5"><CheckIcon className="w-4 h-4 text-teal" />{t('free')}</span>
            <span className="inline-flex items-center gap-1.5"><CheckIcon className="w-4 h-4 text-teal" />{t('noAds')}</span>
            <span className="inline-flex items-center gap-1.5"><CheckIcon className="w-4 h-4 text-teal" />{t('readyInMinutes')}</span>
          </p>
        </div>
        <div className="mt-12 laptop:mt-0">
          <Screenshot src="/start/voor-jou.webp" alt={t('screenshotForYou')} priority />
        </div>
      </section>

      {/* Diensten */}
      <section className="mt-16">
        <p className="text-sm text-muted text-center mb-3">{t('worksWith')}</p>
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
        <h2 className="font-display text-2xl laptop:text-3xl mb-6">{t('howItWorks')}</h2>
        <ol className="grid gap-3 laptop:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step} className={`${card} p-5`}>
              <span className="inline-flex w-8 h-8 items-center justify-center rounded-full bg-accent/12 text-accent font-semibold mb-3">
                {step}
              </span>
              <h3 className="font-semibold mb-1">{t(`step${step}Title`)}</h3>
              <p className="text-muted text-sm leading-relaxed">{t(`step${step}Text`)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Samen kijken */}
      <section className="mt-16 laptop:grid laptop:grid-cols-2 laptop:gap-12 laptop:items-center">
        <div className="laptop:order-2">
          <p className="inline-flex items-center gap-2 text-sm text-accent mb-2">
            <UsersIcon className="w-4 h-4" /> {t('togetherLabel')}
          </p>
          <h2 className="font-display text-2xl laptop:text-3xl mb-3">{t('togetherTitle')}</h2>
          <p className="text-muted leading-relaxed mb-5">{t('togetherText')}</p>
          <ul className="flex flex-col gap-2.5 mb-2">
            {SAMEN.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <HeartIcon className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                <span>{t(item)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-10 laptop:mt-0 laptop:order-1">
          <Screenshot src="/start/samen.webp" alt={t('screenshotTogether')} />
        </div>
      </section>

      {/* Vragen */}
      <section className="mt-16">
        <h2 className="font-display text-2xl laptop:text-3xl mb-6">{t('faqTitle')}</h2>
        <div className="grid gap-3 laptop:grid-cols-3">
          {FAQ.map((item) => (
            <div key={item} className={`${card} p-5`}>
              <h3 className="font-semibold mb-1.5 flex items-center gap-2">
                <StarIcon className="w-4 h-4 text-accent" />
                {t(`faq${item}Q`)}
              </h3>
              <p className="text-muted text-sm leading-relaxed">{t(`faq${item}A`)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Afsluiter */}
      <section className={`${card} mt-16 p-8 text-center`}>
        <h2 className="font-display text-2xl laptop:text-3xl mb-2">{t('closingTitle')}</h2>
        <p className="text-muted mb-6">{t('closingText')}</p>
        <Link href="/register" className={btnPrimary}>
          {common('createFreeAccount')}
        </Link>
      </section>

      <div className="mt-12 flex items-center justify-center gap-4">
        <span className="text-sm text-faint">{t('followUs')}</span>
        {SOCIALS.map(({ label, href, Icon }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t('socialLabel', { network: label })}
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
