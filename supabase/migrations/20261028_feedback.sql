-- Feedback uit de app (Instellingen → Over → "Idee of probleem?"): een idee, iets wat niet werkt of een compliment.
-- Insturen gaat alleen via de server (app/api/feedback, met ratelimiet), die ook een mail naar de beheerder stuurt.
-- Gebruikers kunnen hun eigen berichten niet teruglezen; alleen de beheerder leest ze en zet ze op "afgehandeld"
-- (in /beheer). Het e-mailadres wordt meebewaard zodat de beheerder kan antwoorden als dat mag. Bij het verwijderen
-- van een account gaat alles mee via on delete cascade.
--
-- Alleen toevoegen, niets aan bestaande tabellen (zie docs/bevroren-versies.md).
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  kind text not null check (kind in ('idea', 'bug', 'compliment')),
  message text not null check (char_length(message) between 1 and 1000),
  may_contact boolean not null default true,
  locale text,
  platform text,
  app_version text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create index if not exists feedback_created_at on public.feedback (created_at desc);

alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
-- Vanaf 30 okt 2026 krijgen nieuwe tabellen geen automatische rechten meer: hier dus zelf toekennen.
grant select, update on public.feedback to authenticated;
grant select, insert, update, delete on public.feedback to service_role;

create policy "Beheerder mag feedback lezen" on public.feedback
  for select using (public.is_app_admin());

create policy "Beheerder mag feedback afhandelen" on public.feedback
  for update using (public.is_app_admin()) with check (public.is_app_admin());

comment on table public.feedback is 'Feedback uit de app (idee, probleem, compliment); alleen de beheerder leest het, verdwijnt met het account.';
