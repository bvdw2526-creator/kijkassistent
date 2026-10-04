// "Wat is er nieuw": de vernieuwingen per update, nieuwste bovenaan. Bij elke update die gebruikers moeten merken
// komt hier een nieuwe regel bij (met een nieuw, oplopend id); de app toont dan eenmalig een kaartje op "Voor jou"
// (zie app/components/WhatsNew.tsx). Houd het kort: een paar regels, in gewone taal, zonder techniek.
export interface Release {
  // Wordt per gebruiker onthouden als "gezien". Gebruik de datum van de update.
  id: string
  date: string
  items: string[]
}

export const RELEASES: Release[] = [
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
