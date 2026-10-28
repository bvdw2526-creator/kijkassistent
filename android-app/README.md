# Kijkassistent – Android-app (Capacitor)

Deze map bevat de Android-app. De app toont www.kijkassistent.nl in een eigen WebView. Dat is geen TWA meer: de
pagina's draaien in de app zelf en niet in Chrome. De site en de serverroutes blijven op Vercel draaien. Wat je naar
Vercel pusht, staat dus meteen ook in de app.

- Package: `nl.kijkassistent.app` (dezelfde als de oude TWA, dus het is een update van dezelfde Play-app)
- Versie: `versionCode` en `versionName` in `android/app/build.gradle`. Verhoog de `versionCode` bij elke upload.
- Instellingen: `capacitor.config.json` (adres van de site, kleuren, opstartscherm)
- Geen internet: `www/offline.html` (Nederlands en Engels)
- Telefoonfuncties (vanaf 4.2.0): plugins `@capacitor/share` (deelmenu) en `@capacitor/haptics` (korte tik bij
  beoordelen). De site roept ze aan via `lib/native.ts`; zonder de plugin (website, oude app-versie) valt dat terug.
  Op de iPhone kun je vanaf de linkerrand terugvegen (`AppViewController` in `ios/App/App/SceneDelegate.swift`).
- Links naar kijkassistent.nl openen in de app (via `public/.well-known/assetlinks.json`). Links naar andere sites,
  zoals TMDB, trailers en streamingdiensten, openen in de gewone browser.

## Ondertekening

`android/keystore.properties` wijst naar `D:/AI/Kijkassistent/Google V3/signing.keystore`. Dat is dezelfde sleutel als
bij de PWABuilder-versies, en het bestand bevat de wachtwoorden. **Het staat niet in git en mag er ook nooit in**, want
het project is openbaar. Ben je het bestand kwijt? Maak het opnieuw aan met de gegevens uit
`Google V3/signing-key-info.txt`:

```
storeFile=D:/AI/Kijkassistent/Google V3/signing.keystore
storePassword=...
keyAlias=my-key-alias
keyPassword=...
```

## Eenmalig: Android Studio

1. Installeer Android Studio (developer.android.com/studio). Java en de Android SDK zitten erbij.
2. Ga in deze map staan en voer `npm install` uit.

De Gradle-wrapper staat op 9.1.0, omdat de Java van Android Studio (versie 25) niet werkt met de standaard Gradle
8.14 van Capacitor. Zet de wrapper niet terug na een Capacitor-update.

## Een nieuwe versie bouwen

1. Verhoog de `versionCode` in `android/app/build.gradle`. Pas eventueel ook de `versionName` aan.
2. `npm run sync` (zet de instellingen en de offline-pagina in het Android-project)
3. `npm run open` (opent Android Studio)
4. In Android Studio: **Build → Generate Signed App Bundle / APK… → Android App Bundle**. Kies de keystore uit
   `Google V3` (alias `my-key-alias`) en kies **release**.
   Je kunt ook in de map `android` het commando `gradlew.bat bundleRelease` uitvoeren.
5. Het bestand staat daarna in `android/app/build/outputs/bundle/release/app-release.aab`. Upload het in de Play
   Console bij de gesloten test.
6. Staat de nieuwe versie in de Play Store (en voor de iPhone in TestFlight), verhoog dan `LATEST` in
   `app/components/AppUpdateBanner.tsx` en push. Wie een oudere app heeft, krijgt dan een balkje met een knop Updaten.

## Testen op je telefoon

Zet ontwikkelaarsopties en USB-foutopsporing aan op je telefoon. Sluit de telefoon aan en druk in Android Studio op
▶ (Run). Verwijder eerst de oude Kijkassistent-app van de telefoon, want een testversie heeft een andere ondertekening
dan de versie uit de Play Store.

## iOS (iPhone)

Dezelfde app bestaat ook voor de iPhone, in de map `ios`. Hij gebruikt dezelfde `capacitor.config.json` en laadt
dus ook www.kijkassistent.nl. In de user agent staat `KijkassistentApp/iOS`, zodat de site de iPhone-app kan
herkennen (de update-melding voor Android verschijnt daar niet).

- Bundle ID: `nl.kijkassistent.app`
- Versie: `MARKETING_VERSION` (bijv. 4.1.0) en `CURRENT_PROJECT_VERSION` (buildnummer, bij elke upload ophogen) in
  `ios/App/App.xcodeproj/project.pbxproj`
- Alleen iPhone en alleen staand. Hoofdtaal Nederlands, ook Engels.
- Na een wijziging in `capacitor.config.json` of `www`: `npm run sync:ios`
- Bouwen kan alleen met Xcode op een Mac, of in de cloud (bijv. Codemagic of GitHub Actions met een macOS-machine).
- App-icoon en opstartscherm zijn gemaakt uit `app/icon.svg` (vierkant, zonder transparantie; iOS rondt de hoeken zelf af).

### Bouwen in de cloud (zonder Mac)

De workflow `.github/workflows/ios-testflight.yml` bouwt de app op een Mac van GitHub, laat Apple hem ondertekenen
en zet hem in TestFlight. Starten: GitHub → **Actions** → **iOS naar TestFlight** → **Run workflow**. Het duurt
ongeveer 10–15 minuten; daarna verwerkt Apple de build nog 5–30 minuten voor hij in TestFlight staat.

Eenmalig nodig:

1. **App aanmaken** in App Store Connect: Apps → + → Nieuwe app, iOS, naam Kijkassistent, hoofdtaal Nederlands,
   bundel-ID `nl.kijkassistent.app` (staat hij er niet bij: eerst aanmaken bij developer.apple.com → Identifiers).
2. **API-sleutel maken**: App Store Connect → Gebruikers en toegang → Integraties → App Store Connect API →
   Teamsleutels → +. Naam bijv. "GitHub", toegang **Admin** (nodig om in de cloud te ondertekenen). Download het
   `.p8`-bestand (dat kan maar één keer) en bewaar het buiten de repo, bijv. in `D:/AI/Kijkassistent/Apple/`.
3. **Geheimen in GitHub** (repo → Settings → Secrets and variables → Actions → New repository secret):
   - `APPLE_TEAM_ID`: Team ID, te vinden op developer.apple.com → Account → Membership details
   - `APPSTORE_API_KEY_ID`: de Key ID naast de sleutel
   - `APPSTORE_API_ISSUER_ID`: de Issuer ID boven de lijst met sleutels
   - `APPSTORE_API_PRIVATE_KEY`: open het `.p8`-bestand in Kladblok en plak de hele inhoud, inclusief de regels
     `-----BEGIN PRIVATE KEY-----` en `-----END PRIVATE KEY-----`

**Het `.p8`-bestand mag nooit in git**, want het project is openbaar. Geheimen in GitHub zijn veilig: ze zijn niet
zichtbaar in de code of in de logboeken.

Testen: zet in App Store Connect → TestFlight jezelf bij **Interne testers** en installeer de app **TestFlight** op je
iPhone. Interne testers hebben geen beoordeling door Apple nodig.
