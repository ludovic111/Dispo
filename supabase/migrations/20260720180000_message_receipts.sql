-- Dispo 0.9.5 — accusés de réception « reçu / lu » sur les messages 1:1.
--
-- Deux horodatages sur `messages` : `delivered_at` (le destinataire a reçu
-- le message sur son appareil) et `read_at` (il a ouvert la conversation).
-- L'écriture passe uniquement par deux RPC SECURITY DEFINER — pas de policy
-- UPDATE sur la table : un client ne peut pas réécrire le texte d'un message
-- ni acquitter ses propres envois. Les UPDATE partent dans la publication
-- realtime déjà en place sur `messages`, donc l'expéditeur voit ses coches
-- passer à « reçu » puis « lu » en direct.

alter table public.messages
  add column delivered_at timestamptz,
  add column read_at timestamptz;

-- Index partiel : les RPC ne balayent que les messages pas encore acquittés.
create index messages_undelivered_idx
  on public.messages (conversation_id)
  where delivered_at is null or read_at is null;

-- Le destinataire vient de recevoir mes messages (appelé au fetch et à
-- l'arrivée d'un message realtime, toutes conversations confondues).
create function public.mark_messages_delivered()
returns void
language sql security definer set search_path = public
as $$
  update public.messages m
  set delivered_at = now()
  from public.conversations c
  where c.id = m.conversation_id
    and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    and m.sender_id <> auth.uid()
    and m.delivered_at is null;
$$;

-- Le destinataire a ouvert la conversation : tout ce qui n'était pas lu
-- passe « lu » (et « reçu » par la même occasion si besoin).
create function public.mark_conversation_read(conv_id uuid)
returns void
language sql security definer set search_path = public
as $$
  update public.messages m
  set delivered_at = coalesce(m.delivered_at, now()),
      read_at = now()
  from public.conversations c
  where m.conversation_id = conv_id
    and c.id = conv_id
    and (c.participant_a = auth.uid() or c.participant_b = auth.uid())
    and m.sender_id <> auth.uid()
    and m.read_at is null;
$$;

-- Connexion obligatoire dans l'app : anon n'appelle jamais ces RPC.
revoke execute on function public.mark_messages_delivered() from anon;
revoke execute on function public.mark_conversation_read(uuid) from anon;
