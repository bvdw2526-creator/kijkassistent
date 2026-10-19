# Kijkassistent – Android-app (Capacitor)

Deze map bevat de Android-app. De app toont www.kijkassistent.nl in een eigen WebView. Dat is geen TWA meer: de
pagina's draaien in de app zelf en niet in Chrome. De site en de serverroutes blijven op Vercel draaien. Wat je naar
Vercel pusht, staat dus meteen ook in de app.

- Package: `nl.kijkassistent.app` (dezelfde als de oude TWA, dus het is een update van dezelfde Play-app)
- Versie: `versionCode` en `versionName` in `android/app/build.gradle`. Verhoog de `versionCode` bij elke upload.
- Instellingen: `capacitor.config.json` (adres van de site, kleuren, opstartscherm)
- Geen internet: `www/offline.html` (Nederlands en Engels)
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

## Testen op je telefoon

Zet ontwikkelaarsopties en USB-foutopsporing aan op je telefoon. Sluit de telefoon aan en druk in Android Studio op
▶ (Run). Verwijder eerst de oude Kijkassistent-app van de telefoon, want een testversie heeft een andere ondertekening
dan de versie uit de Play Store.
