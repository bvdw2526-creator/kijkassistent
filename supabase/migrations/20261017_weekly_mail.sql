-- Wekelijkse tipsmail: staat voor iedereen aan (we zijn nog in de testfase), uitzetten kan bij Instellingen of met de
-- afmeldlink in elke mail. Alleen kolommen erbij; bestaande rijen en de bevroren versie (docs/bevroren-versies.md) blijven
-- werken.

-- true = je krijgt de wekelijkse mail met tips.
alter table profiles add column if not exists weekly_mail boolean not null default true;
-- Wanneer de laatste wekelijkse mail ging: voorkomt dat iemand er twee in één week krijgt.
alter table profiles add column if not exists weekly_mail_sent_at timestamptz;
