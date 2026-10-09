import type { NextConfig } from "next";

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
};

export default nextConfig;
