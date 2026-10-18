-- Taal van de app per account (Nederlands of Engels), zodat de wekelijkse tipsmail in dezelfde taal gaat en de app op
-- elk apparaat in je eigen taal opent. Leeg = nog niet gekozen: dan Nederlands voor de mail. Alleen een kolom erbij;
-- bestaande rijen en de bevroren versie (docs/bevroren-versies.md) blijven werken.
alter table profiles add column if not exists language text check (language in ('nl', 'en'));
