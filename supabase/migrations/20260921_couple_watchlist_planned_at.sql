-- Kijkavond plannen: een gezamenlijke titel kan een geplande datum/tijd krijgen. Partners
-- mogen die aanpassen (update), verder niets aan de rij.
alter table public.couple_watchlist add column if not exists planned_at timestamptz;

create policy "Partners passen gezamenlijke watchlist aan" on public.couple_watchlist
  for update to authenticated
  using (exists (
    select 1 from public.partner_connections pc
    where pc.id = connection_id and pc.status = 'accepted'
      and (pc.requester_id = (select auth.uid()) or pc.partner_id = (select auth.uid()))
  ))
  with check (exists (
    select 1 from public.partner_connections pc
    where pc.id = connection_id and pc.status = 'accepted'
      and (pc.requester_id = (select auth.uid()) or pc.partner_id = (select auth.uid()))
  ));
