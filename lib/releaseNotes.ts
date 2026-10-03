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
    id: '2026-10-03',
    date: '3 oktober 2026',
    items: [
      'Je "niet voor mij" telt nu zwaarder mee in je aanbevelingen, ook bij Samen.',
      'Een film die je net beoordeeld hebt komt niet meer even terug bij het vernieuwen.',
      'De terugknop sluit eerst een pop-up, in plaats van de app.',
      'Bij Zoeken → Boeken zie je alleen wat je nog niet hebt beoordeeld.',
      'Nieuw bij films: een link naar de soundtrack en een Wikipedia-link bij waargebeurde verhalen.',
    ],
  },
]

export const LATEST_RELEASE = RELEASES[0]
