# De app leert van jouw smaak

De aanbevelingen leunden vooral op "kijkers vonden ook leuk" (TMDB), dus op wat veel mensen samen kijken. Nu schuift het
gewicht naar jouw eigen smaak naarmate je meer favorieten en beoordelingen hebt. Dit geldt voor alle tabbladen en ook voor
Samen, want Samen rekent met het smaakprofiel van allebei.

## Hoe

In `computeTasteProfile` (`lib/recommendationEngine.ts`) bepaalt `learn` (0 tot 1) hoeveel de app van je geleerd heeft:
aantal favorieten + "zeker leuk" + de helft van "was oké" (een favoriet die je ook beoordeelde telt één keer). Bij 5
bronnen of minder is `learn` 0 (alles zoals het was), bij 40 of meer is het 1.

## Gewicht per beoordeling

Een favoriet is je absolute topfilm en weegt het zwaarst: `FAVORITE_SOURCE_WEIGHT` 3, "zeker leuk" 2
(`LOVE_SOURCE_WEIGHT`), "was oké" 0,5 (`OK_SOURCE_WEIGHT`, alleen bij Mijn smaak breder en Verras me). Tot 8 oktober 2026
woog een favoriet 1, dus minder dan "zeker leuk". Het gewicht telt door in de titel-aanbevelingen, de genre-voorkeur, de
gemiddelde smaakvector, de verhaal-buren (lijken op een favoriet telt 1,5 keer zo zwaar als lijken op een "zeker leuk") en
de kenmerken (van één favoriet telt de regisseur voor driekwart). Een favoriet die je ook beoordeelde, telt alleen als
favoriet.

Gemeten op twee echte profielen (8 oktober 2026): favoriet 3 in plaats van 1 voorspelt je andere beoordelingen even goed
(verhaal-buren 77,0% naar 78,0%, gemiddelde smaakvector 66,6% naar 65,6% kans dat een "zeker leuk" hoger scoort dan een
"niet voor mij"). Ongeveer terugzetten: `FAVORITE_SOURCE_WEIGHT = 1` en de voorvoegsels hieronder ophogen.

Naarmate `learn` stijgt:
- Wat andere kijkers deden (de kijkerslijsten en "populair in je genres") telt tot 50% minder (`COLLAB_MAX_REDUCTION`).
- De verhaal-overeenkomst met je smaak telt zwaarder: gewicht 2 wordt 6 (`EMBEDDING_EXTRA_AT_FULL`).
- Nieuw: de verhaal-overeenkomst met de dichtstbijzijnde losse titels die je leuk vond (`neighborScore`, gewicht
  `NEIGHBOR_LIKE_WEIGHT`), niet alleen met het gemiddelde.
- Puur mijn smaak: vanaf `learn` 0,5 moet een titel ook echt lijken op iets wat je leuk vond (overeenkomst van minstens
  `FOCUSED_MIN_NEIGHBOR_SIM` met een favoriet) of horen bij een reeks, acteur of regisseur die je zelf koos. Blijven er te
  weinig titels over (`FOCUSED_GATE_MIN_POOL`), dan vervalt die eis.

## Verhaal-score (tegenstelling)

Van elke titel is er een verhaal-vingerafdruk (embedding van titel + beschrijving). De verhaal-score (`embeddingBonus`) is
sinds 8 oktober 2026: hoeveel meer het verhaal van een kandidaat lijkt op het gemiddelde van wat je leuk vond dan op het
gemiddelde van wat je afkeurde (vanaf `STORY_DISLIKE_MIN` afkeuringen; daaronder alleen op wat je leuk vond). Een
gemiddelde kandidaat krijgt 0, en de score heeft dezelfde spreiding als de oude, zodat `EMBEDDING_BONUS_WEIGHT` en
`EMBEDDING_EXTRA_AT_FULL` hun betekenis houden.

Waarom: de oude score was de ruwe overeenkomst met het gemiddelde van wat je leuk vond. Die lag voor vrijwel alles tussen
0,55 en 0,78, dus iedere titel kreeg zo'n 4 punten "gratis" (dat blies de lage matchpercentages op), elke titel haalde
het label "vergelijkbare verhaallijn" (drempel 0,5), en op zichzelf voorspelde de score weinig (62% en 60% kans dat een
"zeker leuk" hoger scoort dan een "niet voor mij"; als tegenstelling 73% en 67%). Samen met de verhaal-buren ging het van
77,6% naar 79,4% en van 67,7% naar 67,8%: de volgorde verandert weinig, de percentages worden eerlijker. Het label staat
nu alleen bij titels waarvan het verhaal beter past dan bij driekwart van de overwogen titels (`STORY_LABEL_QUANTILE`).

**Samen en Binnenkort** gebruiken dezelfde tegenstelling (sinds 8 oktober 2026, `dislikeVector` in het smaakprofiel):
- Binnenkort (`lib/upcomingTitles.ts`): de verhaalhelft van de pasvorm is "lijkt meer op wat je leuk vond dan op wat je
  afkeurde", als percentiel binnen de binnenkort-titels. Bij Samen telt daar nog steeds de zwakste van jullie twee.
- Samen (`applyJointFit` in `app/api/recommendations-together/route.ts`): per persoon de tegenstelling, op één schaal
  gebracht (rond het midden van de lijst, gedeeld door de spreiding), daarvan de zwakste van jullie twee, min de helft
  (`COUPLE_DISLIKE_STORY_WEIGHT`) van hoeveel het lijkt op wat jullie samen afkeurden. Voorheen deed een gezamenlijke
  "niet voor mij" niets behalve die ene titel weghalen. Gemeten op een echt stel (14 samen beoordeelde titels): 69% oud,
  73% met ieders tegenstelling, 78% met daarbij de gezamenlijke afkeuringen (klein, maar dezelfde kant op). Het label "verhaal dat bij jullie allebei
  past" staat er alleen nog als het verhaal voor allebei beter past dan bij driekwart van de lijst.
