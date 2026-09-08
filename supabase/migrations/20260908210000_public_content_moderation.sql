-- First-pass text filtering supplements user reports and manual moderation.
-- Rules are private, editable only by trusted operators; no user text is sent
-- to another moderation provider. Musical titles and private scores are excluded.
create table private.community_text_rules (
  id bigint generated always as identity primary key,
  pattern text not null check(length(pattern) between 3 and 500),
  enabled boolean not null default true
);
alter table private.community_text_rules enable row level security;
revoke all on private.community_text_rules from public, anon, authenticated;
insert into private.community_text_rules(pattern) values
  ('\m(kill yourself|go kill yourself|va te suicider|va te pendre)\M'),
  ('\m(heil hitler|sieg heil|white power)\M'),
  ('\m(nigger|niggers|negre|negres|faggot|faggots)\M'),
  ('\m(child porn|child pornography|pornographie infantile)\M');
create function private.community_text_allowed(p_text text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists(select 1 from private.community_text_rules r where r.enabled
    and regexp_replace(lower(extensions.unaccent(coalesce(p_text,''))), '[[:space:]]+', ' ', 'g') ~ r.pattern)
$$;
revoke all on function private.community_text_allowed(text) from public, anon, authenticated;
create function private.guard_public_community_text()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_column text; v_new jsonb := to_jsonb(new); v_old jsonb;
begin
  if tg_op='UPDATE' then v_old:=to_jsonb(old); end if;
  foreach v_column in array tg_argv loop
    if tg_op='UPDATE' and v_new->v_column is not distinct from v_old->v_column then continue; end if;
    if not private.community_text_allowed(v_new->>v_column) then
      raise exception 'content_not_allowed' using errcode='23514',
        hint='Remove hateful, threatening or exploitative content before publishing.';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function private.guard_public_community_text() from public, anon, authenticated;
create trigger profiles_community_text before insert or update of name,bio on public.profiles
for each row execute function private.guard_public_community_text('name','bio');
create trigger gig_requests_community_text before insert or update of title,description on public.gig_requests
for each row execute function private.guard_public_community_text('title','description');
create trigger music_groups_community_text before insert or update of name on public.music_groups
for each row execute function private.guard_public_community_text('name');
create trigger school_messages_community_text before insert or update of text on public.school_messages
for each row execute function private.guard_public_community_text('text');
