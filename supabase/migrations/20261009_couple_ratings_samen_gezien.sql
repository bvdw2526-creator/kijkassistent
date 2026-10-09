-- "Samen gezien?" bij Samen: jullie keken de titel samen (zonder hem eerst op Onze lijst te zetten) en geven een oordeel
-- over hoe het samen was: leuk (love), oké (ok) of niet leuk (dislike). Dat is een oordeel voor Samen, geen persoonlijke
-- beoordeling; daarna krijgen jullie allebei het vraagje "wat vond jij er zelf van?" (zie PartnerRated).
alter table public.couple_ratings drop constraint if exists couple_ratings_reason_check;
alter table public.couple_ratings add constraint couple_ratings_reason_check
  check (reason is null or reason in ('niet_voor_ons', 'samen_gezien'));

comment on column public.couple_ratings.reason is 'null = gewone beoordeling (Onze lijst, telt ook persoonlijk); niet_voor_ons = alleen voor Samen afgekeurd; samen_gezien = samen gekeken, oordeel over samen (geen persoonlijke beoordeling).';
