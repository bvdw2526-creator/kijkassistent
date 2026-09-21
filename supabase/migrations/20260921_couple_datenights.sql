-- Datenight: een van de partners laat de ander kiezen wat jullie gaan kijken (uit de gezamenlijke
-- lijst), eventueel als verrassing. Er is per koppeling hooguit één actieve datenight. De tabel is
-- alleen bereikbaar via de functies hieronder, zodat een verrassingstitel niet uit te lezen is
-- voordat het geplande moment is aangebroken.
--
-- Terugdraaien:
--   drop function if exists public.datenight_state(); drop function if exists public.datenight_request();
--   drop function if exists public.datenight_choose(int, text, text, text, text, boolean, timestamptz);
--   drop function if exists public.datenight_clear(); drop table if exists public.couple_datenights;
create table if not exists public.couple_datenights (
  connection_id uuid primary key references public.partner_connections (id) on delete cascade,
  chooser_id uuid not null references auth.users (id) on delete cascade,
  requested_by uuid not null references auth.users (id) on delete cascade,
  status text not null check (status in ('waiting', 'chosen')),
  tmdb_id int,
  media_type text check (media_type in ('movie', 'tv')),
  title text,
  poster_path text,
  watch_on text,
  surprise boolean not null default false,
  planned_at timestamptz,
  chosen_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.couple_datenights enable row level security;
revoke all on public.couple_datenights from anon, authenticated;

create or replace function public.datenight_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  conn uuid;
  d public.couple_datenights;
  chooser_me boolean;
  revealed boolean;
begin
  if me is null then
    raise exception 'Niet ingelogd';
  end if;
  select id into conn from public.partner_connections
    where status = 'accepted' and (requester_id = me or partner_id = me) limit 1;
  if conn is null then
    return jsonb_build_object('connected', false);
  end if;

  select * into d from public.couple_datenights where connection_id = conn;
  if not found then
    return jsonb_build_object('connected', true, 'status', 'none');
  end if;

  chooser_me := d.chooser_id = me;
  revealed := d.status = 'chosen'
    and (not d.surprise or chooser_me or (d.planned_at is not null and now() >= d.planned_at));

  return jsonb_build_object(
    'connected', true,
    'status', d.status,
    'chooser_is_me', chooser_me,
    'surprise', d.surprise,
    'revealed', revealed,
    'planned_at', d.planned_at,
    'title', case when revealed then d.title end,
    'tmdb_id', case when revealed then d.tmdb_id end,
    'media_type', case when revealed then d.media_type end,
    'poster_path', case when revealed then d.poster_path end,
    'watch_on', case when revealed then d.watch_on end
  );
end;
$$;

-- Laat je partner kiezen. Er kan maar één datenight tegelijk lopen.
create or replace function public.datenight_request()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  conn record;
  other uuid;
  current_status text;
begin
  if me is null then
    raise exception 'Niet ingelogd';
  end if;
  select id, requester_id, partner_id into conn from public.partner_connections
    where status = 'accepted' and (requester_id = me or partner_id = me) limit 1;
  if conn.id is null then
    raise exception 'Geen actieve koppeling gevonden';
  end if;
  other := case when conn.requester_id = me then conn.partner_id else conn.requester_id end;

  select status into current_status from public.couple_datenights where connection_id = conn.id;
  if current_status = 'chosen' then
    raise exception 'Er staat al een datenight klaar. Rond die eerst af.';
  end if;
  if current_status = 'waiting' then
    return;
  end if;

  insert into public.couple_datenights (connection_id, chooser_id, requested_by, status)
    values (conn.id, other, me, 'waiting');
end;
$$;

create or replace function public.datenight_choose(
  p_tmdb_id int, p_media_type text, p_title text, p_poster_path text, p_watch_on text,
  p_surprise boolean, p_planned_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  conn uuid;
  d public.couple_datenights;
begin
  if me is null then
    raise exception 'Niet ingelogd';
  end if;
  select id into conn from public.partner_connections
    where status = 'accepted' and (requester_id = me or partner_id = me) limit 1;
  select * into d from public.couple_datenights where connection_id = conn;
  if not found or d.status <> 'waiting' or d.chooser_id <> me then
    raise exception 'Jij bent nu niet aan de beurt om te kiezen';
  end if;
  if p_surprise and (p_planned_at is null or p_planned_at <= now()) then
    raise exception 'Een verrassing heeft een moment in de toekomst nodig';
  end if;

  update public.couple_datenights
    set status = 'chosen', tmdb_id = p_tmdb_id, media_type = p_media_type, title = p_title,
        poster_path = p_poster_path, watch_on = p_watch_on, surprise = coalesce(p_surprise, false),
        planned_at = p_planned_at, chosen_at = now()
    where connection_id = conn;

  -- Zonder verrassing zet de geplande tijd ook meteen bij de titel op Onze lijst. Bij een
  -- verrassing niet: dan zou de ander in die lijst zien welke titel het is.
  if not coalesce(p_surprise, false) and p_planned_at is not null then
    update public.couple_watchlist set planned_at = p_planned_at
      where connection_id = conn and tmdb_id = p_tmdb_id and media_type = p_media_type;
  end if;
end;
$$;

-- Afronden of annuleren: beide partners mogen de datenight opruimen.
create or replace function public.datenight_clear()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Niet ingelogd';
  end if;
  delete from public.couple_datenights
    where connection_id in (
      select id from public.partner_connections
      where status = 'accepted' and (requester_id = me or partner_id = me)
    );
end;
$$;

revoke all on function public.datenight_state() from public, anon;
revoke all on function public.datenight_request() from public, anon;
revoke all on function public.datenight_choose(int, text, text, text, text, boolean, timestamptz) from public, anon;
revoke all on function public.datenight_clear() from public, anon;
grant execute on function public.datenight_state() to authenticated;
grant execute on function public.datenight_request() to authenticated;
grant execute on function public.datenight_choose(int, text, text, text, text, boolean, timestamptz) to authenticated;
grant execute on function public.datenight_clear() to authenticated;
