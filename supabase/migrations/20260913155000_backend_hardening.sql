-- Backend hardening (Dispo 2.5).
-- 1. Pin search_path on the legacy SECURITY DEFINER functions (bodies are
--    already schema-qualified; only the config changes).
-- 2. Remove anon from every public table, sequence and function; drop the
--    TRUNCATE/TRIGGER/REFERENCES privileges nobody uses; narrow the
--    authenticated verbs of legacy tables to what their policies allow.
-- 3. Storage: the public read policies dropped in 20260720233000 stay dropped
--    (public buckets serve CDN URLs; listing stays owner-only).
-- 4. follows / collaborations become visible only when the other parties are
--    visible profiles (ready, not blocked, not moderated away).
-- 5. Generous per-user write quotas on the client-writable tables.
-- 6. Edge call budget + RevenueCat replay protection for the edge functions.
-- 7. security_barrier on gig_requests_feed (still security_invoker).
-- Everything is idempotent so a re-run is harmless.

-- ---------------------------------------------------------------------------
-- 1. search_path pins
-- ---------------------------------------------------------------------------
alter function public.accept_gig_application(uuid) set search_path = '';
alter function public.add_leader_as_member() set search_path = '';
alter function public.cockpit_stats() set search_path = '';
alter function public.decline_gig_application(uuid) set search_path = '';
alter function public.handle_new_user() set search_path = '';
alter function public.is_conversation_member(uuid) set search_path = '';
alter function public.is_group_leader(uuid) set search_path = '';
alter function public.is_group_member(uuid) set search_path = '';
alter function public.mark_conversation_read(uuid) set search_path = '';
alter function public.mark_leader_available_on_event() set search_path = '';
alter function public.mark_messages_delivered() set search_path = '';
alter function public.my_event_guests() set search_path = '';
alter function public.profile_public_groups(uuid) set search_path = '';
alter function public.refresh_gig_filled_instruments(uuid) set search_path = '';
alter function public.reopen_gig_application(uuid) set search_path = '';
alter function public.respond_to_direct_gig(uuid, boolean) set search_path = '';
alter function public.viewer_is_pro() set search_path = '';
-- protect_admin_flag is not a definer function but runs inside profile writes;
-- its body only touches NEW/OLD, so an empty search_path is safe too.
alter function public.protect_admin_flag() set search_path = '';

-- ---------------------------------------------------------------------------
-- 2. Privileges
-- ---------------------------------------------------------------------------
-- The mobile client is always authenticated; anon never reads or writes data.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from anon;
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
-- TRUNCATE bypasses row level security and nothing legitimate needs
-- TRIGGER / REFERENCES from the API roles.
revoke truncate, trigger, references on all tables in schema public from authenticated, anon;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from authenticated;

-- Legacy tables were created with GRANT ALL; keep exactly the verbs their
-- policies implement (RLS already denies the rest, this only closes the
-- privilege). Tables with column-scoped grants (messages, group_messages,
-- group_manual_members, push_notifications) are not widened.
revoke update, delete on public.conversations from authenticated;
revoke delete on public.profiles from authenticated;
revoke update on public.gig_applications from authenticated;
revoke update on public.follows from authenticated;
revoke update on public.collaborations from authenticated;
revoke update on public.blocks from authenticated;
revoke update on public.group_docs from authenticated;
revoke update on public.group_invitations from authenticated;
revoke insert, delete on public.push_notifications from authenticated;
revoke update, delete on public.reports from authenticated;
revoke insert, update, delete on public.gig_requests_feed from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Storage read policies
-- ---------------------------------------------------------------------------
-- Both buckets are public (CDN URLs); the API-level SELECT stays owner-only so
-- nobody can enumerate other people's files. Dropping again is a no-op.
drop policy if exists demo_videos_public_read on storage.objects;
drop policy if exists avatars_public_read on storage.objects;

