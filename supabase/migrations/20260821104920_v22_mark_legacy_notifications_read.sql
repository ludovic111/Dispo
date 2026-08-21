-- Le centre apparaît en 2.2 : les pushes déjà livrés avant sa mise en ligne
-- ne doivent pas créer d'un coup une puce de plusieurs dizaines d'alertes.
update public.push_notifications
set read_at = coalesce(sent_at, created_at)
where read_at is null
  and created_at < '2026-08-21T10:48:39Z'::timestamptz;
