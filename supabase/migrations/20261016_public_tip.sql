-- De openbare tip-pagina (/tip): iemand zonder account noemt een paar titels en krijgt een advies. Twee dingen erbij,
-- niets aan bestaande tabellen of functies veranderd (zie docs/bevroren-versies.md: database alleen toevoegen).

-- 1. Ratelimiet voor bezoekers zonder account, per sleutel (een gehasht IP-adres) en "bucket". Zelfde opzet als
--    check_rate_limit (20260919_rate_limits.sql), maar zonder auth.uid(). Alleen de server roept hem aan, met de
--    service role-sleutel: anders zou een bezoeker andermans teller kunnen opmaken door een verzonnen sleutel mee te geven.
create table if not exists public.rate_limits_public (
  key text not null,
  bucket text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, bucket, window_start)
);

alter table public.rate_limits_public enable row level security;
revoke all on public.rate_limits_public from anon, authenticated;

create or replace function public.check_rate_limit_public(p_key text, p_bucket text, p_max_calls int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  win timestamptz;
  current_count int;
begin
  if p_key is null or p_key = '' then
    return false;
  end if;

  win := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits_public as r (key, bucket, window_start, count)
    values (p_key, p_bucket, win, 1)
    on conflict (key, bucket, window_start) do update set count = r.count + 1
    returning r.count into current_count;

  -- Af en toe oude vensters opruimen, zodat de tabel niet onbeperkt groeit.
  if random() < 0.01 then
    delete from public.rate_limits_public where window_start < now() - interval '1 day';
  end if;

  return current_count <= p_max_calls;
end;
$$;

revoke all on function public.check_rate_limit_public(text, text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit_public(text, text, int, int) to service_role;

-- 2. De titels die het best passen bij alle meegegeven verhaal-vingerafdrukken tegelijk (title_embeddings_en). Score =
--    gemiddelde gelijkenis + laagste gelijkenis, zodat een titel die op álle genoemde titels lijkt wint van een die alleen
--    heel erg op één lijkt. In één keer in de database, in plaats van alle ~10.000 titels in porties naar de app te halen.
--    Leest alleen openbare gegevens (de vingerafdrukken), dus net als embedding_similarities_en_v2 ook voor anon.
create or replace function public.blend_neighbors_en(
  p_vectors jsonb,
  p_exclude jsonb default '[]'::jsonb,
  p_limit integer default 60
)
returns table(media_type text, tmdb_id integer, score double precision, similarities double precision[])
language sql
stable
security invoker
set search_path = ''
as $$
  with qv as materialized (
    select ord, (v::text)::public.vector as vec
    from jsonb_array_elements(p_vectors) with ordinality as t(v, ord)
    where ord <= 5
  ),
  ex as (
    select (e->>'media_type') as media_type, (e->>'tmdb_id')::integer as tmdb_id
    from jsonb_array_elements(p_exclude) e
  ),
  s as (
    select te.media_type, te.tmdb_id,
           array_agg(1 - (te.embedding OPERATOR(public.<=>) qv.vec) order by qv.ord) as sims
    from public.title_embeddings_en te
    cross join qv
    where not exists (select 1 from ex where ex.media_type = te.media_type and ex.tmdb_id = te.tmdb_id)
    group by te.media_type, te.tmdb_id
  )
  select s.media_type, s.tmdb_id,
         (select avg(x) from unnest(s.sims) x) + (select min(x) from unnest(s.sims) x) as score,
         s.sims
  from s
  where exists (select 1 from qv)
  order by 3 desc
  limit least(greatest(p_limit, 1), 200);
$$;

grant execute on function public.blend_neighbors_en(jsonb, jsonb, integer) to anon, authenticated;
