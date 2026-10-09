-- Engelse verhaal-vingerafdrukken naast de Nederlandse. De Nederlandse (titel + NL-samenvatting) bleken te grof: films die
-- niets met elkaar te maken hebben lijken ~0,6 op elkaar, en Secretariat (paardenrennen) leek het meest op Arrow en
-- superheldenfilms. Gemeten op twee echte profielen (9 okt 2026, voyage-4-lite, steeds de titel zelf weggelaten): de kans
-- dat een "zeker leuk" dichter bij iets leuks ligt dan een "niet voor mij" ging met de Engelse samenvatting van 78% naar
-- 81% en van 67% naar 79%. De app schakelt pas om (EMBEDDING_VERSION in lib/recommendationEngine.ts) als deze tabel is
-- opgevuld; tot die tijd blijft alles op title_embeddings draaien.
create table if not exists public.title_embeddings_en (
  media_type text not null,
  tmdb_id integer not null,
  embedding public.vector(1024) not null,
  created_at timestamp without time zone default now(),
  primary key (media_type, tmdb_id)
);
alter table public.title_embeddings_en enable row level security;
create policy "Iedereen mag Engelse embeddings lezen" on public.title_embeddings_en for select using (true);
create policy "Ingelogde gebruikers mogen Engelse embeddings toevoegen" on public.title_embeddings_en
  for insert with check (auth.role() = 'authenticated');

-- De Engelse titel en samenvatting komen uit dezelfde TMDB-aanroep (language=en-US) als de trefwoorden en regisseurs.
alter table public.tmdb_features_cache add column if not exists title_en text;
alter table public.tmdb_features_cache add column if not exists overview_en text;

-- Kopieën van embedding_similarities en embedding_taste_neighbors die op de Engelse tabel werken.
create or replace function public.embedding_similarities_en(
  p_vectors jsonb,
  p_candidates jsonb
)
returns table(media_type text, tmdb_id integer, similarities double precision[])
language sql
stable
security invoker
set search_path = ''
as $$
  with qv as (
    select ord, (v::text)::public.vector as vec
    from jsonb_array_elements(p_vectors) with ordinality as t(v, ord)
  ),
  cand as (
    select (c->>'media_type') as media_type, (c->>'tmdb_id')::integer as tmdb_id
    from jsonb_array_elements(p_candidates) c
  )
  select te.media_type, te.tmdb_id,
         array_agg(1 - (te.embedding OPERATOR(public.<=>) qv.vec) order by qv.ord) as similarities
  from public.title_embeddings_en te
  join cand on cand.media_type = te.media_type and cand.tmdb_id = te.tmdb_id
  cross join qv
  group by te.media_type, te.tmdb_id;
$$;

create or replace function public.embedding_taste_neighbors_en(
  p_candidates jsonb,
  p_rated jsonb,
  p_k integer default 5
)
returns table(media_type text, tmdb_id integer, neighbors jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with rated as materialized (
    select (r->>'verdict') as verdict, te.embedding as emb
    from jsonb_array_elements(p_rated) r
    join public.title_embeddings_en te
      on te.media_type = (r->>'media_type') and te.tmdb_id = (r->>'tmdb_id')::integer
  ),
  cand as (
    select (c->>'media_type') as media_type, (c->>'tmdb_id')::integer as tmdb_id, te.embedding as emb
    from jsonb_array_elements(p_candidates) c
    join public.title_embeddings_en te
      on te.media_type = (c->>'media_type') and te.tmdb_id = (c->>'tmdb_id')::integer
  ),
  sims as (
    select cand.media_type, cand.tmdb_id, r.verdict,
           1 - (r.emb OPERATOR(public.<=>) cand.emb) as sim,
           row_number() over (partition by cand.media_type, cand.tmdb_id order by r.emb OPERATOR(public.<=>) cand.emb) as rn
    from cand cross join rated r
  )
  select s.media_type, s.tmdb_id,
         jsonb_agg(jsonb_build_object('v', s.verdict, 's', s.sim) order by s.sim desc) as neighbors
  from sims s
  where s.rn <= p_k
  group by s.media_type, s.tmdb_id;
$$;

-- Voor het opvullen (beheer): titels met een Nederlandse vingerafdruk die nog geen Engelse hebben.
create or replace function public.titles_missing_english_embedding(p_limit integer default 300)
returns table(media_type text, tmdb_id integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select te.media_type, te.tmdb_id
  from public.title_embeddings te
  where not exists (
    select 1 from public.title_embeddings_en en where en.media_type = te.media_type and en.tmdb_id = te.tmdb_id
  )
  -- Titels waarvan TMDB geen Engelse samenvatting heeft (opgeslagen als lege tekst), kunnen geen Engelse vingerafdruk krijgen.
  and not exists (
    select 1 from public.tmdb_features_cache f
    where f.media_type = te.media_type and f.tmdb_id = te.tmdb_id and f.overview_en = ''
  )
  order by te.created_at desc
  limit p_limit;
$$;

grant execute on function public.embedding_similarities_en(jsonb, jsonb) to anon, authenticated;
grant execute on function public.embedding_taste_neighbors_en(jsonb, jsonb, integer) to anon, authenticated;
grant execute on function public.titles_missing_english_embedding(integer) to authenticated;
