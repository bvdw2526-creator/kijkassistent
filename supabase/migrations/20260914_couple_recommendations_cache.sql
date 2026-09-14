-- Cache voor het complete, berekende "Samen"-resultaat per koppeling — zelfde idee als
-- recommendations_cache (20260910), maar dan voor de gecombineerde aanbeveling van twee
-- partners. Zonder deze cache rekent /api/recommendations-together bij élke aanvraag het
-- complete smaakprofiel van beide partners opnieuw uit (dubbel zo zwaar als de gewone
-- aanbevelingsroute), wat op Vercel's functie-tijdslimiet kan stuklopen.
--
-- "signature" vangt de staat van beide profielen (favorieten/ratings/watchlist/
-- streamingdiensten/uitgesloten genres/favoriete acteurs, via buildProfileSignature) plus
-- de koppel-beoordelingen. Wijzigt daar iets aan bij één van beiden, dan is de cache-rij
-- automatisch ongeldig en wordt er gewoon opnieuw berekend.
create table if not exists couple_recommendations_cache (
  connection_id uuid primary key references partner_connections(id) on delete cascade,
  signature text not null,
  tier text not null,
  items jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now()
);

alter table couple_recommendations_cache enable row level security;

create policy "Connected partners can read couple recommendations cache"
  on couple_recommendations_cache for select
  using (
    exists (
      select 1 from partner_connections pc
      where pc.id = couple_recommendations_cache.connection_id
        and pc.status = 'accepted'
        and (pc.requester_id = auth.uid() or pc.partner_id = auth.uid())
    )
  );

create policy "Connected partners can insert couple recommendations cache"
  on couple_recommendations_cache for insert
  with check (
    exists (
      select 1 from partner_connections pc
      where pc.id = couple_recommendations_cache.connection_id
        and pc.status = 'accepted'
        and (pc.requester_id = auth.uid() or pc.partner_id = auth.uid())
    )
  );

create policy "Connected partners can update couple recommendations cache"
  on couple_recommendations_cache for update
  using (
    exists (
      select 1 from partner_connections pc
      where pc.id = couple_recommendations_cache.connection_id
        and pc.status = 'accepted'
        and (pc.requester_id = auth.uid() or pc.partner_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from partner_connections pc
      where pc.id = couple_recommendations_cache.connection_id
        and pc.status = 'accepted'
        and (pc.requester_id = auth.uid() or pc.partner_id = auth.uid())
    )
  );