-- ---------------------------------------------------------------------------
-- 4. Profile visibility helper for social edges
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists moderation_status text not null default 'active';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_moderation_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_moderation_status_check
      check (moderation_status in ('active', 'suspended', 'banned'));
  end if;
end $$;

create or replace function private.can_see_profile(p_profile uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select p_profile is not null and (
    p_profile = (select auth.uid())
    or exists (
      select 1
      from public.profiles p
      where p.id = p_profile
        and p.moderation_status = 'active'
        and length(btrim(p.name)) >= 2
        and cardinality(p.instruments) > 0
        and not exists (
          select 1 from public.blocks b
          where (b.blocker_id = (select auth.uid()) and b.blocked_id = p_profile)
             or (b.blocker_id = p_profile and b.blocked_id = (select auth.uid()))
        )
    )
  )
$$;
revoke all on function private.can_see_profile(uuid) from public, anon;
grant execute on function private.can_see_profile(uuid) to authenticated;

drop policy if exists follows_select_authenticated on public.follows;
drop policy if exists follows_select_visible on public.follows;
create policy follows_select_visible on public.follows
  for select to authenticated
  using (
    (select auth.uid()) in (follower_id, following_id)
    or (private.can_see_profile(follower_id) and private.can_see_profile(following_id))
  );

drop policy if exists collaborations_select_authenticated on public.collaborations;
drop policy if exists collaborations_select_visible on public.collaborations;
create policy collaborations_select_visible on public.collaborations
  for select to authenticated
  using (
    (select auth.uid()) in (a_id, b_id)
    or (private.can_see_profile(a_id) and private.can_see_profile(b_id))
  );

-- ---------------------------------------------------------------------------
-- 5. Per-user write quotas
-- ---------------------------------------------------------------------------
-- Generic BEFORE INSERT trigger: tg_argv = (owner column, limit, window).
-- Applies only when the row is written by its owner (auth.uid()); rows a
-- server function creates on someone's behalf (auto-SOS, guest responses)
-- are not throttled. Counting under an advisory lock keeps concurrent
-- inserts honest. Deleted rows still count where the table keeps them.
create or replace function private.enforce_write_quota()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_limit int := tg_argv[1]::int;
  v_window interval := tg_argv[2]::interval;
  v_count bigint;
begin
  v_owner := (to_jsonb(new) ->> tg_argv[0])::uuid;
  if v_owner is null or v_owner is distinct from (select auth.uid()) then
    return new;
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(tg_table_schema || '.' || tg_table_name || ':' || v_owner::text, 36002)
  );
  execute format(
    'select count(*) from %I.%I where %I = $1 and created_at > now() - $2',
    tg_table_schema, tg_table_name, tg_argv[0]
  ) into v_count using v_owner, v_window;
  if v_count >= v_limit then
    raise exception 'rate_limited' using errcode = '54000',
      hint = format('At most %s per %s on %s.', v_limit, v_window, tg_table_name);
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_write_quota() from public, anon, authenticated;

drop trigger if exists messages_10_write_quota on public.messages;
create trigger messages_10_write_quota before insert on public.messages
  for each row execute function private.enforce_write_quota('sender_id', '30', '1 minute');
drop trigger if exists group_messages_10_write_quota on public.group_messages;
create trigger group_messages_10_write_quota before insert on public.group_messages
  for each row execute function private.enforce_write_quota('sender_id', '30', '1 minute');
drop trigger if exists gig_requests_10_write_quota on public.gig_requests;
create trigger gig_requests_10_write_quota before insert on public.gig_requests
  for each row execute function private.enforce_write_quota('host_id', '10', '1 day');
drop trigger if exists gig_applications_10_write_quota on public.gig_applications;
create trigger gig_applications_10_write_quota before insert on public.gig_applications
  for each row execute function private.enforce_write_quota('musician_id', '30', '1 hour');
drop trigger if exists reports_10_write_quota on public.reports;
create trigger reports_10_write_quota before insert on public.reports
  for each row execute function private.enforce_write_quota('reporter_id', '10', '1 day');
