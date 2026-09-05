-- Local only. All fixtures and writes are rolled back.
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
 ('59000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated',
 'sqlqa49-'||i||'@local.test','',now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('name','Reply QA '||i),now(),now(),'','','',''
from generate_series(1,3) i;
insert into public.music_groups(id,name,leader_id) values
 ('59000000-0000-4000-8000-000000000010','Reply QA A','59000000-0000-4000-8000-000000000001'),
 ('59000000-0000-4000-8000-000000000020','Reply QA B','59000000-0000-4000-8000-000000000001');
insert into public.group_members(group_id,profile_id,kind,role)
values ('59000000-0000-4000-8000-000000000010','59000000-0000-4000-8000-000000000002','permanent','Piano');

set local role authenticated;
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
-- Old clients continue to send without a reply column.
insert into public.group_messages(id,group_id,sender_id,text) values
 ('59000000-0000-4000-8000-000000000011','59000000-0000-4000-8000-000000000010','59000000-0000-4000-8000-000000000001','Quelle tonalité ?'),
 ('59000000-0000-4000-8000-000000000021','59000000-0000-4000-8000-000000000020','59000000-0000-4000-8000-000000000001','Autre groupe');
do $$ begin
  begin
    insert into public.group_messages(group_id,sender_id,text,reply_to_id) values
      ('59000000-0000-4000-8000-000000000010',auth.uid(),'Cross group','59000000-0000-4000-8000-000000000021');
    raise exception 'Cross-group reply accepted for a member of both groups';
  exception when check_violation then null; end;
  begin
    insert into public.group_messages(group_id,sender_id,text,reply_to_id) values
      ('59000000-0000-4000-8000-000000000010',auth.uid(),'Missing','59000000-0000-4000-8000-000000000099');
    raise exception 'Missing original accepted';
  exception when check_violation then null; end;
  begin
    insert into public.group_messages(id,group_id,sender_id,text,reply_to_id) values
      ('59000000-0000-4000-8000-000000000030','59000000-0000-4000-8000-000000000010',auth.uid(),'Self','59000000-0000-4000-8000-000000000030');
    raise exception 'Self reply accepted';
  exception when check_violation then null; end;
end $$;

select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
insert into public.group_messages(id,group_id,sender_id,text,reply_to_id)
values ('59000000-0000-4000-8000-000000000012','59000000-0000-4000-8000-000000000010',auth.uid(),'En mi bémol','59000000-0000-4000-8000-000000000011');
do $$ begin
  if not exists(select 1 from public.recent_group_messages(60) where id='59000000-0000-4000-8000-000000000012' and reply_to_id='59000000-0000-4000-8000-000000000011') then
    raise exception 'Reply not persisted or missing from group summary RPC';
  end if;
  begin
    update public.group_messages set reply_to_id=null where id='59000000-0000-4000-8000-000000000012';
    raise exception 'Client can change reply identity';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000003',true);
do $$ begin
  if exists(select 1 from public.group_messages where id='59000000-0000-4000-8000-000000000011') then
    raise exception 'Non-member can read original';
  end if;
  begin
    insert into public.group_messages(group_id,sender_id,text,reply_to_id) values
      ('59000000-0000-4000-8000-000000000010',auth.uid(),'Forbidden','59000000-0000-4000-8000-000000000011');
    raise exception 'Non-member reply accepted';
  exception when check_violation or insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000001',true);
select public.edit_group_message('59000000-0000-4000-8000-000000000011','Quelle tonalité pour la jam ?');
select public.delete_group_message('59000000-0000-4000-8000-000000000011');
select set_config('request.jwt.claim.sub','59000000-0000-4000-8000-000000000002',true);
do $$ begin
  if not exists(select 1 from public.group_messages where id='59000000-0000-4000-8000-000000000011' and deleted_at is not null and text='') then
    raise exception 'Deleted quote retained content';
  end if;
  begin
    insert into public.group_messages(group_id,sender_id,text,reply_to_id) values
      ('59000000-0000-4000-8000-000000000010',auth.uid(),'Deleted','59000000-0000-4000-8000-000000000011');
    raise exception 'New reply to deleted original accepted';
  exception when check_violation then null; end;
  perform public.edit_group_message('59000000-0000-4000-8000-000000000012','En mi bémol, confirmé');
  if not exists(select 1 from public.group_messages where id='59000000-0000-4000-8000-000000000012' and reply_to_id='59000000-0000-4000-8000-000000000011') then
    raise exception 'Editing a reply lost its original';
  end if;
end $$;
reset role;
delete from public.group_messages where id='59000000-0000-4000-8000-000000000011';
do $$ begin
  if not exists(select 1 from public.group_messages where id='59000000-0000-4000-8000-000000000012' and reply_to_id is null) then
    raise exception 'Physical deletion did not clear the reference';
  end if;
end $$;
rollback;
