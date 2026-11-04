import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Vertalingen (Nederlands/Engels), zie i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  images: {
    // Posters niet via Vercels beeldoptimalisatie: TMDB levert ze al op het gevraagde formaat (w92, w200, w342 in de
    // URL), en het gratis Hobby-plan heeft maar 5.000 "Image Transformations" per maand. Op 9 okt 2026 stond de teller
    // op 4.651 (93%); daarboven ligt de optimalisatie 30 dagen stil en laden de posters niet meer.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
  // Het adres zonder www stuurt door naar www, behalve de controlebestanden in /.well-known/ (assetlinks.json voor
  // Android, apple-app-site-association voor iOS): Google en Apple volgen bij die controle geen doorverwijzing, en
  // anders openen links naar kijkassistent.nl niet in de app. Werkt pas als in Vercel (Settings → Domains) de
  // doorverwijzing van kijkassistent.nl naar www uit staat; tot die tijd doet Vercel het zelf en verandert er niets.
  async redirects() {
    return [
      {
        source: "/:path((?!\\.well-known/).*)",
        has: [{ type: "host", value: "kijkassistent.nl" }],
        destination: "https://www.kijkassistent.nl/:path",
        permanent: true,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
