-- "Te oud": een knop bij titels van vóór 2000 waarmee je een titel wegzet omdat hij je te oud is. Het is geen
-- beoordeling (telt niet mee voor je smaak), maar we bewaren wel de reden en het jaartal, om te meten hoe vaak het
-- gebeurt en om na een paar keer te kunnen voorstellen oudere titels voortaan weg te laten.
-- Alleen kolommen erbij; bestaande rijen en de bevroren versie (docs/bevroren-versies.md) blijven werken.

-- reden: null = gewoon verborgen, 'te_oud' = weggezet met de knop "Te oud".
alter table hidden_titles add column if not exists reason text;
alter table hidden_titles add column if not exists release_year integer;

-- Je eigen grens ("Niet ouder dan" bij Instellingen): titels van vóór dit jaar komen niet meer in je aanbevelingen.
-- null = geen grens.
alter table profiles add column if not exists min_year integer;
