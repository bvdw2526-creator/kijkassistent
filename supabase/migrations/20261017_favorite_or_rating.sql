-- Eén oordeel per titel: een favoriet is je hoogste oordeel en heeft geen beoordeling ("zeker leuk", "was oké", "niet voor
-- mij") ernaast. Je laatste keuze telt: favoriet maken haalt de beoordeling weg, een favoriet alsnog beoordelen maakt hem
-- weer gewoon beoordeeld. In de database zelf, zodat het overal geldt (app, Letterboxd-import, starthulp, tipsmail).
-- Alleen functies en triggers erbij; bestaande tabellen blijven zoals ze zijn.

create or replace function public.favorite_replaces_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.ratings
  where user_id = new.user_id and tmdb_id = new.tmdb_id and media_type = new.media_type;
  return new;
end;
$$;

create or replace function public.rating_replaces_favorite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.favorite_movies
  where user_id = new.user_id and tmdb_id = new.tmdb_id and media_type = new.media_type;
  return new;
end;
$$;

drop trigger if exists favorite_replaces_rating on public.favorite_movies;
create trigger favorite_replaces_rating
  after insert on public.favorite_movies
  for each row execute function public.favorite_replaces_rating();

drop trigger if exists rating_replaces_favorite on public.ratings;
create trigger rating_replaces_favorite
  after insert or update of rating on public.ratings
  for each row execute function public.rating_replaces_favorite();

-- Niet aan te roepen via de API; alleen de triggers gebruiken ze.
revoke execute on function public.favorite_replaces_rating() from public, anon, authenticated;
revoke execute on function public.rating_replaces_favorite() from public, anon, authenticated;

-- Opruimen van wat er al dubbel stond (17 okt 2026: 22 titels bij 4 gebruikers, allemaal favoriet + "zeker leuk"): de
-- favoriet blijft, de beoordeling ernaast vervalt. De raak-meter telde zulke titels al alleen als favoriet.
delete from public.ratings r
using public.favorite_movies f
where f.user_id = r.user_id and f.tmdb_id = r.tmdb_id and f.media_type = r.media_type;