drop trigger if exists follows_10_write_quota on public.follows;
create trigger follows_10_write_quota before insert on public.follows
  for each row execute function private.enforce_write_quota('follower_id', '100', '1 hour');
drop trigger if exists song_comments_10_write_quota on public.song_comments;
create trigger song_comments_10_write_quota before insert on public.song_comments
  for each row execute function private.enforce_write_quota('author_id', '20', '1 minute');
drop trigger if exists group_invitations_10_write_quota on public.group_invitations;
create trigger group_invitations_10_write_quota before insert on public.group_invitations
  for each row execute function private.enforce_write_quota('invited_by', '50', '1 day');

-- ---------------------------------------------------------------------------
-- 6. Edge function call budget and RevenueCat replay protection
-- ---------------------------------------------------------------------------
create table if not exists private.edge_call_events (
  user_id uuid not null,
  fn text not null,
  called_at timestamptz not null default now()
);
alter table private.edge_call_events enable row level security;
revoke all on private.edge_call_events from public, anon, authenticated;
create index if not exists edge_call_events_lookup_idx
  on private.edge_call_events (fn, user_id, called_at);
create index if not exists edge_call_events_called_at_idx
  on private.edge_call_events (called_at);

-- Called by edge functions with the service client; the user id is passed
-- explicitly because the service role carries no JWT subject.
create or replace function public.consume_edge_call(
  p_user uuid, p_fn text, p_limit int, p_window interval
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_count bigint;
begin
  if p_user is null or coalesce(p_fn, '') = '' or p_limit is null or p_limit < 1
     or p_window is null or p_window <= interval '0' then
    raise exception 'invalid_edge_call_budget' using errcode = '22023';
  end if;
  delete from private.edge_call_events where called_at < now() - interval '24 hours';
  perform pg_advisory_xact_lock(hashtextextended(p_fn || ':' || p_user::text, 36003));
  select count(*) into v_count
  from private.edge_call_events
  where fn = p_fn and user_id = p_user and called_at > now() - p_window;
  if v_count >= p_limit then
    return false;
  end if;
  insert into private.edge_call_events (user_id, fn) values (p_user, p_fn);
  return true;
end;
$$;
revoke all on function public.consume_edge_call(uuid, text, int, interval) from public, anon, authenticated;
grant execute on function public.consume_edge_call(uuid, text, int, interval) to service_role;

create table if not exists private.revenuecat_events (
  event_id text primary key,
  received_at timestamptz not null default now()
);
alter table private.revenuecat_events enable row level security;
revoke all on private.revenuecat_events from public, anon, authenticated;

-- true = first time we see this event id (caller must process it);
-- false = already processed, answer 200 {duplicate:true} without touching data.
create or replace function public.claim_revenuecat_event(p_event_id text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_inserted boolean;
begin
  if coalesce(p_event_id, '') = '' or length(p_event_id) > 200 then
    raise exception 'invalid_revenuecat_event_id' using errcode = '22023';
  end if;
  delete from private.revenuecat_events where received_at < now() - interval '30 days';
  insert into private.revenuecat_events (event_id) values (p_event_id)
  on conflict (event_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;
revoke all on function public.claim_revenuecat_event(text) from public, anon, authenticated;
grant execute on function public.claim_revenuecat_event(text) to service_role;

-- A failed delivery must stay retryable by RevenueCat: release the claim.
create or replace function public.release_revenuecat_event(p_event_id text)
returns void
language sql security definer set search_path = '' as $$
  delete from private.revenuecat_events where event_id = p_event_id;
$$;
revoke all on function public.release_revenuecat_event(text) from public, anon, authenticated;
grant execute on function public.release_revenuecat_event(text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. gig_requests_feed
-- ---------------------------------------------------------------------------
-- security_invoker stays; security_barrier stops leaky functions from being
-- pushed below the view's own predicates.
alter view public.gig_requests_feed set (security_invoker = true, security_barrier = true);
