-- Local only. All fixtures and writes are rolled back.
-- Covers 20260913151000_song_comment_threads_and_leave_group.
begin;
-- Structured locality for event fixtures created by this suite.
alter table public.group_events alter column country_code set default 'CH',
  alter column city set default 'Genève', alter column postal_code set default '1201';
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
 ('5c000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated',
 'sqlqa5c-'||i||'@local.test','',now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('name','Thread QA '||i),now(),now(),'','','',''
from generate_series(1,3) i;
-- 1 = leader of A and B, 2 = member of A only, 3 = nobody.
insert into public.music_groups(id,name,leader_id) values
 ('5c000000-0000-4000-8000-000000000010','Thread QA A','5c000000-0000-4000-8000-000000000001'),
 ('5c000000-0000-4000-8000-000000000020','Thread QA B','5c000000-0000-4000-8000-000000000001');
insert into public.group_members(group_id,profile_id,kind,role)
values ('5c000000-0000-4000-8000-000000000010','5c000000-0000-4000-8000-000000000002','permanent','Piano');

-- Song ids live in the jsonb repertoire; the comment table only stores them.
-- A1 = song 1 of group A, A2 = song 2 of group A, B1 = song of group B.
set local role authenticated;
select set_config('request.jwt.claim.sub','5c000000-0000-4000-8000-000000000002',true);
do $$ begin
  begin
    insert into public.song_comments(group_id,song_id,author_id,text) values
      ('5c000000-0000-4000-8000-000000000010','5c000000-0000-4000-8000-0000000000a1',auth.uid(),'Membre ouvre un fil');
    raise exception 'Member opened a top-level discussion';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','5c000000-0000-4000-8000-000000000001',true);
-- Old clients: the leader still inserts without a parent column.
insert into public.song_comments(id,group_id,song_id,author_id,text) values
 ('5c000000-0000-4000-8000-000000000101','5c000000-0000-4000-8000-000000000010','5c000000-0000-4000-8000-0000000000a1',auth.uid(),'On attaque au refrain ?'),
 ('5c000000-0000-4000-8000-000000000102','5c000000-0000-4000-8000-000000000010','5c000000-0000-4000-8000-0000000000a2',auth.uid(),'Autre morceau'),
 ('5c000000-0000-4000-8000-000000000201','5c000000-0000-4000-8000-000000000020','5c000000-0000-4000-8000-0000000000b1',auth.uid(),'Autre groupe');

select set_config('request.jwt.claim.sub','5c000000-0000-4000-8000-000000000002',true);
insert into public.song_comments(id,group_id,song_id,author_id,text,parent_id) values
 ('5c000000-0000-4000-8000-000000000111','5c000000-0000-4000-8000-000000000010','5c000000-0000-4000-8000-0000000000a1',auth.uid(),'Oui, en mi bémol','5c000000-0000-4000-8000-000000000101');
do $$ begin
  if not exists(select 1 from public.song_comments where id='5c000000-0000-4000-8000-000000000111' and parent_id='5c000000-0000-4000-8000-000000000101' and edited_at is null) then
    raise exception 'Member reply not persisted';
  end if;
  begin
    insert into public.song_comments(group_id,song_id,author_id,text,parent_id) values
      ('5c000000-0000-4000-8000-000000000010','5c000000-0000-4000-8000-0000000000a2',auth.uid(),'Cross song','5c000000-0000-4000-8000-000000000101');
    raise exception 'Cross-song reply accepted';
  exception when check_violation then null; end;
  begin
    insert into public.song_comments(group_id,song_id,author_id,text,parent_id) values
      ('5c000000-0000-4000-8000-000000000010','5c000000-0000-4000-8000-0000000000a1',auth.uid(),'Cross group','5c000000-0000-4000-8000-000000000201');
    raise exception 'Cross-group reply accepted';
  exception when check_violation then null; end;
  begin
    insert into public.song_comments(group_id,song_id,author_id,text,parent_id) values
      ('5c000000-0000-4000-8000-000000000010','5c000000-0000-4000-8000-0000000000a1',auth.uid(),'Reply to reply','5c000000-0000-4000-8000-000000000111');
    raise exception 'Second-level reply accepted';
  exception when check_violation then null; end;
  begin
    insert into public.song_comments(group_id,song_id,author_id,text,parent_id) values
      ('5c000000-0000-4000-8000-000000000010','5c000000-0000-4000-8000-0000000000a1','5c000000-0000-4000-8000-000000000001','Spoof author','5c000000-0000-4000-8000-000000000101');
    raise exception 'Reply under another author accepted';
  exception when insufficient_privilege then null; end;
  begin
    update public.song_comments set text='Direct update' where id='5c000000-0000-4000-8000-000000000111';
    if exists(select 1 from public.song_comments where id='5c000000-0000-4000-8000-000000000111' and text='Direct update') then
      raise exception 'Direct text update accepted';
    end if;
  exception when insufficient_privilege then null; end;
end $$;

-- Edit: author only.
select public.edit_song_comment('5c000000-0000-4000-8000-000000000111','  Oui, en mi bémol — confirmé  ');
do $$ begin
  if not exists(select 1 from public.song_comments where id='5c000000-0000-4000-8000-000000000111' and text='Oui, en mi bémol — confirmé' and edited_at is not null) then
    raise exception 'Author edit not applied or not trimmed';
  end if;
  begin
    perform public.edit_song_comment('5c000000-0000-4000-8000-000000000101','Pas mon commentaire');
    raise exception 'Member edited the leader comment';
  exception when insufficient_privilege then null; end;
  begin
    perform public.edit_song_comment('5c000000-0000-4000-8000-000000000111','   ');
    raise exception 'Empty edit accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.edit_song_comment('5c000000-0000-4000-8000-000000000111',repeat('x',1001));
    raise exception 'Oversized edit accepted';
  exception when invalid_parameter_value then null; end;
end $$;

-- Reactions: set, replace, remove.
select public.set_song_comment_reaction('5c000000-0000-4000-8000-000000000101','👍');
select public.set_song_comment_reaction('5c000000-0000-4000-8000-000000000101','❤️');
do $$ begin
  if (select count(*) from public.song_comment_reactions where comment_id='5c000000-0000-4000-8000-000000000101' and removed_at is null) <> 1 then
    raise exception 'Replacing a reaction created a second row';
  end if;
  if not exists(select 1 from public.song_comment_reactions where comment_id='5c000000-0000-4000-8000-000000000101' and profile_id=auth.uid() and emoji='❤️' and removed_at is null) then
    raise exception 'Reaction replacement not applied';
  end if;
  begin
    perform public.set_song_comment_reaction('5c000000-0000-4000-8000-000000000101','🎷');
    raise exception 'Unsupported emoji accepted';
  exception when invalid_parameter_value then null; end;
  begin
    insert into public.song_comment_reactions(comment_id,profile_id,emoji) values ('5c000000-0000-4000-8000-000000000101',auth.uid(),'👍');
    raise exception 'Direct reaction insert accepted';
  exception when insufficient_privilege then null; end;
end $$;
select public.set_song_comment_reaction('5c000000-0000-4000-8000-000000000101',null);
do $$ begin
  if exists(select 1 from public.song_comment_reactions where comment_id='5c000000-0000-4000-8000-000000000101' and removed_at is null) then
    raise exception 'Reaction removal not applied';
  end if;
end $$;
select public.set_song_comment_reaction('5c000000-0000-4000-8000-000000000111','🙌');

-- Non-member: no read, no reaction, no reply.
select set_config('request.jwt.claim.sub','5c000000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists(select 1 from public.song_comments where group_id='5c000000-0000-4000-8000-000000000010') then
    raise exception 'Non-member can read comments';
  end if;
  if exists(select 1 from public.song_comment_reactions where comment_id='5c000000-0000-4000-8000-000000000111') then
    raise exception 'Non-member can read reactions';
  end if;
  begin
    perform public.set_song_comment_reaction('5c000000-0000-4000-8000-000000000101','👍');
    raise exception 'Non-member reaction accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.song_comments(group_id,song_id,author_id,text,parent_id) values
      ('5c000000-0000-4000-8000-000000000010','5c000000-0000-4000-8000-0000000000a1',auth.uid(),'Forbidden','5c000000-0000-4000-8000-000000000101');
    raise exception 'Non-member reply accepted';
  exception when check_violation or insufficient_privilege then null; end;
end $$;

-- Delete cascades from the root to its replies and their reactions.
select set_config('request.jwt.claim.sub','5c000000-0000-4000-8000-000000000001',true);
do $$ begin
  if (select count(*) from public.song_comment_reactions where comment_id='5c000000-0000-4000-8000-000000000111' and removed_at is null) <> 1 then
    raise exception 'Leader cannot read the member reaction';
  end if;
end $$;
delete from public.song_comments where id='5c000000-0000-4000-8000-000000000101';
do $$ begin
  if exists(select 1 from public.song_comments where id in ('5c000000-0000-4000-8000-000000000101','5c000000-0000-4000-8000-000000000111')) then
    raise exception 'Root deletion did not cascade to the reply';
  end if;
  if exists(select 1 from public.song_comment_reactions where comment_id='5c000000-0000-4000-8000-000000000111') then
    raise exception 'Reply deletion did not cascade to its reactions';
  end if;
end $$;

-- Leave group.
insert into public.group_events(id,group_id,kind,title,date) values
 ('5c000000-0000-4000-8000-000000000301','5c000000-0000-4000-8000-000000000010','Répétition','Répé future',now() + interval '7 days'),
 ('5c000000-0000-4000-8000-000000000302','5c000000-0000-4000-8000-000000000010','Concert','Concert passé',now() - interval '7 days');
select set_config('request.jwt.claim.sub','5c000000-0000-4000-8000-000000000002',true);
insert into public.event_attendance(event_id,profile_id,status) values
 ('5c000000-0000-4000-8000-000000000301',auth.uid(),'available'),
 ('5c000000-0000-4000-8000-000000000302',auth.uid(),'available')
on conflict (event_id,profile_id) do update set status = excluded.status;

select set_config('request.jwt.claim.sub','5c000000-0000-4000-8000-000000000001',true);
do $$ begin
  begin
    perform public.leave_group('5c000000-0000-4000-8000-000000000010');
    raise exception 'Leader left without transferring';
  exception when insufficient_privilege then
    if sqlerrm <> 'leader_must_transfer_or_delete' then
      raise exception 'Unexpected leader refusal: %', sqlerrm;
    end if;
  end;
  if not exists(select 1 from public.group_members where group_id='5c000000-0000-4000-8000-000000000010' and profile_id=auth.uid()) then
    raise exception 'Leader membership lost after refusal';
  end if;
end $$;

select set_config('request.jwt.claim.sub','5c000000-0000-4000-8000-000000000003',true);
do $$ begin
  if public.leave_group('5c000000-0000-4000-8000-000000000010') then
    raise exception 'Non-member leave reported success';
  end if;
end $$;

select set_config('request.jwt.claim.sub','5c000000-0000-4000-8000-000000000002',true);
do $$ begin
  if not public.leave_group('5c000000-0000-4000-8000-000000000010') then
    raise exception 'Member leave reported failure';
  end if;
end $$;
reset role;
do $$ begin
  if exists(select 1 from public.group_members where group_id='5c000000-0000-4000-8000-000000000010' and profile_id='5c000000-0000-4000-8000-000000000002') then
    raise exception 'Membership survived leave';
  end if;
  if exists(select 1 from public.event_attendance where event_id='5c000000-0000-4000-8000-000000000301' and profile_id='5c000000-0000-4000-8000-000000000002') then
    raise exception 'Future attendance survived leave';
  end if;
  if not exists(select 1 from public.event_attendance where event_id='5c000000-0000-4000-8000-000000000302' and profile_id='5c000000-0000-4000-8000-000000000002') then
    raise exception 'Past attendance was erased';
  end if;
  if not exists(select 1 from public.music_groups where id='5c000000-0000-4000-8000-000000000010' and leader_id='5c000000-0000-4000-8000-000000000001') then
    raise exception 'Group changed after a member left';
  end if;
end $$;
rollback;
