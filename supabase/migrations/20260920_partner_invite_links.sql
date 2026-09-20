-- Uitnodigingslinks voor Samen: iemand deelt een link (bv. via WhatsApp), de ontvanger opent
-- 'm, maakt zo nodig een account en wordt daarna gekoppeld. Tokens zijn lang, willekeurig,
-- eenmalig bruikbaar en 7 dagen geldig. De tabel is alleen bereikbaar via de functies hieronder.
create table if not exists public.partner_invites (
  token text primary key,
  inviter_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);

create index if not exists partner_invites_inviter_id_idx on public.partner_invites (inviter_id);

alter table public.partner_invites enable row level security;
revoke all on public.partner_invites from anon, authenticated;

-- Maakt een nieuwe link; eerdere ongebruikte links van dezelfde persoon vervallen daarmee.
create or replace function public.create_partner_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  new_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if uid is null then
    raise exception 'Niet ingelogd';
  end if;

  delete from public.partner_invites where inviter_id = uid and used_at is null;
  insert into public.partner_invites (token, inviter_id) values (new_token, uid);
  return new_token;
end;
$$;

-- Laat zien wie uitnodigt (gedeeltelijk afgeschermd e-mailadres). null = ongeldig/verlopen.
create or replace function public.preview_partner_invite(p_token text)
returns text
language sql
security definer
set search_path = ''
as $$
  select left(u.email, 2) || '***' || substring(u.email from position('@' in u.email))
  from public.partner_invites i
  join auth.users u on u.id = i.inviter_id
  where i.token = p_token and i.used_at is null and i.expires_at > now();
$$;

create or replace function public.accept_partner_invite(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  inv record;
begin
  if me is null then
    raise exception 'Niet ingelogd';
  end if;

  select * into inv from public.partner_invites where token = p_token for update;
  if not found or inv.used_at is not null or inv.expires_at < now() then
    raise exception 'Deze uitnodiging is niet meer geldig';
  end if;
  if inv.inviter_id = me then
    raise exception 'Je kunt je eigen uitnodiging niet accepteren';
  end if;

  -- Samen werkt met één partner tegelijk: al gekoppeld aan een ander blokkeert de koppeling.
  if exists (
    select 1 from public.partner_connections
    where status = 'accepted'
      and (requester_id in (me, inv.inviter_id) or partner_id in (me, inv.inviter_id))
      and not (
        (requester_id = inv.inviter_id and partner_id = me) or (requester_id = me and partner_id = inv.inviter_id)
      )
  ) then
    raise exception 'Een van jullie is al gekoppeld aan iemand anders. Verwijder eerst de bestaande koppeling bij Instellingen.';
  end if;

  update public.partner_connections
    set status = 'accepted', responded_at = now()
    where (requester_id = inv.inviter_id and partner_id = me) or (requester_id = me and partner_id = inv.inviter_id);
  if not found then
    insert into public.partner_connections (requester_id, partner_id, status, responded_at)
    values (inv.inviter_id, me, 'accepted', now());
  end if;

  update public.partner_invites set used_by = me, used_at = now() where token = p_token;
end;
$$;

revoke all on function public.create_partner_invite() from public, anon;
revoke all on function public.accept_partner_invite(text) from public, anon;
revoke all on function public.preview_partner_invite(text) from public;
grant execute on function public.create_partner_invite() to authenticated;
grant execute on function public.accept_partner_invite(text) to authenticated;
grant execute on function public.preview_partner_invite(text) to anon, authenticated;
