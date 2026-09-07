begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
 ('58000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated',
 'notify-sqlqa-'||i||'@local.test','',now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('name','Notification QA '||i),now(),now(),'','','',''
from generate_series(1,3) i;
insert into public.music_groups(id,name,leader_id) values
 ('58000000-0000-4000-8000-000000000010','Notify QA A','58000000-0000-4000-8000-000000000001'),
 ('58000000-0000-4000-8000-000000000020','Notify QA B','58000000-0000-4000-8000-000000000003');
insert into public.group_members(group_id,profile_id) values
 ('58000000-0000-4000-8000-000000000010','58000000-0000-4000-8000-000000000002');
insert into public.group_messages(id,group_id,sender_id,text,created_at) values
 ('58000000-0000-4000-8000-000000000011','58000000-0000-4000-8000-000000000010','58000000-0000-4000-8000-000000000001','Loaded','2026-09-07T09:00:00Z'),
 ('58000000-0000-4000-8000-000000000012','58000000-0000-4000-8000-000000000010','58000000-0000-4000-8000-000000000001','Not loaded yet','2026-09-07T10:00:00Z'),
 ('58000000-0000-4000-8000-000000000021','58000000-0000-4000-8000-000000000020','58000000-0000-4000-8000-000000000003','Other group','2026-09-07T08:00:00Z');
insert into public.conversations(id,participant_a,participant_b) values
 ('58000000-0000-4000-8000-000000000030','58000000-0000-4000-8000-000000000001','58000000-0000-4000-8000-000000000002');
insert into public.messages(id,conversation_id,sender_id,text,created_at) values
 ('58000000-0000-4000-8000-000000000031','58000000-0000-4000-8000-000000000030','58000000-0000-4000-8000-000000000001','DM loaded','2026-09-07T09:00:00Z'),
 ('58000000-0000-4000-8000-000000000032','58000000-0000-4000-8000-000000000030','58000000-0000-4000-8000-000000000001','DM unseen','2026-09-07T10:00:00Z');
-- Explicit fixtures make this test independent of push preference fan-out.
insert into public.push_notifications(user_id,category,title,body,source_table,source_id)
select '58000000-0000-4000-8000-000000000002',category,'QA', 'QA',source,id::uuid
from (values
 ('groups','group_messages','58000000-0000-4000-8000-000000000011'),
 ('groups','group_messages','58000000-0000-4000-8000-000000000012'),
 ('groups','group_messages','58000000-0000-4000-8000-000000000021'),
 ('messages','messages','58000000-0000-4000-8000-000000000031'),
 ('messages','messages','58000000-0000-4000-8000-000000000032'),
 ('groups','group_events','58000000-0000-4000-8000-000000000041'),
 ('groups','group_invitations','58000000-0000-4000-8000-000000000042'),
 ('sos','gig_requests','58000000-0000-4000-8000-000000000043')) v(category,source,id)
on conflict (user_id,category,source_table,source_id) do update set read_at=null;
set local role authenticated;
select set_config('request.jwt.claim.sub','58000000-0000-4000-8000-000000000002',true);
select public.mark_thread_notifications_read('group_messages','58000000-0000-4000-8000-000000000010','2026-09-07T09:00:00Z');
select pg_temp.assert_true((select read_at is not null from public.push_notifications where source_id='58000000-0000-4000-8000-000000000011'),'Read group notification persists');
select pg_temp.assert_true((select count(*)=7 from public.push_notifications where user_id=auth.uid() and read_at is null),'Unrelated or unseen alerts cleared');
select public.mark_thread_notifications_read('group_messages','58000000-0000-4000-8000-000000000020','2026-09-07T11:00:00Z');
select pg_temp.assert_true((select read_at is null from public.push_notifications where source_id='58000000-0000-4000-8000-000000000021'),'Invisible group message acknowledged');
select public.mark_thread_notifications_read('messages','58000000-0000-4000-8000-000000000030','2026-09-07T09:00:00Z');
select pg_temp.assert_true((select read_at is not null from public.push_notifications where source_id='58000000-0000-4000-8000-000000000031'),'Read DM alert persists');
select pg_temp.assert_true((select count(*)=6 from public.push_notifications where user_id=auth.uid() and read_at is null),'Reading a DM cleared other alerts');
select set_config('request.jwt.claim.sub','58000000-0000-4000-8000-000000000001',true);
select public.mark_thread_notifications_read('messages','58000000-0000-4000-8000-000000000030','2026-09-07T11:00:00Z');
reset role;
select pg_temp.assert_true((select read_at is null from public.push_notifications where user_id='58000000-0000-4000-8000-000000000002' and source_id='58000000-0000-4000-8000-000000000032'),'Another user can clear recipient notifications');
rollback;
