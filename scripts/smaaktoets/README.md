# Smaaktoets

Meet hoe goed de berekening van de aanbevelingen de beoordelingen van echte gebruikers voorspelt, zodat elke wijziging
vergeleken kan worden met de nulmeting van de bevroren versie (`docs/bevroren-versies.md`). Steeds wordt de titel zelf
weggelaten en voorspeld uit de rest. Uitkomst = trefkans: hoe vaak "zeker leuk" hoger scoort dan "oké" of "niet voor mij"
(50% is gokken).

Er gaan nooit beoordelingen van gebruikers in het project: de map `data/` staat in `.gitignore`.

## Verhaal-vingerafdrukken en Samen (in de database)

Draai `toets-verhaal.sql` en `toets-samen.sql` in de SQL-editor van Supabase, of laat Claude ze uitvoeren via de
database-koppeling. Ze lezen alleen.

## Kenmerken (trefwoorden, regisseur, tijdperk, taal)

Rekent met de echte code uit `lib/titleFeatures.ts`.

1. Draai `export-beoordelingen.sql` en plak de uitkomst (één JSON-object) in `scripts/smaaktoets/data/rated.json`.
2. Kenmerken ophalen bij TMDB (alleen lezen, gebruikt `TMDB_API_KEY` uit `.env.local`):

   ```bash
   node scripts/smaaktoets/fetch-kenmerken.mjs
   ```

3. De toets (Node 23.6 of nieuwer):

   ```bash
   node scripts/smaaktoets/toets-kenmerken.ts
   ```

Na een wijziging aan `lib/titleFeatures.ts` alleen stap 3 opnieuw draaien.
