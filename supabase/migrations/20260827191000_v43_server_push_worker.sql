-- Dispo 2.4 / v43 — livraison push serveur pour les files durables.
--
-- Le token du worker est genere dans Vault lors de la migration et n'est
-- jamais inscrit dans Git, cron.job ou les logs applicatifs. Seule l'URL
-- publique du projet doit etre ajoutee manuellement dans Vault sous le nom
-- `dispo_project_url`. Sans URL valide, le job est un no-op fail-closed.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Un compte ne peut pas multiplier les appels APNs/FCM en enregistrant une
-- quantite arbitraire de pseudo-appareils. Les CHECK couvrent aussi UPDATE,
-- tandis que le trigger de claim serialise INSERT/transfert et limite a 10.
alter table public.push_devices
  drop constraint if exists push_devices_token_check;
alter table public.push_devices
  add constraint push_devices_token_check
  check (length(token) between 16 and 256);

alter table public.push_devices
  drop constraint if exists push_devices_token_format_check;
alter table public.push_devices
  add constraint push_devices_token_format_check
  check (
    (
      platform = 'ios'
      and token ~ '^[0-9a-f]+$'
      and length(token) between 32 and 256
      and length(token) % 2 = 0
    )
    or (
      platform = 'android'
      and token ~ '^[A-Za-z0-9_-]+$'
      and length(token) between 16 and 256
    )
  );

create or replace function public.claim_push_device_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_has_owner boolean;
  v_device_count integer;
  v_evicted_device_id uuid;
begin
  if new.user_id is distinct from (select auth.uid()) then
    raise exception 'push_device_user_mismatch' using errcode = '42501';
  end if;
  if not (
    (
      new.platform = 'ios'
      and new.token ~ '^[0-9a-f]+$'
      and length(new.token) between 32 and 256
      and length(new.token) % 2 = 0
    )
    or (
      new.platform = 'android'
      and new.token ~ '^[A-Za-z0-9_-]+$'
      and length(new.token) between 16 and 256
    )
  ) then
    raise exception 'invalid_push_device_token' using errcode = '22023';
  end if;

  -- Ordre uniforme pour eviter les interblocages entre inscriptions et
  -- transferts concurrents : quota du compte cible, puis token reclame.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('push-quota:' || new.user_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('push-token:' || new.token, 0)
  );

  select d.user_id into v_owner
  from public.push_devices d
  where d.token = new.token
  for update;
  v_has_owner := found;

  -- L'upsert du meme appareil actualise last_seen/app_version meme au plafond.
  if v_has_owner and v_owner = new.user_id then
    return new;
  end if;

  select count(*)::integer into v_device_count
  from public.push_devices d
  where d.user_id = new.user_id;
  if v_device_count >= 10 then
    select d.id into v_evicted_device_id
    from public.push_devices d
    where d.user_id = new.user_id
    order by d.last_seen_at, d.id
    limit 1
    for update;

    if v_evicted_device_id is null then
      raise exception 'push_device_quota_invariant' using errcode = '23514';
    end if;
    delete from public.push_devices d
    where d.id = v_evicted_device_id;
  end if;

  -- Le token courant gagne toujours. Cela evite qu'un ancien compte continue
  -- a recevoir ses alertes privees apres un changement de session sur le meme
  -- appareil, meme si le compte cible avait deja dix appareils.
  if v_has_owner then
    delete from public.push_devices d
    where d.token = new.token and d.user_id = v_owner;
  end if;
  return new;
end;
$$;

revoke all on function public.claim_push_device_token()
  from public, anon, authenticated;

-- Chaque invocation reserve atomiquement son lot avant de contacter APNs/FCM.
-- La lease evite qu'un cron et un appel client livrent la meme ligne en meme
-- temps. Elle expire apres dix minutes, au-dela du wall-clock Edge maximal,
-- afin qu'un worker interrompu ne bloque
-- jamais definitivement la file.
alter table public.push_notifications
  add column if not exists delivery_claim_id uuid,
  add column if not exists delivery_claimed_at timestamptz;

alter table public.push_notifications
  drop constraint if exists push_notifications_delivery_claim_pair;
alter table public.push_notifications
  add constraint push_notifications_delivery_claim_pair
  check (
    (delivery_claim_id is null and delivery_claimed_at is null)
    or (delivery_claim_id is not null and delivery_claimed_at is not null)
  );

create index if not exists push_notifications_worker_pending_idx
  on public.push_notifications (created_at, id)
  where sent_at is null and attempts < 3;

-- Les anciennes fonctions de reouverture d'une notification remettent deja
-- attempts a zero. Ce trigger rend aussi cette operation compatible avec les
-- leases sans devoir reecrire tous les producteurs historiques.
create or replace function private.clear_push_claim_on_retry_reset()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.attempts = 0 then
    new.delivery_claim_id := null;
    new.delivery_claimed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function private.clear_push_claim_on_retry_reset()
  from public, anon, authenticated;

