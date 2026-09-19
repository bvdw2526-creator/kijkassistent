-- Beveiligingsadvies van Supabase: SECURITY DEFINER-functies mogen niet door anon worden
-- aangeroepen via /rest/v1/rpc. handle_new_user en rls_auto_enable zijn trigger-functies en
-- hoeven door niemand via de API te worden uitgevoerd; invite_partner en
-- list_partner_connections blijven alleen voor ingelogde gebruikers.
alter function public.handle_new_user() set search_path = '';

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
revoke execute on function public.invite_partner(text) from public, anon;
revoke execute on function public.list_partner_connections() from public, anon;

-- Indexen op de kolommen waarop steeds per gebruiker wordt gefilterd.
create index if not exists favorite_movies_user_id_idx on public.favorite_movies (user_id);
create index if not exists ratings_user_id_idx on public.ratings (user_id);
create index if not exists watchlist_user_id_idx on public.watchlist (user_id);
create index if not exists partner_connections_partner_id_idx on public.partner_connections (partner_id);
create index if not exists couple_ratings_rated_by_idx on public.couple_ratings (rated_by);
