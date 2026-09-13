-- Automatic moderation (Dispo 2.5).
-- * profiles carry a moderation status (active / suspended / banned), a reason,
--   a suspension deadline and a strike counter, writable only by the server.
-- * The community text filter now covers chat messages, group chat, song
--   comments, manual member names and report reasons. Chat-like tables are
--   sanitised instead of rejected so the strike survives the transaction.
-- * 3 strikes -> 7 days suspension, 6 strikes -> ban. 3 distinct reporters in
--   7 days -> 72 h suspension, 6 -> ban pending review.
-- * Suspended / banned accounts cannot write; banned profiles disappear from
--   discovery. Errors use sqlstate 42501 with messages the client maps.
-- * Admins (profiles.is_admin) review reports and set statuses through a RPC.
-- Everything is idempotent.

-- ---------------------------------------------------------------------------
-- 1. Profile columns, protected against client writes
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists moderation_status text not null default 'active',
  add column if not exists moderation_reason text,
  add column if not exists suspended_until timestamptz,
  add column if not exists strikes int not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_moderation_status_check') then
    alter table public.profiles add constraint profiles_moderation_status_check
      check (moderation_status in ('active', 'suspended', 'banned'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_strikes_check') then
    alter table public.profiles add constraint profiles_strikes_check check (strikes >= 0);
  end if;
end $$;

-- Same model as protect_admin_flag: API roles cannot touch these columns.
create or replace function private.protect_moderation_columns()
returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'INSERT' then
      new.moderation_status := 'active';
      new.moderation_reason := null;
      new.suspended_until := null;
      new.strikes := 0;
    else
      new.moderation_status := old.moderation_status;
      new.moderation_reason := old.moderation_reason;
      new.suspended_until := old.suspended_until;
      new.strikes := old.strikes;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.protect_moderation_columns() from public, anon, authenticated;
drop trigger if exists profiles_00_protect_moderation on public.profiles;
create trigger profiles_00_protect_moderation
  before insert or update on public.profiles
  for each row execute function private.protect_moderation_columns();

-- ---------------------------------------------------------------------------
-- 2. Sealed audit trail
-- ---------------------------------------------------------------------------
create table if not exists private.moderation_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('strike', 'suspend', 'ban', 'report_threshold', 'auto_hide', 'reactivate')),
  source_table text,
  source_id uuid,
  reason text,
  actor_id uuid,
  created_at timestamptz not null default now()
);
alter table private.moderation_events enable row level security;
revoke all on private.moderation_events from public, anon, authenticated;
create index if not exists moderation_events_profile_idx
  on private.moderation_events (profile_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Strikes and automatic sanctions
-- ---------------------------------------------------------------------------
create or replace function private.register_content_violation(
  p_profile uuid, p_source_table text, p_source_id uuid, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_until timestamptz;
  v_strikes int;
begin
  select moderation_status, suspended_until, strikes
    into v_status, v_until, v_strikes
  from public.profiles where id = p_profile for update;
  if not found then
    return;
  end if;
  v_strikes := v_strikes + 1;
  insert into private.moderation_events (profile_id, kind, source_table, source_id, reason)
  values (p_profile, 'strike', p_source_table, p_source_id, p_reason);

  if v_status = 'banned' then
    update public.profiles set strikes = v_strikes where id = p_profile;
  elsif v_strikes >= 6 then
    update public.profiles
       set strikes = v_strikes,
           moderation_status = 'banned',
           moderation_reason = 'strikes',
           suspended_until = null
     where id = p_profile;
    insert into private.moderation_events (profile_id, kind, source_table, source_id, reason)
    values (p_profile, 'ban', p_source_table, p_source_id, format('%s strikes', v_strikes));
  elsif v_strikes >= 3 and (v_status = 'active' or v_until is null or v_until <= now()) then
    update public.profiles
       set strikes = v_strikes,
           moderation_status = 'suspended',
           moderation_reason = 'strikes',
           suspended_until = now() + interval '7 days'
     where id = p_profile;
    insert into private.moderation_events (profile_id, kind, source_table, source_id, reason)
    values (p_profile, 'suspend', p_source_table, p_source_id, format('%s strikes', v_strikes));
  else
    update public.profiles set strikes = v_strikes where id = p_profile;
  end if;
end;
$$;
revoke all on function private.register_content_violation(uuid, text, uuid, text) from public, anon, authenticated;

-- Chat-like tables: replace the text, flag the row, count a strike, let the
-- insert succeed (a raise would roll the strike back with it).
-- tg_argv = (text column, author column).
create or replace function private.moderate_community_text()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_column text := tg_argv[0];
  v_author uuid;
  v_text text := to_jsonb(new) ->> tg_argv[0];
begin
  if tg_op = 'UPDATE' and v_text is not distinct from (to_jsonb(old) ->> v_column) then
    return new;
  end if;
  if private.community_text_allowed(v_text) then
    return new;
  end if;
  v_author := (to_jsonb(new) ->> tg_argv[1])::uuid;
  new := jsonb_populate_record(
    new,
    jsonb_build_object(v_column, '[message retiré par la modération]', 'moderated', true)
  );
  if v_author is not null then
    perform private.register_content_violation(
      v_author, tg_table_name, (to_jsonb(new) ->> 'id')::uuid, 'content_not_allowed'
    );
  end if;
  return new;
end;
$$;
revoke all on function private.moderate_community_text() from public, anon, authenticated;

alter table public.messages add column if not exists moderated boolean not null default false;
alter table public.group_messages add column if not exists moderated boolean not null default false;
alter table public.song_comments add column if not exists moderated boolean not null default false;

drop trigger if exists messages_05_moderate_text on public.messages;
create trigger messages_05_moderate_text
  before insert or update of text on public.messages
  for each row execute function private.moderate_community_text('text', 'sender_id');
drop trigger if exists group_messages_05_moderate_text on public.group_messages;
create trigger group_messages_05_moderate_text
  before insert or update of text on public.group_messages
  for each row execute function private.moderate_community_text('text', 'sender_id');
drop trigger if exists song_comments_05_moderate_text on public.song_comments;
create trigger song_comments_05_moderate_text
  before insert or update of text on public.song_comments
  for each row execute function private.moderate_community_text('text', 'author_id');

-- Names and report reasons keep the reject behaviour (no strike).
drop trigger if exists group_manual_members_community_text on public.group_manual_members;
create trigger group_manual_members_community_text
  before insert or update of name on public.group_manual_members
  for each row execute function private.guard_public_community_text('name');
drop trigger if exists reports_community_text on public.reports;
create trigger reports_community_text
  before insert or update of reason on public.reports
  for each row execute function private.guard_public_community_text('reason');

-- ---------------------------------------------------------------------------
-- 4. Report thresholds
-- ---------------------------------------------------------------------------
create or replace function private.escalate_reported_profile()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_reporters bigint;
  v_status text;
  v_until timestamptz;
begin
  select count(distinct reporter_id) into v_reporters
  from public.reports
  where reported_id = new.reported_id and created_at > now() - interval '7 days';

  select moderation_status, suspended_until into v_status, v_until
  from public.profiles where id = new.reported_id for update;
  if not found or v_status = 'banned' then
    return null;
  end if;

  if v_reporters >= 6 then
    update public.profiles
       set moderation_status = 'banned',
           moderation_reason = 'report_threshold',
           suspended_until = null
     where id = new.reported_id;
    insert into private.moderation_events (profile_id, kind, source_table, source_id, reason)
    values (new.reported_id, 'ban', 'reports', new.id,
            format('%s distinct reporters in 7 days, pending review', v_reporters));
  elsif v_reporters >= 3 and (v_status = 'active' or v_until is null or v_until <= now()) then
    update public.profiles
       set moderation_status = 'suspended',
           moderation_reason = 'report_threshold',
           suspended_until = now() + interval '72 hours'
     where id = new.reported_id;
    insert into private.moderation_events (profile_id, kind, source_table, source_id, reason)
    values (new.reported_id, 'report_threshold', 'reports', new.id,
            format('%s distinct reporters in 7 days', v_reporters));
  end if;
  return null;
end;
$$;
revoke all on function private.escalate_reported_profile() from public, anon, authenticated;
drop trigger if exists reports_90_escalate_profile on public.reports;
create trigger reports_90_escalate_profile
  after insert on public.reports
  for each row execute function private.escalate_reported_profile();

-- ---------------------------------------------------------------------------
-- 5. Enforcement
-- ---------------------------------------------------------------------------
-- Effective status of a profile; an expired suspension reactivates lazily.
create or replace function private.account_write_status(p_profile uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_status text;
  v_until timestamptz;
begin
  select moderation_status, suspended_until into v_status, v_until
  from public.profiles where id = p_profile;
  if not found then
    return 'active';
  end if;
  if v_status = 'suspended' and (v_until is null or v_until <= now()) then
    update public.profiles
       set moderation_status = 'active', suspended_until = null, moderation_reason = null
     where id = p_profile and moderation_status = 'suspended';
    insert into private.moderation_events (profile_id, kind, reason)
    values (p_profile, 'reactivate', 'suspension expired');
    return 'active';
  end if;
  return v_status;
end;
$$;
revoke all on function private.account_write_status(uuid) from public, anon, authenticated;

create or replace function private.account_can_write()
returns boolean
language sql security definer set search_path = '' as $$
  select (select auth.uid()) is not null
     and private.account_write_status((select auth.uid())) = 'active'
$$;
revoke all on function private.account_can_write() from public, anon;
grant execute on function private.account_can_write() to authenticated;

-- BEFORE INSERT guard, tg_argv = (owner column). Only rows a user writes for
-- themselves are checked; server-side rows created for someone else
-- (auto-SOS for a leader, …) pass through.
create or replace function private.enforce_account_can_write()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
  v_status text;
begin
  if v_owner is null or v_owner is distinct from (select auth.uid()) then
    return new;
  end if;
  v_status := private.account_write_status(v_owner);
  if v_status = 'banned' then
    raise exception 'account_banned' using errcode = '42501';
  elsif v_status = 'suspended' then
    raise exception 'account_suspended' using errcode = '42501',
      hint = 'The account is suspended; writing is refused until the suspension ends.';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_account_can_write() from public, anon, authenticated;

drop trigger if exists gig_requests_00_account_can_write on public.gig_requests;
create trigger gig_requests_00_account_can_write before insert on public.gig_requests
  for each row execute function private.enforce_account_can_write('host_id');
drop trigger if exists gig_applications_00_account_can_write on public.gig_applications;
create trigger gig_applications_00_account_can_write before insert on public.gig_applications
  for each row execute function private.enforce_account_can_write('musician_id');
drop trigger if exists messages_00_account_can_write on public.messages;
create trigger messages_00_account_can_write before insert on public.messages
  for each row execute function private.enforce_account_can_write('sender_id');
drop trigger if exists group_messages_00_account_can_write on public.group_messages;
create trigger group_messages_00_account_can_write before insert on public.group_messages
  for each row execute function private.enforce_account_can_write('sender_id');
drop trigger if exists school_messages_00_account_can_write on public.school_messages;
create trigger school_messages_00_account_can_write before insert on public.school_messages
  for each row execute function private.enforce_account_can_write('sender_id');
drop trigger if exists song_comments_00_account_can_write on public.song_comments;
create trigger song_comments_00_account_can_write before insert on public.song_comments
  for each row execute function private.enforce_account_can_write('author_id');
drop trigger if exists group_invitations_00_account_can_write on public.group_invitations;
create trigger group_invitations_00_account_can_write before insert on public.group_invitations
  for each row execute function private.enforce_account_can_write('invited_by');
drop trigger if exists follows_00_account_can_write on public.follows;
create trigger follows_00_account_can_write before insert on public.follows
  for each row execute function private.enforce_account_can_write('follower_id');
drop trigger if exists reports_00_account_can_write on public.reports;
create trigger reports_00_account_can_write before insert on public.reports
  for each row execute function private.enforce_account_can_write('reporter_id');
drop trigger if exists music_groups_00_account_can_write on public.music_groups;
create trigger music_groups_00_account_can_write before insert on public.music_groups
  for each row execute function private.enforce_account_can_write('leader_id');

-- Banned users keep read access to their own row but cannot edit it.
create or replace function private.enforce_profile_not_banned()
returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and old.moderation_status = 'banned' then
    raise exception 'account_banned' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_profile_not_banned() from public, anon, authenticated;
drop trigger if exists profiles_01_enforce_not_banned on public.profiles;
create trigger profiles_01_enforce_not_banned
  before update on public.profiles
  for each row execute function private.enforce_profile_not_banned();

-- Restrictive policy: ANDed with profiles_select_ready_or_own, so banned
-- profiles vanish for everybody but themselves whatever the permissive
-- policy says.
drop policy if exists profiles_hide_banned on public.profiles;
create policy profiles_hide_banned on public.profiles
  as restrictive for select to authenticated
  using (id = (select auth.uid()) or moderation_status <> 'banned');

-- ---------------------------------------------------------------------------
-- 6. Self-service state
-- ---------------------------------------------------------------------------
create or replace function public.get_my_moderation_state()
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
  v_state jsonb;
begin
  if v_uid is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  v_status := private.account_write_status(v_uid);
  select jsonb_build_object(
    'status', v_status,
    'reason', moderation_reason,
    'suspended_until', suspended_until,
    'strikes', strikes
  ) into v_state
  from public.profiles where id = v_uid;
  return coalesce(v_state, jsonb_build_object('status', 'active', 'reason', null, 'suspended_until', null, 'strikes', 0));
end;
$$;
revoke all on function public.get_my_moderation_state() from public, anon;
grant execute on function public.get_my_moderation_state() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Admin review
-- ---------------------------------------------------------------------------
alter table public.reports
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists action_taken text;

create or replace function private.viewer_is_admin()
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false)
$$;
revoke all on function private.viewer_is_admin() from public, anon;
grant execute on function private.viewer_is_admin() to authenticated;

drop policy if exists reports_select_admin on public.reports;
create policy reports_select_admin on public.reports
  for select to authenticated using (private.viewer_is_admin());
drop policy if exists reports_update_admin on public.reports;
create policy reports_update_admin on public.reports
  for update to authenticated
  using (private.viewer_is_admin()) with check (private.viewer_is_admin());
grant update (status, reviewed_by, reviewed_at, action_taken) on public.reports to authenticated;

create or replace function public.admin_set_moderation_status(
  p_profile uuid, p_status text, p_reason text default null, p_until timestamptz default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := (select auth.uid());
  v_until timestamptz;
  v_kind text;
  v_state jsonb;
begin
  if v_admin is null or not private.viewer_is_admin() then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  if p_profile is null or not exists (select 1 from public.profiles where id = p_profile) then
    raise exception 'profile_not_found' using errcode = '22023';
  end if;
  if p_status not in ('active', 'suspended', 'banned') then
    raise exception 'invalid_moderation_status' using errcode = '22023';
  end if;
  if p_status = 'suspended' then
    v_until := coalesce(p_until, now() + interval '72 hours');
    if v_until <= now() then
      raise exception 'invalid_suspension_deadline' using errcode = '22023';
    end if;
  end if;
  update public.profiles
     set moderation_status = p_status,
         moderation_reason = case when p_status = 'active' then null else coalesce(nullif(btrim(p_reason), ''), 'admin') end,
         suspended_until = v_until
   where id = p_profile;
  v_kind := case p_status when 'active' then 'reactivate' when 'suspended' then 'suspend' else 'ban' end;
  insert into private.moderation_events (profile_id, kind, reason, actor_id)
  values (p_profile, v_kind, coalesce(nullif(btrim(p_reason), ''), 'admin'), v_admin);
  select jsonb_build_object(
    'status', moderation_status,
    'reason', moderation_reason,
    'suspended_until', suspended_until,
    'strikes', strikes
  ) into v_state
  from public.profiles where id = p_profile;
  return v_state;
end;
$$;
revoke all on function public.admin_set_moderation_status(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.admin_set_moderation_status(uuid, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Additional rules (violence / hate only; musical vocabulary is safe)
-- ---------------------------------------------------------------------------
-- Patterns match lowercased, unaccented, whitespace-collapsed text.
insert into private.community_text_rules (pattern)
select v.pattern
from (values
  ('\m(je vais te (tuer|buter)|on va te (tuer|buter)|i will kill you|i''ll kill you|i am going to kill you|gonna kill you)\M'),
  ('\m(tu merites de mourir|tu vas crever|you deserve to die)\M'),
  ('\m(sale (juif|juive|juifs|juives|arabe|arabes|negre|negres|noir|noirs|pede|pedes|gouine|gouines|bougnoule|bougnoules|chinetoque|chinetoques))\M'),
  ('\m(bougnoule|bougnoules|chinetoque|chinetoques|youpin|youpins|tarlouze|tarlouzes)\M'),
  ('\m(mort aux (juifs|arabes|noirs|musulmans|pedes|gays)|death to (jews|muslims|arabs|blacks|gays)|gas the jews)\M'),
  ('\m(kill all (jews|muslims|arabs|blacks|gays)|tuer tous les (juifs|arabes|noirs|musulmans))\M'),
  ('\m(nique ta race|sale race)\M')
) as v(pattern)
where not exists (select 1 from private.community_text_rules r where r.pattern = v.pattern);
