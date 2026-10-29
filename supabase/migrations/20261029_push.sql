-- Pushmeldingen in de Android- en iPhone-app: de wekelijkse kijktip, partnermeldingen (uitgenodigd, uitnodiging
-- geaccepteerd) en een nieuw seizoen van een serie die je leuk vindt.
--
-- Alleen toevoegen, niets aan bestaande tabellen (zie docs/bevroren-versies.md). Alle drie de tabellen worden alleen
-- door de server gebruikt (service role, zie lib/push.ts en app/api/push); gewone gebruikers lezen of schrijven ze
-- niet rechtstreeks. Bij het verwijderen van een account gaat alles mee via on delete cascade.

-- Het adres van een telefoon voor meldingen (FCM-token bij Android, APNs-token bij iPhone). Een telefoon hoort bij één
-- account tegelijk: logt iemand anders in op dezelfde telefoon, dan verhuist het adres mee.
create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_tokens_user on public.push_tokens (user_id);

-- Welke meldingen iemand wil. Geen rij = alles aan.
create table if not exists public.push_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  weekly boolean not null default true,
  partner boolean not null default true,
  series boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Wat er al verstuurd is, zodat niemand dezelfde melding twee keer krijgt (ook niet als de taak opnieuw draait).
-- kind: 'weekly' (ref = vrijdag van die week), 'partner-invited' / 'partner-accepted' (ref = koppeling), 'series'
-- (ref = serie en seizoen).
create table if not exists public.push_sent (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  ref text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);

alter table public.push_tokens enable row level security;
alter table public.push_settings enable row level security;
alter table public.push_sent enable row level security;

revoke all on public.push_tokens, public.push_settings, public.push_sent from anon, authenticated;
grant all on public.push_tokens, public.push_settings, public.push_sent to service_role;
