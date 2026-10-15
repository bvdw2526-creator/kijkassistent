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
- 11 okt 2026: een regisseur telt pas als pluspunt bij twee of meer titels die je "zeker leuk" vond
  (`DIRECTOR_MIN_POSITIVE` in `lib/titleFeatures.ts`); een zelf gekozen favoriete regisseur telt nog steeds los mee.
  Aanleiding: titels die in Puur mijn smaak stonden met "regisseur X" als reden en verkeerd vielen. Gemeten: buiten een
  filmreeks was een regisseur met één geliefde film bij beide profielen 41% "zeker leuk" (zonder signaal 38% en 46%),
  binnen een reeks 90%. Kenmerken-toets (leuk > niet voor mij / leuk > oké): profiel 1 van 80,7 / 70,9 naar 78,0 / 69,9,
  profiel 2 van 73,2 / 59,3 naar 73,7 / 58,1. Dat is op papier iets lager dan de nulmeting bij profiel 1; bewust
  gekozen, omdat het verlies uit filmreeksen komt die de motor ook zonder regisseur herkent. Voorvoegsels nu `u15` en
  `v23-regisseur`. Terugzetten: `lib/titleFeatures.ts` uit het label halen en de voorvoegsels ophogen.
- 11 okt 2026: knop "Te oud" bij titels van vóór 2000 (verbergt met reden `te_oud`, geen beoordeling) en de instelling
  "Niet ouder dan" (`profiles.min_year`). Dat is een filter achteraf in de motor (`isOlderThan`), de scores zelf zijn
  ongewijzigd; bij Samen geldt de strengste grens van beide partners. Nieuwe database-onderdelen: kolommen
  `hidden_titles.reason`, `hidden_titles.release_year` en `profiles.min_year` (migratie `20261011_te_oud.sql`).
  Voorvoegsels nu `u16` en `v24-te-oud`.
- 12 okt 2026: de motor zoekt zelf titels bij je zes sterkste thema's (`strongestThemes` in `lib/titleFeatures.ts`,
  `discoverByTheme` in de motor). Het is een extra bron van kandidaten; de weging van de bestaande signalen is
  ongewijzigd (kenmerken-toets blijft 78,0 / 69,9 en 73,7 / 58,1). Aanleiding: een liefhebber van tijdreizen had 38
  onbekende tijdreistitels op zijn diensten en zag er 2. Niet bij Samen. Voorvoegsels nu `u17` en `v25-themas`.
  Terugzetten: de twee bestanden uit het label halen en de voorvoegsels ophogen.
- 13 okt 2026: nieuwe bron "nieuw op je diensten" (`discoverNewReleases` in de motor): titels van de afgelopen zes
  maanden op je diensten, niet op taal gefilterd; de gewone score bepaalt of ze in je lijsten komen, en een titel die er
  alleen hierdoor is moet qua verhaal passen. Aanleiding: The Polygamist stond vier maanden op Netflix en was door de
  app nooit gezien. Weging ongewijzigd (kenmerken-toets blijft 78,0 / 69,9 en 73,7 / 58,1). Niet bij Samen.
  Voorvoegsel nu `u20`.
- 13 okt 2026: snelheid, geen wijziging aan de berekening. De motor roept `embedding_similarities_en_v2` en
  `embedding_taste_neighbors_en_v2` aan (migratie `20261013_embedding_functions_v2.sql`); de oude functies staan er nog.
  Zelfde uitkomst, gecontroleerd door oud en nieuw naast elkaar te draaien: de verhaal-vergelijking op alle 8.964 titels
  (met 2 en met 6 vectoren) en de buren op 5.000 titels tegen de twee grootste profielen, overal 0 verschillen. Twee
  randgevallen wijken bewust af: een titel die dubbel in de kandidatenlijst staat komt er één keer goed uit (de oude gaf
  dan de getallen dubbel), en bij precies gelijke afstand kiest de buren-functie op volgorde van aanlevering (de oude
  willekeurig). Voorvoegsels ongewijzigd (`u20`, `v25-themas`), opgeslagen lijsten blijven geldig. Terugzetten: in
  `lib/recommendationEngine.ts` bij `SIMILARITY_RPC` en `NEIGHBORS_RPC` de toevoeging `_v2` weghalen.