drop trigger if exists push_notifications_clear_claim_on_retry_reset
  on public.push_notifications;
create trigger push_notifications_clear_claim_on_retry_reset
before update of attempts on public.push_notifications
for each row
when (new.attempts = 0)
execute function private.clear_push_claim_on_retry_reset();

-- Une alerte deja consultee dans le centre n'a plus a interrompre la personne
-- sur son ecran verrouille. Elle reste dans l'historique, sans faux sent_at.
update public.push_notifications
set attempts = 3,
    failed_at = clock_timestamp(),
    last_error = 'read_before_delivery',
    delivery_claim_id = null,
    delivery_claimed_at = null
where sent_at is null
  and attempts < 3
  and read_at is not null;

-- Avant le premier cron, l'ancien backlog hors de la fenetre historique des
-- appels client est terminalise. Les lignes restent visibles dans le centre
-- in-app et les SOS v42 tout juste crees sont preserves.
update public.push_notifications
set attempts = 3,
    failed_at = clock_timestamp(),
    last_error = 'expired_before_server_worker',
    delivery_claim_id = null,
    delivery_claimed_at = null
where sent_at is null
  and attempts < 3
  and created_at < clock_timestamp() - interval '15 minutes';

create or replace function private.expire_undeliverable_push_notifications(
  p_now timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with terminalized as (
    update public.push_notifications pn
    set attempts = 3,
        failed_at = p_now,
        last_error = case
          when pn.read_at is not null then 'read_before_delivery'
          else 'delivery_window_expired'
        end,
        delivery_claim_id = null,
        delivery_claimed_at = null
    where pn.sent_at is null
      and pn.attempts < 3
      and (
        pn.read_at is not null
        or pn.created_at < p_now - interval '24 hours'
      )
    returning 1
  )
  select count(*)::integer into v_count from terminalized;

  -- Si le runtime tombe apres le troisieme begin mais avant sa finalisation,
  -- la ligne est deja terminale par attempts=3. La lease active est conservee
  -- dix minutes pour laisser l'Edge finir, puis nettoyee sans nouvel envoi.
  update public.push_notifications pn
  set failed_at = coalesce(pn.failed_at, p_now),
      last_error = coalesce(
        nullif(pn.last_error, ''), 'delivery_attempt_interrupted'
      ),
      delivery_claim_id = null,
      delivery_claimed_at = null
  where pn.sent_at is null
    and pn.attempts >= 3
    and pn.delivery_claimed_at < p_now - interval '10 minutes';

  return v_count;
end;
$$;

revoke all on function private.expire_undeliverable_push_notifications(
  timestamptz
) from public, anon, authenticated;

create or replace function public.claim_pending_push_notifications(
  p_claim_id uuid,
  p_actor_id uuid,
  p_created_since timestamptz,
  p_limit integer default 100
)
returns table (
  id uuid,
  user_id uuid,
  category text,
  title text,
  body text,
  data jsonb,
  attempts integer,
  created_at timestamptz,
  delivery_claim_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed_at timestamptz := clock_timestamp();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 10);
begin
  if p_claim_id is null then
    raise exception 'invalid_claim_id' using errcode = '22023';
  end if;

  perform private.expire_undeliverable_push_notifications(v_claimed_at);

  return query
  with candidates as materialized (
    select pn.id
    from public.push_notifications pn
    where pn.sent_at is null
      and pn.attempts < 3
      and (
        pn.delivery_claimed_at is null
        or pn.delivery_claimed_at < v_claimed_at - interval '10 minutes'
      )
      and pn.created_at >= v_claimed_at - interval '24 hours'
      and (p_actor_id is null or pn.actor_id = p_actor_id)
      and (p_created_since is null or pn.created_at >= p_created_since)
    order by pn.created_at, pn.id
    for update of pn skip locked
    limit v_limit
  ), claimed as (
    update public.push_notifications pn
    set delivery_claim_id = p_claim_id,
        delivery_claimed_at = v_claimed_at
    from candidates c
    where pn.id = c.id
    returning
      pn.id,
      pn.user_id,
      pn.category,
      pn.title,
      pn.body,
      pn.data,
      pn.attempts,
      pn.delivery_claim_id,
      pn.created_at
  )
  select
    c.id,
    c.user_id,
    c.category,
    c.title,
    c.body,
    c.data,
    c.attempts,
    c.created_at,
    c.delivery_claim_id
  from claimed c
  order by c.created_at, c.id;
end;
$$;

revoke all on function public.claim_pending_push_notifications(
  uuid, uuid, timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.claim_pending_push_notifications(
  uuid, uuid, timestamptz, integer
) to service_role;

-- L'essai n'est consomme qu'au moment ou l'Edge va contacter le premier
-- fournisseur. Un timeout au milieu d'un batch n'epuise ainsi jamais les
-- notifications que la boucle n'a pas encore commencees.
create or replace function public.begin_push_notification_attempt(
  p_notification_id uuid,
  p_claim_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_notification_id is null or p_claim_id is null then
    raise exception 'invalid_claim' using errcode = '22023';
  end if;

  update public.push_notifications pn
  set attempts = pn.attempts + 1
  where pn.id = p_notification_id
    and pn.delivery_claim_id = p_claim_id
    and pn.sent_at is null
    and pn.attempts < 3
    and pn.read_at is null
    and pn.created_at >= v_now - interval '24 hours'
    and pn.delivery_claimed_at >= v_now - interval '10 minutes'
  returning pn.attempts into v_attempts;
  return v_attempts;
end;
$$;

revoke all on function public.begin_push_notification_attempt(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.begin_push_notification_attempt(uuid, uuid)
  to service_role;

-- Une erreur de preparation (lecture appareils/badge) ou de finalisation rend
-- les leases encore possedees par ce lot. Une notification deja finalisee ne
-- correspond plus, et un essai commence conserve son compteur atomique.
create or replace function public.release_push_notification_claim(
  p_claim_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_claim_id is null then
    raise exception 'invalid_claim_id' using errcode = '22023';
  end if;

  with released as (
    update public.push_notifications pn
    set delivery_claim_id = null,
        delivery_claimed_at = null
    where pn.sent_at is null
      and pn.delivery_claim_id = p_claim_id
    returning 1
  )
  select count(*)::integer into v_count from released;
  return v_count;
end;
$$;

revoke all on function public.release_push_notification_claim(uuid)
  from public, anon, authenticated;
grant execute on function public.release_push_notification_claim(uuid)
  to service_role;

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets s
    where s.name = 'dispo_push_worker_token'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'dispo_push_worker_token',
      'Jeton interne genere pour le worker push Dispo; ne pas copier hors Vault.'
    );
  end if;
end;
$$;

-- L'Edge Function appelle cette RPC avec son client service-role. Le token
-- reste l'unique preuve du cron : connaitre l'URL publique ne donne aucun
-- acces au worker. Les deux empreintes ont une taille fixe avant comparaison.
create or replace function public.verify_push_worker_token(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_token ~ '^[0-9a-f]{64}$'
    and extensions.digest(p_token, 'sha256') = (
      select extensions.digest(s.decrypted_secret, 'sha256')
      from vault.decrypted_secrets s
      where s.name = 'dispo_push_worker_token'
      order by s.created_at desc, s.id desc
      limit 1
    ),
    false
  );
$$;

revoke all on function public.verify_push_worker_token(text)
  from public, anon, authenticated;
grant execute on function public.verify_push_worker_token(text)
  to service_role;

-- pg_net est asynchrone : cette fonction ne bloque pas le cron pendant la
-- livraison APNs/FCM. Elle ne met en file une requete que si URL et token sont
-- presents, et limite volontairement l'hote aux projets Supabase en HTTPS.
create or replace function private.invoke_push_worker()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_worker_token text;
  v_request_id bigint;
  v_now timestamptz := clock_timestamp();
begin
  perform private.expire_undeliverable_push_notifications(v_now);

  if not exists (
    select 1
    from public.push_notifications pn
    where pn.sent_at is null
      and pn.attempts < 3
      and pn.read_at is null
      and pn.created_at >= v_now - interval '24 hours'
      and (
        pn.delivery_claimed_at is null
        or pn.delivery_claimed_at < v_now - interval '10 minutes'
      )
  ) then
    return null;
  end if;

  select rtrim(btrim(s.decrypted_secret), '/')
  into v_project_url
  from vault.decrypted_secrets s
  where s.name = 'dispo_project_url'
  order by s.created_at desc, s.id desc
  limit 1;

  select btrim(s.decrypted_secret)
  into v_worker_token
  from vault.decrypted_secrets s
  where s.name = 'dispo_push_worker_token'
  order by s.created_at desc, s.id desc
  limit 1;

  if v_project_url is distinct from
       'https://cghmmpcwqzpjwgnbiuuw.supabase.co'
     or v_worker_token is null
     or v_worker_token !~ '^[0-9a-f]{64}$'
  then
    return null;
  end if;

  select net.http_post(
    url := v_project_url || '/functions/v1/push',
    body := jsonb_build_object('source', 'postgres-cron', 'mode', 'worker'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_worker_token
    ),
    timeout_milliseconds := 120000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.invoke_push_worker()
  from public, anon, authenticated;

-- Un nom stable garantit une seule definition meme si une branche/reprise a
-- deja installe le job. La desinscription et la recreation sont atomiques avec
-- la migration : un echec conserve l'ancien job.
do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select j.jobid
    from cron.job j
    where j.jobname = 'dispo-push-worker-every-minute'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'dispo-push-worker-every-minute',
    '* * * * *',
    'select private.invoke_push_worker();'
  );
end;
$$;
