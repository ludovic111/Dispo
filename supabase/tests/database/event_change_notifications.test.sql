-- Local transactional fixtures only. Tests preserve all pre-existing notification flows.

begin;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
 ('f5900000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated',
 'event-change-sqlqa-'||i||'@local.test','',now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('name','Event QA '||i),now(),now(),'','','',''
from generate_series(1,2) i;
select public.apply_revenuecat_subscription_state('f5900000-0000-4000-8000-000000000001','premium',now()+interval '1 day',now());
insert into public.music_groups(id,name,leader_id,repertoire) values
 ('f5900000-0000-4000-8000-000000000050','Event changes QA','f5900000-0000-4000-8000-000000000001','[]');
insert into public.group_members(group_id,profile_id,kind,role) values
 ('f5900000-0000-4000-8000-000000000050','f5900000-0000-4000-8000-000000000002','permanent','Piano');
insert into public.group_events(id,group_id,kind,title,venue,date,setlist,created_at) values
 ('f5900000-0000-4000-8000-000000000060','f5900000-0000-4000-8000-000000000050','Répétition','Rehearsal','Genève',now()+interval '10 days','[]',now()-interval '1 hour');

create function pg_temp.check_count(expected integer) returns void language plpgsql as $$
begin
 if (select count(*) from public.push_notifications where source_table='group_event_changes' and user_id='f5900000-0000-4000-8000-000000000002') <> expected then raise exception 'notification count expected %',expected; end if;
end $$;
select set_config('request.jwt.claim.sub','f5900000-0000-4000-8000-000000000001',true);
select public.notify_group_event_moved('f5900000-0000-4000-8000-000000000060'); select pg_temp.check_count(0);
update public.group_events set title='Titre seul' where id='f5900000-0000-4000-8000-000000000060';
select public.notify_group_event_moved('f5900000-0000-4000-8000-000000000060'); select pg_temp.check_count(0);
update public.group_events set date=date+interval '1 hour' where id='f5900000-0000-4000-8000-000000000060';
select public.notify_group_event_moved('f5900000-0000-4000-8000-000000000060'); select pg_temp.check_count(1);
select public.notify_group_event_moved('f5900000-0000-4000-8000-000000000060'); select pg_temp.check_count(1);
update public.group_events set reminder_lead_days=3,title='Autre titre' where id='f5900000-0000-4000-8000-000000000060';
select public.notify_group_event_moved('f5900000-0000-4000-8000-000000000060'); select pg_temp.check_count(1);
update public.group_events set date=date+interval '1 day' where id='f5900000-0000-4000-8000-000000000060';
select public.notify_group_event_moved('f5900000-0000-4000-8000-000000000060'); select pg_temp.check_count(2);
update public.group_events set venue='Nouveau lieu',public_location_label='Nouveau lieu' where id='f5900000-0000-4000-8000-000000000060';
select public.notify_group_event_moved('f5900000-0000-4000-8000-000000000060'); select pg_temp.check_count(3);
update public.group_events set venue=venue,date=date where id='f5900000-0000-4000-8000-000000000060';
select public.notify_group_event_moved('f5900000-0000-4000-8000-000000000060'); select pg_temp.check_count(3);
select set_config('request.jwt.claim.sub','f5900000-0000-4000-8000-000000000002',true);
do $$ begin
  begin perform public.notify_group_event_moved('f5900000-0000-4000-8000-000000000060'); raise exception 'nonleader was allowed';
  exception when insufficient_privilege then null; end;
  if exists(select 1 from public.push_notifications where source_table='group_event_changes' and user_id='f5900000-0000-4000-8000-000000000001') then raise exception 'notified editor'; end if;
  if exists(select 1 from public.push_notifications where source_table='group_event_changes' and (data->>'event_id' is distinct from 'f5900000-0000-4000-8000-000000000060' or data->>'group_id' is null)) then raise exception 'missing destination'; end if;
  if has_table_privilege('authenticated','private.group_event_notified_revisions','SELECT') then raise exception 'private bookkeeping exposed'; end if;
end $$;
select set_config('request.jwt.claim.sub','f5900000-0000-4000-8000-000000000001',true);
select public.save_group_events_with_locations('f5900000-0000-4000-8000-000000000050',
 jsonb_build_array(jsonb_build_object('id','f5900000-0000-4000-8000-000000000060','kind','Répétition','title','Titre atomique',
 'date',(transaction_timestamp()+interval '12 days'),'public_location_label','AMR · Genève','postal_code','1201','city','Genève','country_code','CH','exact_address','Rue privée 1')));
select pg_temp.check_count(4);
select public.notify_group_event_moved('f5900000-0000-4000-8000-000000000060'); select pg_temp.check_count(4);
select public.save_group_events_with_locations('f5900000-0000-4000-8000-000000000050',
 jsonb_build_array(jsonb_build_object('id','f5900000-0000-4000-8000-000000000060','kind','Répétition','title','Titre changé seulement',
 'date',(transaction_timestamp()+interval '12 days'),'public_location_label','AMR · Genève','postal_code','1201','city','Genève','country_code','CH','exact_address','Rue privée 1')));
select pg_temp.check_count(4);
select public.save_group_events_with_locations('f5900000-0000-4000-8000-000000000050',
 jsonb_build_array(jsonb_build_object('id','f5900000-0000-4000-8000-000000000060','kind','Répétition','title','Titre changé seulement',
 'date',(transaction_timestamp()+interval '12 days'),'public_location_label','AMR · Genève','postal_code','1201','city','Genève','country_code','CH','exact_address','Rue privée 2')));
select pg_temp.check_count(5);
do $$ begin
 if exists(select 1 from public.push_notifications where source_table='group_event_changes' and body like '%Rue privée%') then raise exception 'private address leaked'; end if;
end $$;
insert into public.group_events(id,group_id,kind,title,venue,date,setlist,series_id)
values ('f5900000-0000-4000-8000-000000000091','f5900000-0000-4000-8000-000000000050','Répétition','Série','Genève',(now()+interval '20 days'),'[]','f5900000-0000-4000-8000-000000000090'),
('f5900000-0000-4000-8000-000000000092','f5900000-0000-4000-8000-000000000050','Répétition','Série','Genève',(now()+interval '27 days'),'[]','f5900000-0000-4000-8000-000000000090');
update public.group_events set date=date+interval '1 hour' where series_id='f5900000-0000-4000-8000-000000000090';
select public.notify_group_event_moved('f5900000-0000-4000-8000-000000000091',2);
select pg_temp.check_count(6);
select public.notify_group_event_moved('f5900000-0000-4000-8000-000000000092',2);
select pg_temp.check_count(6);
do $$ begin
 if not exists(select 1 from public.push_notifications where source_table='group_event_changes' and body like '%2 dates') then raise exception 'series not coalesced'; end if;
end $$;
rollback;
