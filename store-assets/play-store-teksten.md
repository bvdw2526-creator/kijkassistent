# Play Store: teksten en antwoorden (concept)

Alles hieronder is een voorstel om over te nemen in de Play Console. Controleer bij het invullen de actuele vragen van Google.

## Basis
- **Naam** (max. 30): Kijkassistent
- **Pakketnaam** (kies dit ook in PWABuilder): `nl.kijkassistent.app`
- **Start-URL**: `https://www.kijkassistent.nl/` (let op: mét www, het adres zonder www stuurt door)
- **Privacybeleid-URL**: `https://www.kijkassistent.nl/privacy`
- **URL voor het verwijderen van accounts**: `https://www.kijkassistent.nl/account-verwijderen`
- **Contact-e-mail** (zichtbaar in de winkel): bob@vdwoude.net
- **Categorie**: Entertainment
- **Gratis, geen advertenties, geen aankopen in de app**

## Korte beschrijving (max. 80 tekens, nu 75)
Persoonlijke film- en serietips op jouw streamingdiensten, alleen of samen.

## Volledige beschrijving (max. 4000 tekens)
Weten wat je vanavond gaat kijken. Kijkassistent geeft persoonlijke tips voor films en series, op basis van wat jij mooi vindt, en alleen van wat je ook echt kunt kijken op jouw streamingdiensten.

**Zo werkt het**
Voeg een paar favorieten toe en geef aan wat je van films en series vindt: "zeker meer zoals dit", "was oké" of "niet voor mij". Hoe meer je aangeeft, hoe scherper de tips. Kies zelf hoe breed de tips mogen zijn: alleen wat je echt leuk vindt, wat breder, of laat je verrassen.

**Op jouw streamingdiensten**
Kies je diensten (Netflix, Videoland, Disney+, Prime Video, HBO Max, NPO Start, Pathé Thuis) en zie bij elke tip waar je hem kunt kijken.

**Samen kijken**
Koppel je partner en zie wat jullie allebei leuk zouden vinden, met een gezamenlijke lijst, een kijkavond plannen en een verrassing kiezen voor een datenight. Zie hoe goed jullie smaak overeenkomt.

**En verder**
- Binnenkort: nieuwe films en series die eraan komen.
- Boekverfilmingen: films en series die op een boek gebaseerd zijn.
- Favoriete acteurs en regisseurs, en genres die je liever niet ziet.
- Statistieken over jouw smaak en welke streamingdienst het best bij je past.
- Op de computer: neem je films en beoordelingen over uit Letterboxd.

Je gegevens blijven van jou. Geen advertenties, geen tracking. Je account en al je gegevens verwijder je zelf in de app.

Dit product gebruikt de TMDB API, maar wordt niet gesteund of gecertificeerd door TMDB. Streaminggegevens via JustWatch.

## Schermafbeeldingen (minimaal 2, liever 4 tot 6, telefoon, staand)
Maak ze zelf op je telefoon met je eigen account, dan zien ze er echt uit. Voorstel:
1. Voor jou: de aanbevelingen (Mijn smaak, breder).
2. Een titel met de info en waar je hem kunt kijken.
3. Samen: de tip van vanavond met de smaakmatch.
4. Onze lijst / kijkavond plannen.
5. Binnenkort.
6. Stats.

## Data safety (veiligheid van gegevens): antwoorden om over te nemen
- **Verzamelt de app gegevens?** Ja.
- **Persoonlijke gegevens: e-mailadres.** Verzameld, nodig voor de werking van de app en accountbeheer. Niet gedeeld voor advertenties of marketing.
- **Gebruikers-ID's.** Verzameld voor de werking van de app.
- **Gebruikersinhoud / activiteit in de app:** beoordelingen, favorieten en watchlist. Verzameld voor de werking van de app (aanbevelingen).
- **Zoekopdrachten** worden doorgestuurd naar TMDB om resultaten te tonen; ze worden niet aan je naam of e-mailadres gekoppeld en niet door ons bewaard. Verwerkers die namens ons werken (Supabase, Vercel, TMDB, Voyage AI) tellen bij Google meestal niet als "delen", maar controleer de toelichting in de Console.
- **Versleuteld verzonden?** Ja (https).
- **Kunnen gebruikers verwijdering vragen?** Ja: in de app, en via de webpagina hierboven.
- **Locatie, contacten, foto's, betalingsgegevens, gezondheidsgegevens:** geen.

## Inhoudsclassificatie en doelgroep
- **Doelgroep**: kies 16 jaar en ouder (16-17 en 18+). Kies geen kindergroepen (dan gelden extra Play-regels voor gezinsapps). De privacyverklaring zegt: niet bedoeld voor kinderen jonger dan 16.
- **Vragenlijst (IARC)**: geen geweld, seks of taalgebruik door de app zelf; geen door gebruikers gemaakte inhoud die anderen zien; geen locatiedeling. De app toont wel titels en beschrijvingen van films en series uit een openbare database, en die kunnen volwassen thema's bevatten. Vul dat eerlijk in als de vragenlijst ernaar vraagt.

## Toegang voor Google-reviewers
De app vraagt om in te loggen. Maak een apart testaccount (bijvoorbeeld `review@...`) met een paar favorieten en beoordelingen, en geef het e-mailadres en wachtwoord op bij "App-toegang" in de Play Console.

## Testen
- Gesloten test: minimaal 12 testers met een Google-account, 14 dagen lang (regel voor nieuwe persoonlijke accounts; controleer de actuele regel).
- De `assetlinks.json` in `public/.well-known/` moet de echte SHA-256-vingerafdruk van de Play App Signing-sleutel bevatten (Play Console → Configuratie → App-integriteit). Nu staat er een plaatshouder.
