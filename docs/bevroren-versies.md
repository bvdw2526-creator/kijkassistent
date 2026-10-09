# Bevroren versies van de aanbevelingen

Een "bevroren versie" is een vastgelegde stand van de manier waarop de app aanbevelingen berekent, met een nulmeting, zodat
we na verder sleutelen kunnen zien of het beter of slechter werd en zo nodig precies terug kunnen. Je krijgt daarmee niet
dezelfde lijsten terug (beoordelingen veranderen), wel dezelfde manier van rekenen.

## smaak-2026-10-09

Vastgelegd op 9 oktober 2026, omdat het beoordelingssysteem toen goed werkte.

- **Git-label:** `smaak-2026-10-09`.
- **Code van de berekening:** `lib/recommendationEngine.ts`, `lib/titleFeatures.ts`, `lib/upcomingTitles.ts`,
  `app/api/recommendations/route.ts`, `app/api/recommendations-together/route.ts` (de uitleg bij een titel staat in
  `app/page.tsx`).
- **Voorvoegsels van de opgeslagen lijsten:** `u14` (persoonlijk) en `v21-thema` (Samen).

### Wat erin zit

- Favoriet weegt 3, "zeker leuk" 2, "was oké" 0,5; een favoriet die ook beoordeeld is telt één keer.
- Kenmerken (trefwoorden, regisseur, tijdperk, taal) leren van twee kanten: "niet voor mij" en "oké" tellen tegen.
- Verhaal-vingerafdrukken van de **Engelse** titel en samenvatting (`title_embeddings_en`).
- Verhaal-score als tegenstelling (lijkt meer op wat je leuk vond dan op wat je afkeurde), rond 0.
- Matchpercentage: sterkte van het bewijs t.o.v. de sterkste titels (`'strength'`); geen percentage bij Verras me.
- Verras me: hooguit 30 films en 30 series (inclusief 6+6 verrassingen), bredere zoektocht op je eigen diensten.
- Samen: per persoon de tegenstelling, de zwakste van beiden, min de helft van "lijkt op wat jullie samen afkeurden".
- Binnenkort: dezelfde tegenstelling.

Uitleg en metingen per onderdeel: `docs/leren-van-smaak.md` en `docs/matchpercentage.md`.

### Database-onderdelen waarop deze versie leunt

Niet wijzigen of verwijderen zolang je naar deze versie terug wilt kunnen:

- Tabellen: `title_embeddings_en`, `title_embeddings`, `tmdb_features_cache` (met `title_en`, `overview_en`), de andere
  `tmdb_*_cache`-tabellen, `recommendations_cache`, `couple_recommendations_cache`, `couple_ratings`.
- Functies: `embedding_similarities_en`, `embedding_taste_neighbors_en` (en de Nederlandse `embedding_similarities`,
  `embedding_taste_neighbors`), `titles_missing_english_embedding`, `is_app_admin`.
- Migraties tot en met `20261009_recommendation_snapshots.sql`.

### Nulmeting

Trefkans = hoe vaak de ene groep hoger scoort dan de andere (50% is gokken). Gemeten op 9 oktober 2026 op de twee profielen
met meer dan 200 beoordelingen, steeds met de titel zelf weggelaten. Opnieuw meten: zie `scripts/smaaktoets/README.md`.

| Onderdeel | Maat | Profiel 1 | Profiel 2 |
|---|---|---|---|
| Verhaal (Engels) | dichtstbijzijnde leuke titel: leuk > niet voor mij | 80,2% | 78,4% |
| | idem: leuk > oké | 66,6% | 64,6% |
| | tegenstelling: leuk > niet voor mij | 74,8% | 77,7% |
| Kenmerken | leuk > niet voor mij | 80,7% | 73,2% |
| | leuk > oké | 70,9% | 59,3% |
| | oké > niet voor mij | 66,7% | 67,2% |

