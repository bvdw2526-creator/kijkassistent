-- "Samen"-aanbevelingen: koppeling tussen twee accounts, met wederzijdse toestemming.
-- Eén rij per koppel-poging. status "pending" -> "accepted" zodra de uitgenodigde
-- persoon reageert; de uitnodiger kan dat nooit voor zichzelf doen (zie policies).
create table if not exists partner_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint partner_connections_not_self check (requester_id <> partner_id),
  unique (requester_id, partner_id)
);

alter table partner_connections enable row level security;

create policy "Involved users can read their connection"
  on partner_connections for select
  using (auth.uid() = requester_id or auth.uid() = partner_id);

-- Alleen de uitgenodigde mag de status bijwerken (accepteren) — zo kan de uitnodiger
-- zichzelf niet stiekem "goedkeuren".
create policy "Invited partner can accept"
  on partner_connections for update
  using (auth.uid() = partner_id)
  with check (auth.uid() = partner_id);

create policy "Involved users can remove their connection"
  on partner_connections for delete
  using (auth.uid() = requester_id or auth.uid() = partner_id);

-- Uitnodigen op e-mailadres: gewone clients mogen het auth-schema niet doorzoeken
-- (RLS/schema-scheiding), dus deze SECURITY DEFINER-functie zoekt het account veilig
-- op en maakt de pending-rij aan namens de aanroeper. Had de ander jou al uitgenodigd,
-- dan wordt die bestaande (omgekeerde) uitnodiging meteen geaccepteerd i.p.v. een
-- tweede rij aan te maken.
create or replace function invite_partner(partner_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  existing_reverse_id uuid;
begin
  select id into target_id from auth.users where email = partner_email;
  if target_id is null then
    raise exception 'Geen account gevonden met dit e-mailadres';
  end if;
  if target_id = auth.uid() then
    raise exception 'Je kunt jezelf niet uitnodigen';
  end if;

  select id into existing_reverse_id
    from partner_connections
    where requester_id = target_id and partner_id = auth.uid();

  if existing_reverse_id is not null then
    update partner_connections
      set status = 'accepted', responded_at = now()
      where id = existing_reverse_id;
    return;
  end if;

  insert into partner_connections (requester_id, partner_id)
  values (auth.uid(), target_id)
  on conflict (requester_id, partner_id) do nothing;
end;
$$;

grant execute on function invite_partner(text) to authenticated;

-- Geeft alle koppel-verzoeken van/aan de aanroeper terug, inclusief het e-mailadres van
-- de andere partij — ook dat mag een gewone client niet zelf opzoeken in auth.users.
create or replace function list_partner_connections()
returns table (
  id uuid,
  other_email text,
  status text,
  direction text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    pc.id,
    case when pc.requester_id = auth.uid() then u_partner.email else u_requester.email end as other_email,
    pc.status,
    case when pc.requester_id = auth.uid() then 'outgoing' else 'incoming' end as direction,
    pc.created_at
  from partner_connections pc
  join auth.users u_requester on u_requester.id = pc.requester_id
  join auth.users u_partner on u_partner.id = pc.partner_id
  where pc.requester_id = auth.uid() or pc.partner_id = auth.uid()
  order by pc.created_at desc;
$$;

grant execute on function list_partner_connections() to authenticated;

-- Zodra een koppeling is geaccepteerd, mag elke partner de smaakgegevens van de ander
-- lezen (nooit schrijven) — nodig om de "Samen"-aanbevelingen te berekenen in
-- app/api/recommendations-together/route.ts. Bestaande select-policies ("auth.uid() =
-- user_id" voor eigen rijen) blijven gewoon staan; dit voegt er alleen een OR-voorwaarde
-- aan toe, dus niets verandert voor wie geen (geaccepteerde) koppeling heeft.
create policy "Accepted partner can read favorite movies"
  on favorite_movies for select
  using (
    exists (
      select 1 from partner_connections pc
      where pc.status = 'accepted'
        and ((pc.requester_id = auth.uid() and pc.partner_id = favorite_movies.user_id)
          or (pc.partner_id = auth.uid() and pc.requester_id = favorite_movies.user_id))
    )
  );

create policy "Accepted partner can read ratings"
  on ratings for select
  using (
    exists (
      select 1 from partner_connections pc
      where pc.status = 'accepted'
        and ((pc.requester_id = auth.uid() and pc.partner_id = ratings.user_id)
          or (pc.partner_id = auth.uid() and pc.requester_id = ratings.user_id))
    )
  );

create policy "Accepted partner can read watchlist"
  on watchlist for select
  using (
    exists (
      select 1 from partner_connections pc
      where pc.status = 'accepted'
        and ((pc.requester_id = auth.uid() and pc.partner_id = watchlist.user_id)
          or (pc.partner_id = auth.uid() and pc.requester_id = watchlist.user_id))
    )
  );

create policy "Accepted partner can read profile"
  on profiles for select
  using (
    exists (
      select 1 from partner_connections pc
      where pc.status = 'accepted'
        and ((pc.requester_id = auth.uid() and pc.partner_id = profiles.id)
          or (pc.partner_id = auth.uid() and pc.requester_id = profiles.id))
    )
  );

create policy "Accepted partner can read favorite people"
  on favorite_people for select
  using (
    exists (
      select 1 from partner_connections pc
      where pc.status = 'accepted'
        and ((pc.requester_id = auth.uid() and pc.partner_id = favorite_people.user_id)
          or (pc.partner_id = auth.uid() and pc.requester_id = favorite_people.user_id))
    )
  );
