# Matchpercentage: oude en nieuwe berekening

Het percentage op een kaart ("87% match") wordt berekend in `computeTasteProfile` in
`lib/recommendationEngine.ts` (functie `addMatchPercent`). Welke berekening actief is, staat in de constante
`MATCH_PERCENT_METHOD` bovenin dat bestand.

## Terugzetten naar de oude berekening

Zet in `lib/recommendationEngine.ts`:

```ts
export const MATCH_PERCENT_METHOD: MatchPercentMethod = 'relative'
```

Meer is niet nodig. De methode zit in de handtekening van de opgeslagen lijsten (`recommendations_cache` en
`couple_recommendations_cache`), dus bij het wisselen worden alle lijsten één keer opnieuw berekend. De oude code is
niet weggehaald.

## Oud: `'relative'`

- Per tabblad krijgt de titel met de hoogste score altijd 100%; de rest is `score / hoogste score * 100`.
- De score is eerst gedempt met `log2(1 + ruwe score)`, bij "Verras me" bovendien met exponent 0,6.
- Gevolg: de percentages liggen dicht bij elkaar en zijn niet vergelijkbaar tussen tabbladen. Gemeten op een echt
  profiel: gemiddeld 80% bij Puur mijn smaak, 86% bij Mijn smaak breder en 91% bij Verras me, dus het getal wees
  de verkeerde kant op. Bovenaan staat per tabblad altijd een 100%, ook als die titel matig past.

## Nieuw: `'percentile'`

- Eén vaste maatstaf voor alle tabbladen: `coreScore + collectionScore + embeddingBonus * 2 + actorScore +
  directorScore - dislikeScore + discoverScore * 0,4` (de weging van "Puur mijn smaak", dus zonder "oké"-bronnen).
- Het percentage is het aandeel van alle titels die voor deze gebruiker zijn overwogen (de volledige kandidatenpool)
  dat een lagere maatstaf heeft. "80%" betekent dus: beter dan 80% van wat we hebben bekeken. Dat betekent in elk
  tabblad hetzelfde.
- De volgorde binnen een tabblad is ongewijzigd: de hoogste percentages gaan naar de titels met de hoogste eigen
  score van dat tabblad.
- Dit geldt ook voor `allCandidates`, waar Samen op rekent.

Gemeten op hetzelfde profiel (gemiddeld percentage): Puur mijn smaak 88, Mijn smaak breder 88, Verras me 80. Het
bovenste deel van de lijst blijft dicht bij elkaar liggen (de getoonde titels zijn de beste ~5% van de pool).

## Waar op te letten bij het testen

- Samen telt een bonus bij het percentage op voor wat jullie samen waardeerden (`COUPLE_GENRE_BOOST_PER_WEIGHT`, tot
  maximaal 100). Bij hogere percentages bereiken titels dat plafond sneller en lopen ze gelijk.
- Samen blijft het laagste percentage van de twee mensen nemen.
- "Binnenkort"-titels hebben een eigen percentiel (`lib/upcomingTitles.ts`) en tonen geen percentage.
