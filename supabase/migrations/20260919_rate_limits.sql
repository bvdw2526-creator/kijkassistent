-- Vast-venster ratelimiet per gebruiker en "bucket" (bv. 'recommendations'). De tabel is
-- alleen bereikbaar via check_rate_limit (SECURITY DEFINER), nooit rechtstreeks door de
-- client. Geeft false zodra de gebruiker in het huidige venster over p_max_calls heen gaat.
-- De parameters heten p_* omdat "bucket" anders botst met de kolomnaam in de ON CONFLICT.
create table if not exists public.rate_limits (
  user_id uuid not null,
  bucket text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (user_id, bucket, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.check_rate_limit(p_bucket text, p_max_calls int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  win timestamptz;
  current_count int;
begin
  if uid is null then
    return false;
  end if;

  win := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (user_id, bucket, window_start, count)
    values (uid, p_bucket, win, 1)
    on conflict (user_id, bucket, window_start) do update set count = r.count + 1
    returning r.count into current_count;

  -- Af en toe oude vensters opruimen, zodat de tabel niet onbeperkt groeit.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return current_count <= p_max_calls;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public, anon;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;
