-- Bij elk nieuw account gaat er een mailtje naar de beheerder (info@kijkassistent.nl).
-- De database roept daarvoor de route /api/notify-signup aan (via pg_net); die verstuurt de mail.
-- Het gedeelde geheim staat NIET in dit bestand maar in de Supabase Vault, onder de naam
-- "notify_signup_secret" (en hetzelfde geheim staat als NOTIFY_SECRET bij de omgevingsvariabelen van Vercel).
create extension if not exists pg_net;

create or replace function public.notify_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_signup_secret';
  if secret is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://www.kijkassistent.nl/api/notify-signup',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret),
    body := jsonb_build_object(
      'email', new.email,
      'created_at', new.created_at,
      'total', (select count(*) from auth.users)
    )
  );
  return new;
exception when others then
  -- Een mislukte melding mag een aanmelding nooit tegenhouden.
  return new;
end;
$$;

revoke all on function public.notify_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_notify on auth.users;
create trigger on_auth_user_created_notify
  after insert on auth.users
  for each row execute function public.notify_new_user();
