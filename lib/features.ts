// Functies die klaar zijn maar bewust nog verborgen blijven. Zet op true om ze weer te tonen.

// Datenight (de partner kiest uit Onze lijst, eventueel als verrassing): verborgen tot er meer
// gebruikers zijn. De database-onderdelen (datenight_*-functies en tabel) blijven bestaan.
export const DATENIGHT_ENABLED = false

// Stemuitslag in de infopopups ("Wat anderen vonden", app/components/CommunityVotes.tsx): verborgen tot er titels zijn
// die de drempel halen (4 nov 2026: 17 stemmers, hoogstens 6 stemmen per titel). Zet dan op true.
export const COMMUNITY_VOTES_ENABLED = false
// Vanaf zoveel stemmen per titel tonen we de percentages; daaronder "Nog weinig stemmen". De database geeft de aantallen
// nooit onder de 5 (zie migratie 20261104_title_vote_summary).
export const COMMUNITY_VOTES_MIN = 20
