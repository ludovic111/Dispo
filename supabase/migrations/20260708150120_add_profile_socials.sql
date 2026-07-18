-- Réseaux sociaux du profil, éditables par l'utilisateur et affichés en
-- liens cliquables sur sa page : { "instagram": "pseudo", "tiktok": "…",
-- "youtube": "…", "x": "…" }. Déjà appliqué sur le projet hébergé.
alter table public.profiles
  add column if not exists socials jsonb not null default '{}'::jsonb;
