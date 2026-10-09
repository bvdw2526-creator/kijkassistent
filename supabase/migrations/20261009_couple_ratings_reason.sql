-- "Niet voor ons" bij Samen: een titel die niet bij jullie samen past (bijvoorbeeld omdat je partner hem niet zou willen
-- zien), zonder dat het een beoordeling van jezelf is. Zo'n regel heeft rating 'dislike' en reason 'niet_voor_ons'; hij
-- haalt de titel uit Samen en telt mee als iets wat jullie samen afkeurden, maar er komt géén persoonlijke beoordeling bij
-- en je partner krijgt er geen "wat vond jij ervan?"-vraagje over. Leeg (null) = de gewone beoordeling bij Samen, die ook
-- als persoonlijke beoordeling meetelt.
alter table public.couple_ratings add column if not exists reason text;
alter table public.couple_ratings drop constraint if exists couple_ratings_reason_check;
alter table public.couple_ratings add constraint couple_ratings_reason_check check (reason is null or reason = 'niet_voor_ons');

comment on column public.couple_ratings.reason is 'null = gewone beoordeling bij Samen (telt ook persoonlijk); niet_voor_ons = alleen voor Samen afgekeurd, telt niet voor de eigen smaak.';