- 14 okt 2026: snelheid, geen wijziging aan de scores. Bij "Voor jou" geldt kijkinformatie die ouder is dan 72 uur als
  bruikbaar (tot 14 dagen oud) en wordt die pas na het antwoord ververst (`onStale` in `getWatchProvidersBulk`,
  `refreshWatchProviders`, `after` in `app/api/recommendations/route.ts`); titels waarvan nog niets bekend is of waarvan
  de informatie ouder is dan 14 dagen, worden nog tijdens de berekening opgehaald. Gevolg: een titel die net van een dienst is verdwenen, kan één berekening langer zichtbaar zijn.
  Samen, Halloween en de andere routes zijn ongewijzigd. Daarnaast worden de delen van reeksen in een paar vragen gelezen
  in plaats van één per reeks (`getCollectionPartsBulk`), met dezelfde uitkomst. Voorvoegsels ongewijzigd. Terugzetten:
  in de route `onStaleAvailability` en `onStale` weglaten (dan werkt alles weer zoals eerst).
- 14 okt 2026: een opgeslagen lijst van "Voor jou" blijft 24 uur geldig in plaats van 6
  (`RECOMMENDATIONS_RESULT_CACHE_MAX_AGE_HOURS`), en de knop Vernieuwen rekent altijd opnieuw (`?vers=1`). Bij het
  openen van de app krijg je dus vaker meteen de opgeslagen lijst; beoordelen, verbergen of iets op je kijklijst zetten
  maakt hem nog steeds direct ongeldig. De berekening zelf is ongewijzigd; Samen blijft op 6 uur. Terugzetten: het getal
  terug naar 6 en `loadRecommendations(true)` bij de knop in `app/page.tsx` terug naar `loadRecommendations()`.
- 15 okt 2026: beveiliging, geen wijziging aan de berekening. De gedeelde caches (`tmdb_*_cache`, `title_embeddings`,
  `title_embeddings_en`) worden door de server geschreven met de service role-sleutel (`cacheWriter` in
  `lib/supabaseAdmin.ts`, Vercel-instelling `SUPABASE_SERVICE_ROLE_KEY`) in plaats van met de sleutel van de gebruiker.
  Daarna zet migratie `20261015_lock_shared_caches.sql` het schrijven voor gebruikers dicht; lezen blijft gelijk. Dit is
  een bewuste uitzondering op "alleen toevoegen": er wordt iets weggehaald omdat iedereen met een account de caches kon
  aanpassen of wissen. De bevroren code kan na die migratie geen nieuwe cacherijen meer opslaan, maar rekent nog wel met
  wat er is.
- 15 okt 2026: snelheid, geen wijziging aan de scores. "Lijkt hierop"-lijsten, rolverdelingen en details verlopen per
  titel tussen 7 en 10 dagen in plaats van allemaal na precies 7 (`cacheRowAge`, `spreadMaxAgeMs`), en bij Voor jou en
  Stats worden verlopen rijen (tot 30 dagen oud) direct gebruikt en pas na het antwoord ververst (`StaleCacheRefresher`,
  samen met de kijkinformatie). Bij de rolverdeling gaan tijdens de berekening hooguit 150 ontbrekende titels live
  (`CREDITS_LIVE_LIMIT`); de rest volgt na het antwoord, dus een titel kan één berekening lang zonder acteur- of
  regisseursbonus staan. Aanleiding: een golf van 400+ verlopen "lijkt hierop"-lijsten liet de berekening vastlopen.
  Samen ongewijzigd. Terugzetten: in de routes `staleRefresher` en de `onStale`-opties weglaten.

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
