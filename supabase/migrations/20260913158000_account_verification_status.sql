-- Dispo 2.5 — état de vérification du compte et réglages d'application.
--
-- * `public.app_settings` : réglages pilotés par l'équipe (service_role seul).
--   Aucune policy : ni `anon` ni `authenticated` ne lisent la table ; l'app passe
--   par `get_app_settings()` qui n'expose que des clés en liste blanche.
-- * `get_my_account_status()` : e-mail / téléphone vérifiés (auth.users), numéro
--   masqué, état de modération du profil et exigences de vérification.
-- * Colonnes de modération de `profiles` : ajoutées avec `if not exists` et la
--   même définition que la migration de modération concurrente, pour que les deux
--   s'appliquent dans n'importe quel ordre.

alter table public.profiles
  add column if not exists moderation_status text not null default 'active'
    check (moderation_status in ('active','suspended','banned')),
  add column if not exists suspended_until timestamptz,
  add column if not exists moderation_reason text;

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
comment on table public.app_settings is
  'Réglages d''application pilotés par l''équipe. Scellé : service_role uniquement, lecture client via get_app_settings().';
alter table public.app_settings enable row level security;
revoke all on public.app_settings from public, anon, authenticated;
grant select, insert, update, delete on public.app_settings to service_role;

insert into public.app_settings (key, value) values
  ('require_phone_verification', 'false'::jsonb),
  ('require_email_verification', 'false'::jsonb)
on conflict (key) do nothing;

create or replace function private.app_setting_flag(p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select value = 'true'::jsonb from public.app_settings where key = p_key), false)
$$;
revoke all on function private.app_setting_flag(text) from public, anon, authenticated;

-- Liste blanche : seules ces clés sortent de la table.
create or replace function public.get_app_settings()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'require_phone_verification', private.app_setting_flag('require_phone_verification'),
    'require_email_verification', private.app_setting_flag('require_email_verification')
  )
$$;
revoke all on function public.get_app_settings() from public, anon;
grant execute on function public.get_app_settings() to authenticated;

-- `+41791234512` → `+41 79 *** ** 12` ; null si vide ou trop court pour masquer.
create or replace function private.mask_phone(p_phone text)
returns text language sql immutable set search_path = '' as $$
  select case
    when d = '' or length(d) < 7 then null
    else '+' || substr(d, 1, 2) || ' ' || substr(d, 3, 2) || ' *** ** ' || right(d, 2)
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) s
$$;
revoke all on function private.mask_phone(text) from public, anon, authenticated;

create or replace function public.get_my_account_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'email_verified', u.email_confirmed_at is not null,
    'phone', private.mask_phone(u.phone),
    'phone_verified', u.phone_confirmed_at is not null,
    'moderation_status', coalesce(p.moderation_status, 'active'),
    'suspended_until', p.suspended_until,
    'moderation_reason', p.moderation_reason,
    'require_phone_verification', private.app_setting_flag('require_phone_verification'),
    'require_email_verification', private.app_setting_flag('require_email_verification')
  )
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = (select auth.uid())
$$;
revoke all on function public.get_my_account_status() from public, anon;
grant execute on function public.get_my_account_status() to authenticated;
