-- PAS TOEPASSEN BIJ LIVEGANG, samen met de nieuwe teksten op /privacy en /account-verwijderen: verwijderen bewaart
-- vanaf dan eerst het bruikbare deel anoniem (zie 20261015_anonymous_profiles.sql). Tot die tijd belooft de live tekst
-- nog dat er niets achterblijft, dus deze functie niet eerder in de database zetten.
-- Zelfde als in 20260919_delete_my_account.sql, met vooraf het anoniem bewaren.
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

  perform public.anonymize_user(uid);

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
