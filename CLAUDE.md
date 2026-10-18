@AGENTS.md

# Tweetalig (Nederlands en Engels)

De app is er in het Nederlands en het Engels (next-intl, zonder taal in de URL; zie `i18n/request.ts`). Bij elke wijziging:

- Geen tekst rechtstreeks in de code: zet nieuwe teksten in **zowel** `messages/nl.json` als `messages/en.json` en gebruik
  `useTranslations` (client), `getTranslations` (server components) of `serverTranslator` uit `lib/serverI18n.ts`
  (API-routes, mails). Controleer met `node scripts/i18n/check-keys.cjs`.
- Datums met de taal van de app opmaken (`useLocale()`; `en-GB` of `nl-NL`).
- TMDB-aanroepen die per verzoek gebeuren: taal via `tmdbLanguage(localeFromRequest(request))`. Lijsten uit de
  bewaarde aanbevelingen bij Engels omzetten met `lib/localizeTitles.ts`.
- Redenen bij tips (`basedOn`) blijven Nederlands bewaard; nieuwe vaste redenen ook toevoegen aan `lib/reasonLabels.ts`.
- "Wat is er nieuw" (`lib/releaseNotes.ts`): bij een nieuwe regel ook `itemsEn` invullen.
- Privacyverklaring en voorwaarden: de Nederlandse tekst is leidend; wijzig de Engelse vertaling op dezelfde pagina mee.
- Het beheerscherm (`/beheer`) mag Nederlands blijven.
