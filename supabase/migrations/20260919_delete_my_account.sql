-- Laat een ingelogde gebruiker zijn eigen account en alle bijbehorende gegevens wissen
-- (AVG / Google Play-eis). favorite_movies, ratings, watchlist en profiles verwijzen met
-- NO ACTION en ruimen zichzelf niet op, dus alles wordt hier expliciet en in de juiste
-- volgorde verwijderd. SECURITY DEFINER omdat auth.users niet vanuit de client kan.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Niet ingelogd';
  end if;

  -- Koppelingen (en wat eraan hangt, ook de beoordelingen van de partner in dat koppel).
  delete from public.couple_ratings
    where connection_id in (
      select id from public.partner_connections where requester_id = uid or partner_id = uid
    );
  delete from public.couple_recommendations_cache
    where connection_id in (
      select id from public.partner_connections where requester_id = uid or partner_id = uid
    );
  delete from public.partner_connections where requester_id = uid or partner_id = uid;
  delete from public.couple_ratings where rated_by = uid;

  delete from public.recommendations_cache where user_id = uid;
  delete from public.favorite_people where user_id = uid;
  delete from public.favorite_directors where user_id = uid;
  delete from public.favorite_movies where user_id = uid;
  delete from public.ratings where user_id = uid;
  delete from public.watchlist where user_id = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
