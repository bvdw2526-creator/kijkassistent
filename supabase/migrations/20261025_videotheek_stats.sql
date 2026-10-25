-- De trechter van de openbare videotheek (/videotheek): hoeveel bezoekers er per dag komen, hoeveel er een doosje
-- omdraaien en hoeveel er op "account maken" tikken. Aanmeldingen zelf staan al bij het account
-- (auth.users.raw_user_meta_data->>'signup_source' = 'videotheek'); samen geeft dat de hele trechter in het dashboard.
--
-- Alleen aantallen per dag en stap: geen IP-adressen, geen account, niets per persoon. Of een browser vandaag al geteld
-- is, onthoudt de browser zelf (zie app/videotheek/VideotheekStore.tsx), zodat tien keer openen één bezoeker blijft.
-- Tellen gaat alleen via de server (app/api/public-videotheek/count, met ratelimiet), met de service role-sleutel.
--
-- Alleen toevoegen, niets aan bestaande tabellen (zie docs/bevroren-versies.md).
create table if not exists public.videotheek_stats (
  day date not null,
  step text not null check (step in ('bezoek', 'omgedraaid', 'accountklik')),
  n integer not null default 0,
  primary key (day, step)
);

alter table public.videotheek_stats enable row level security;
revoke all on public.videotheek_stats from anon, authenticated;
-- Vanaf 30 okt 2026 krijgen nieuwe tabellen geen automatische rechten meer; de server (en het dashboard) lezen met
-- de service role.
grant select, insert, update, delete on public.videotheek_stats to service_role;

create or replace function public.log_videotheek_step(p_step text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Amsterdam')::date;
begin
  if p_step not in ('bezoek', 'omgedraaid', 'accountklik') then
    return;
  end if;

  insert into public.videotheek_stats (day, step, n)
    values (today, p_step, 1)
    on conflict (day, step) do update set n = public.videotheek_stats.n + 1;
end;
$$;

revoke all on function public.log_videotheek_step(text) from public, anon, authenticated;
grant execute on function public.log_videotheek_step(text) to service_role;

comment on table public.videotheek_stats is 'Openbare videotheek: aantal bezoekers, omgedraaide doosjes en klikken op account maken per dag (alleen aantallen, niets per persoon).';