- De smaakmatch tussen jullie (hoe dicht jullie smaken bij elkaar liggen) gebruikt nog het gemiddelde van wat ieder
  leuk vond: dat beschrijft jullie smaak, het is geen aanbeveling.

De percentages bij Samen zakken ook mee, omdat Samen de persoonlijke percentages van allebei gebruikt.

## Kenmerken van de films zelf

Naast het verhaal leert de app van wat een titel *is*, in `lib/titleFeatures.ts`:
- **Trefwoorden/thema's** van TMDB (bv. dystopie, stripverhalen): hoe vaak ze voorkomen bij wat je leuk vond, gewogen naar
  hoe onderscheidend ze zijn (een trefwoord dat bijna elke titel heeft, zegt weinig). Productietrefwoorden zoals "sequel" en
  "aftercreditsstinger" tellen niet mee.
- **Regisseur** (bij series de bedenker): van wie je twee "zeker leuk" hebt, telt volledig.
- **Tijdperk** (decennium) en **oorspronkelijke taal**: klein gewicht.

Sinds 8 oktober 2026 leren de kenmerken van twee kanten. Wat je leuk vond telt vóór (favoriet 3, "zeker leuk" 2), wat je
afkeurde telt ertegen: "niet voor mij" even zwaar als een "zeker leuk" (`DISLIKE_AGAINST_WEIGHT` 2), "was oké" voor een
kwart daarvan (`OK_AGAINST_WEIGHT` 0,5) en niet tegen de regisseur (van regisseurs van wie je alleen iets "oké" vond, vond
je de volgende titel vaak wél zeker leuk). Een trefwoord dat even vaak bij je "oké" voorkomt als bij je "zeker leuk" is dan
geen pluspunt meer, en een regisseur van wie je twee titels afkeurde telt volledig negatief. Een titel kan er dus ook punten
door verliezen (tot `-FEATURE_SCORE_CAP`). Zonder afkeuringen en "oké" is de uitkomst precies als voorheen.

Gemeten op twee echte profielen (steeds één beoordeelde titel weglaten en voorspellen; 560 titels): de kans dat een "zeker
leuk" hoger scoort dan een "niet voor mij" ging van 78,8% naar 80,7% (eerste profiel) en van 57,3% naar 73,2% (tweede profiel);
tegenover een "oké" van 69,8% naar 70,9% en van 58,1% naar 59,3%. Voorbeelden: het trefwoord boekverfilmingen
(15 zeker leuk, 20 oké, 2 niet voor mij) zakte van 0,21 naar 0,09 en wordt geen reden meer; stripverhalen bleef sterk. Op
het plafond zaten eerst 103 van de 294 beoordeelde titels, nu 55.

De score (maximaal `FEATURE_SCORE_CAP` erbij of eraf) wordt vermenigvuldigd met `learn`, dus bij een kale start doet dit
niets en worden er ook geen extra TMDB-aanvragen gedaan. De kenmerken staan in de gedeelde cache `tmdb_features_cache`
(30 dagen). Per berekening worden hooguit 120 bronnen (eerst wat je leuk vond, dan je afkeuringen, dan "oké") en 120
kandidaten live opgehaald (`FEATURE_LIVE_SOURCES` en `FEATURE_LIVE_CANDIDATES`, met 12 seconden als limiet); de rest komt
uit de cache en wordt bij een volgende berekening aangevuld. Bij een titel staat soms als eerste reden de regisseur of het
thema.

## Terugzetten naar het oude gedrag

Zet in `lib/recommendationEngine.ts` deze constanten op:

```ts
const COLLAB_MAX_REDUCTION = 0
const EMBEDDING_EXTRA_AT_FULL = 0
const NEIGHBOR_LIKE_WEIGHT = 0
const FOCUSED_GATE_MIN_LEARN = 2   // de poort gaat dan nooit aan
```

Voor alleen de kenmerken (trefwoorden, regisseur, tijdperk, taal): zet `FEATURE_SCORE_CAP` in `lib/titleFeatures.ts` op 0.
Voor alleen het leren van twee kanten (de kenmerken leren dan weer alleen van wat je leuk vond): zet
`DISLIKE_AGAINST_WEIGHT` en `OK_AGAINST_WEIGHT` in `lib/titleFeatures.ts` op 0.
Voor alleen de verhaal-score zonder tegenstelling (wel rond 0): zet `STORY_DISLIKE_MIN` op een heel hoog getal. De oude ruwe
score (met de ~4 basispunten) komt terug door in `computeTasteProfile` `embeddingBonus` weer op `sims[0]` te zetten en het
label weer bij `> 0.5`.

Verhoog daarna het voorvoegsel van de opgeslagen lijsten (`u12` in `app/api/recommendations/route.ts` en `v19` in
`app/api/recommendations-together/route.ts`), zodat alles opnieuw wordt berekend.

## Gemeten

Op het profiel van bvdw2526 (`learn` 1): *Predator: Badlands* ging van rang 47 naar 287 en verdween uit Puur mijn smaak,
omdat de link alleen liep via wat andere kijkers deden. Op een klein profiel (`learn` ongeveer 0,2) veranderde ongeveer 15%
van de lijst. De rekentijd bleef gelijk (ongeveer 23 s met koude cache).
