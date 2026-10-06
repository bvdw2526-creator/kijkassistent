# De app leert van jouw smaak

De aanbevelingen leunden vooral op "kijkers vonden ook leuk" (TMDB), dus op wat veel mensen samen kijken. Nu schuift het
gewicht naar jouw eigen smaak naarmate je meer favorieten en beoordelingen hebt. Dit geldt voor alle tabbladen en ook voor
Samen, want Samen rekent met het smaakprofiel van allebei.

## Hoe

In `computeTasteProfile` (`lib/recommendationEngine.ts`) bepaalt `learn` (0 tot 1) hoeveel de app van je geleerd heeft:
aantal favorieten + "zeker leuk" + de helft van "was oké". Bij 5 bronnen of minder is `learn` 0 (alles zoals het was), bij
40 of meer is het 1.

Naarmate `learn` stijgt:
- Wat andere kijkers deden (de kijkerslijsten en "populair in je genres") telt tot 50% minder (`COLLAB_MAX_REDUCTION`).
- De verhaal-overeenkomst met je smaak telt zwaarder: gewicht 2 wordt 6 (`EMBEDDING_EXTRA_AT_FULL`).
- Nieuw: de verhaal-overeenkomst met de dichtstbijzijnde losse titels die je leuk vond (`neighborScore`, gewicht
  `NEIGHBOR_LIKE_WEIGHT`), niet alleen met het gemiddelde.
- Puur mijn smaak: vanaf `learn` 0,5 moet een titel ook echt lijken op iets wat je leuk vond (overeenkomst van minstens
  `FOCUSED_MIN_NEIGHBOR_SIM` met een favoriet) of horen bij een reeks, acteur of regisseur die je zelf koos. Blijven er te
  weinig titels over (`FOCUSED_GATE_MIN_POOL`), dan vervalt die eis.

## Terugzetten naar het oude gedrag

Zet in `lib/recommendationEngine.ts` deze constanten op:

```ts
const COLLAB_MAX_REDUCTION = 0
const EMBEDDING_EXTRA_AT_FULL = 0
const NEIGHBOR_LIKE_WEIGHT = 0
const FOCUSED_GATE_MIN_LEARN = 2   // de poort gaat dan nooit aan
```

Verhoog daarna het voorvoegsel van de opgeslagen lijsten (`u6` in `app/api/recommendations/route.ts` en `v14` in
`app/api/recommendations-together/route.ts`), zodat alles opnieuw wordt berekend.

## Gemeten

Op het profiel van bvdw2526 (`learn` 1): *Predator: Badlands* ging van rang 47 naar 287 en verdween uit Puur mijn smaak,
omdat de link alleen liep via wat andere kijkers deden. Op een klein profiel (`learn` ongeveer 0,2) veranderde ongeveer 15%
van de lijst. De rekentijd bleef gelijk (ongeveer 23 s met koude cache).
