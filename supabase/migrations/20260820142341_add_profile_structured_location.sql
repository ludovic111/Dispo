-- Le libellé historique `neighborhood` reste public et compatible. Ces
-- colonnes donnent au client le contexte nécessaire pour proposer le pays,
-- résoudre un code postal et retrouver le même choix sur un autre appareil.
alter table public.profiles
    add column if not exists country text,
    add column if not exists postal_code text,
    add column if not exists city text;

alter table public.profiles
    drop constraint if exists profiles_country_iso_check;

alter table public.profiles
    add constraint profiles_country_iso_check
    check (country is null or country ~ '^[A-Z]{2}$');

comment on column public.profiles.country is 'Code pays ISO 3166-1 alpha-2 choisi ou détecté par le client.';
comment on column public.profiles.postal_code is 'Code postal saisi par le musicien.';
comment on column public.profiles.city is 'Ville résolue depuis le code postal, modifiable en repli.';
