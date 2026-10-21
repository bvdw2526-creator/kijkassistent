// "Wat is er nieuw": de vernieuwingen per update, nieuwste bovenaan. Bij elke update die gebruikers moeten merken
// komt hier een nieuwe regel bij (met een nieuw, oplopend id); de app toont dan eenmalig een kaartje op "Voor jou"
// (zie app/components/WhatsNew.tsx). Houd het kort: een paar regels, in gewone taal, zonder techniek.
export interface Release {
  // Wordt per gebruiker onthouden als "gezien". Gebruik de datum van de update.
  id: string
  date: string
  items: string[]
  // Dezelfde regels in het Engels; zonder deze toont de Engelse app de Nederlandse. De datum maakt de app uit het id.
  itemsEn?: string[]
}

export const RELEASES: Release[] = [
  {
    id: '2026-10-21',
    date: '21 oktober 2026',
    items: [
      'Als je een film of serie opent, zie je nu ook hoe lang hij duurt. Bij series staan het aantal seizoenen en afleveringen erbij, hoe lang een aflevering ongeveer is en of de serie al afgelopen is.',
      'Je ziet ook wie de film regisseerde of de serie bedacht, en wie de hoofdrollen spelen. Tik op een naam voor alle films en series van die persoon.',
    ],
    itemsEn: [
      "When you open a film or series, you now also see how long it is. For series you'll see the number of seasons and episodes, roughly how long an episode is, and whether the series has ended.",
      'You also see who directed the film or created the series, and who plays the lead roles. Tap a name for all films and series by that person.',
    ],
  },
  {
    id: '2026-10-19',
    date: '19 oktober 2026',
    items: [
      "Nieuwe skin voor boekenliefhebbers: de Boekenclub. Zet hem aan bij Instellingen onder 'Uiterlijk' en je krijgt bovenaan Voor jou een rij boekverfilmingen op jouw diensten. Ook in je gewone advies komen boekverfilmingen dan vaker voor, en bij Zoeken staan alle boekverfilmingen vooraan.",
    ],
    itemsEn: [
      "A new skin for book lovers: the Book Club. Turn it on in Settings under 'Appearance' and you'll get a row of book adaptations on your services at the top of For you. Book adaptations will also show up more often in your regular recommendations, and Search opens on all book adaptations.",
    ],
  },
  {
    // Tweede update op dezelfde dag: een nieuw id, zodat ook wie de eerste al zag het kaartje nog een keer krijgt.
    id: '2026-10-18b',
    date: '18 oktober 2026',
    items: [
      "Kijkassistent is er nu ook in het Engels. Kies je taal bij Instellingen onder 'Uiterlijk'. Je keuze geldt ook voor de wekelijkse tipsmail.",
    ],
    itemsEn: [
      "Kijkassistent is now also available in English. Choose your language in Settings under 'Appearance'. Your choice also applies to the weekly tips email.",
    ],
  },
  {
    id: '2026-10-18',
    itemsEn: [
      "Book adaptations now show which book they're based on and who wrote it, for example 'Dune' by Frank Herbert. Tap it to read more about the book on Wikipedia.",
    ],
    date: '18 oktober 2026',
    items: [
      "Bij een boekverfilming zie je nu ook welk boek het is en wie het schreef, bijvoorbeeld 'Duin' van Frank Herbert. Tik erop om meer over het boek te lezen op Wikipedia.",
    ],
  },
  {
    id: '2026-10-13',
    itemsEn: [
      "On Halloween itself (31 October), with the Halloween skin on, For you and Together only show Halloween films and series, including genres you normally exclude. The next day your usual recommendations are back.",
      "That day there's also a row of Halloween classics, such as Halloween and Hocus Pocus. If a film isn't on your services, you'll see where you can watch it.",
      "'Scary' in the Halloween row has become scarier: ghosts, possession and slashers instead of action films with a touch of horror.",
    ],
    date: '13 oktober 2026',
    items: [
      'Op Halloween zelf (31 oktober) staan er met de Halloween-skin aan alleen Halloween-films en -series op Voor jou en bij Samen, ook uit genres die je anders uitsluit. De dag erna staat je gewone advies er weer.',
      "Die dag is er ook een rij Halloween-klassiekers, zoals Halloween en Hocus Pocus. Staat een film niet op jouw diensten, dan zie je waar je hem wel kunt kijken.",
      "'Griezelig' in de Halloween-rij is enger geworden: spoken, bezetenheid en slashers in plaats van actiefilms met een horrorrandje.",
    ],
  },
  {
    // Tweede update op dezelfde dag: een nieuw id, zodat ook wie de eerste al zag het kaartje nog een keer krijgt.
    id: '2026-10-12b',
    itemsEn: [
      "Halloween: turn on the Halloween skin in Settings under 'Appearance' and until 1 November you'll get a row of Halloween films on For you, scary or cosy creepy. Together shows what suits you both.",
      "The app now finds films and series for the themes you love most, such as time travel, boxing or spies.",
      "For you now opens on Just my taste.",
      "On a laptop or computer the app is wider, with more films and series side by side.",
    ],
    date: '12 oktober 2026',
    items: [
      "Halloween: zet bij Instellingen onder 'Uiterlijk' de Halloween-skin aan en je krijgt tot en met 1 november een rij Halloween-films op Voor jou, griezelig of gezellig eng. Bij Samen staat wat bij jullie allebei past.",
      "De app zoekt nu zelf films en series bij de thema's waar je het meest van houdt, zoals tijdreizen, boksen of spionnen.",
      'Voor jou opent voortaan op Puur mijn smaak.',
      'Op een laptop of computer is de app breder, met meer films en series naast elkaar.',
    ],
  },
  {
    id: '2026-10-11',
    itemsEn: [
      "New: the 'Too old' button on films and series from before 2000. It removes a title without counting as a rating. After a few times, the app asks whether older titles may be left out from now on.",
      "In Settings you can choose your own limit under 'Not older than'.",
      "Choose your own look in Settings under 'Appearance': Halloween, Doomsday, Dune or Matrix.",
      "A director only counts in your recommendations once you loved two or more of their films.",
    ],
    date: '11 oktober 2026',
    items: [
      "Nieuw: de knop 'Te oud' bij films en series van vóór 2000. Daarmee zet je een titel weg zonder dat het als beoordeling telt. Na een paar keer vraagt de app of oudere titels voortaan weg mogen.",
      "Bij Instellingen kun je zelf een grens kiezen onder 'Niet ouder dan'.",
      "Kies je eigen uiterlijk bij Instellingen onder 'Uiterlijk': Halloween, Doomsday, Dune of Matrix.",
      'Een regisseur telt pas mee in je aanbevelingen als je twee of meer van zijn of haar films zeker leuk vond.',
    ],
  },
  {
    id: '2026-10-08',
    itemsEn: [
      "Your favourites now weigh the most in your recommendations.",
      "The app now also learns from what you found 'OK' and 'not for me': themes and directors you often dislike count less.",
      "The match percentage is fairer: a title that only fits you moderately now gets a lower percentage too.",
    ],
    date: '8 oktober 2026',
    items: [
      'Je favorieten wegen nu het zwaarst mee in je aanbevelingen.',
      "De app leert nu ook van wat je 'oké' en 'niet voor mij' vond: thema's en regisseurs die je vaak afkeurt, tellen minder mee.",
      'Het matchpercentage is eerlijker: een titel die maar matig bij je past, krijgt nu ook een lager percentage.',
    ],
  },
  {
    id: '2026-10-06',
    date: '6 oktober 2026',
    items: ['Het aanbevelingsalgoritme is aangepast en sluit nu beter aan bij wat jij kijkt.'],
  },
  {
    id: '2026-10-05b',
    date: '5 oktober 2026',
    items: ['De aanbevelingen bij Samen zijn verbeterd: films en series die jullie allebei leuk vinden worden nu beter herkend.'],
  },
  {
    id: '2026-10-05',
    date: '5 oktober 2026',
    items: [
      'Nieuw bij jouw series: bovenaan Voor jou zie je wanneer een serie die je leuk vindt terugkomt met een nieuw seizoen.',
      'Titels die er sinds je vorige bezoek bij zijn gekomen, hebben nu het label Nieuw.',
    ],
  },
  {
    id: '2026-10-04',
    date: '4 oktober 2026',
    items: [
      'Bij Puur mijn smaak staan nu veel meer films en series. We kijken eerst wat er op jouw streamingdiensten te zien is.',
      'Op de kaart staat nu het jaartal van de film of serie.',
      'Je kunt de trailer bekijken: je vindt hem in de popup onder de kijkinfo.',
      'Wil je een titel niet zien (bijvoorbeeld omdat de film te oud is)? Kies Verbergen. Bij Verbergen wordt er geen beoordeling gekoppeld. Het beheren van verborgen titels kan via Instellingen.',
    ],
  },
  {
    id: '2026-10-03',
    date: '3 oktober 2026',
    items: [
      'Je "niet voor mij" beoordeling telt nu zwaarder mee in je aanbevelingen, ook bij samen.',
      'Een film die je net beoordeeld hebt komt niet meer terug bij het vernieuwen.',
      'De terugknop sluit eerst een pop-up, in plaats van de app.',
      'Bij zoeken → Boeken zie je alleen wat je nog niet hebt beoordeeld.',
      'Nieuw bij films: een link naar de soundtrack en een Wikipedia-link bij waargebeurde verhalen.',
    ],
  },
]

export const LATEST_RELEASE = RELEASES[0]
