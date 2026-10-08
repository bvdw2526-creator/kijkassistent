-- Meten of een aanbeveling raak was, ook als iemand de titel eerst op de kijklijst zet en pas later kijkt. Bij het op de
-- kijklijst (of Onze lijst) zetten of favoriet maken vanaf Voor jou bewaren we hetzelfde als ratings.source_info: in welk
-- tabblad de titel stond, het percentage, de redenen en de scores op dat moment. Wordt de titel later vanaf de kijklijst
-- beoordeeld of favoriet gemaakt, dan gaat die informatie mee naar ratings.source_info of favorite_movies.source_info, met
-- "via" (kijklijst of onze lijst) en wanneer hij op de lijst kwam. Alleen voor de beheerder, zonder namen of e-mailadressen.
alter table public.watchlist add column if not exists source_info jsonb;
alter table public.couple_watchlist add column if not exists source_info jsonb;
alter table public.favorite_movies add column if not exists source_info jsonb;

comment on column public.watchlist.source_info is 'Alleen bij toevoegen vanaf Voor jou: tabblad, percentage, redenen en scores op dat moment. Gaat bij beoordelen vanaf de kijklijst mee naar ratings.source_info.';
comment on column public.couple_watchlist.source_info is 'Alleen bij toevoegen vanaf Samen: tabblad, percentage, redenen en scores op dat moment. Gaat bij beoordelen vanaf Onze lijst mee naar ratings.source_info.';
comment on column public.favorite_movies.source_info is 'Alleen bij favoriet maken vanaf Voor jou of de kijklijst: waarom de titel werd aanbevolen (zelfde vorm als ratings.source_info).';