Samen (één stel, 14 samen beoordeelde titels, dus alleen een aanwijzing): huidige berekening 73%, de oude "zwakste van
beiden" 80%. Opvallend: de smaak van de partner alleen voorspelt de uitkomst 96%, die van de beoordelaar zelf 47%. Dat past
bij het vermoeden dat "niet voor mij" bij Samen vaak "niet voor ons" betekent (open punt).

### Momentopname

In de tabel `recommendation_snapshots` (alleen leesbaar voor de beheerder), label `smaak-2026-10-09`: de lijsten van 4
gebruikers en 2 stellen die op dat moment al met deze versie waren berekend.

### Gewijzigd na deze versie

- 9 okt 2026: Samen kreeg "Niet voor ons" en "Samen gezien?" in plaats van persoonlijke beoordelingen, en wat jullie samen
  leuk of oké vonden telt via het verhaal mee (`COUPLE_LIKE_STORY_WEIGHT`). Samen-toets op het eerste stel: 73% naar 94%.
  Nieuwe database-onderdelen: kolom `couple_ratings.reason`. Voorvoegsel Samen nu `v22-samen-leuk`. De persoonlijke
  berekening is ongewijzigd. Terugzetten van alleen dit deel: `app/api/recommendations-together/route.ts`,
  `app/page.tsx` en `app/components/PartnerRated.tsx` uit het label halen (oude `reason`-waarden blijven dan gewoon staan).

## Afspraken bij verder sleutelen

1. **Database: alleen toevoegen.** Een nieuwe versie van een tabel of functie krijgt een nieuwe naam naast de oude (zoals
   `title_embeddings_en` naast `title_embeddings`). Wat hierboven staat, blijft ongemoeid.
2. **Eerst meten.** Elke wijziging aan de berekening eerst met de smaaktoets vergelijken met de nulmeting. Slechter is niet
   live, tenzij daar een goede reden voor is.
3. **Na een geslaagde wijziging:** een nieuwe bevroren versie maken (nieuw label, nieuwe nulmeting, nieuwe momentopname)
   en hier een sectie toevoegen. Oude secties blijven staan.

## Terugzetten naar smaak-2026-10-09

1. De code van de berekening terugzetten:

   ```bash
   git checkout smaak-2026-10-09 -- lib/recommendationEngine.ts lib/titleFeatures.ts lib/upcomingTitles.ts app/api/recommendations/route.ts app/api/recommendations-together/route.ts
   ```

2. De voorvoegsels van de opgeslagen lijsten ophogen naar een nummer dat nog niet gebruikt is (in de twee routes), zodat
   alle lijsten opnieuw worden berekend.
3. Typecheck (`npx tsc --noEmit`), lokaal testen, en dan pushen. Andere code kan sindsdien veranderd zijn; de typecheck laat
   zien of iets niet meer past.

De database hoeft niet terug zolang afspraak 1 is aangehouden.

**Noodrem bij een kapotte live-versie:** in Vercel onder Deployments de vorige productieversie kiezen en "Instant
Rollback". Op het gratis Hobby-plan kan dat alleen naar de direct vorige versie, en de database gaat niet mee terug.

## Momentopname vergelijken

Welke titels nu in Puur mijn smaak staan die er in de momentopname niet stonden (en andersom), voor één gebruiker:

```sql
with toen as (
  select x->>'media_type' || '-' || (x->>'id') sleutel, x->>'title' titel
  from recommendation_snapshots s, jsonb_array_elements(s.lists->'focused') x
  where s.label = 'smaak-2026-10-09' and s.kind = 'persoonlijk' and s.owner_id = '<user-id>'
),
nu as (
  select x->>'media_type' || '-' || (x->>'id') sleutel, x->>'title' titel
  from recommendations_cache c, jsonb_array_elements(c.focused) x
  where c.user_id = '<user-id>'
)
select 'nieuw' wat, titel from nu where sleutel not in (select sleutel from toen)
union all
select 'verdwenen', titel from toen where sleutel not in (select sleutel from nu);
```
