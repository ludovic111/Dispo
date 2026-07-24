-- Rôle (instrument) de chaque membre dans un groupe. Le leader l'assigne
-- (policy update leader déjà en place) ; sert à voir « qui joue quoi » et à
-- pré-remplir un SOS de groupe avec les rôles non couverts pour une date.
alter table public.group_members add column if not exists role text;
