-- Index manquants derrière les RLS et les requêtes fréquentes :
-- conversations.participant_b est interrogé par toutes les policies de
-- messagerie (l'unique (a, b) ne couvre que participant_a en préfixe) et
-- gig_applications.musician_id par le chargement du feed.
create index if not exists conversations_participant_b_idx
  on public.conversations (participant_b);
create index if not exists gig_applications_musician_id_idx
  on public.gig_applications (musician_id);
