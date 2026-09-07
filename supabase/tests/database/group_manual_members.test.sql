-- Local fixtures only; no data survives the transaction.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception '%', message; end if; end $$;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
 ('57000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated',
 'manual-sqlqa-'||i||'@local.test','',now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('name','Manual QA '||i),now(),now(),'','','',''
from generate_series(1,3) i;
insert into public.music_groups(id,name,leader_id,repertoire) values
 ('57000000-0000-4000-8000-000000000010','Manual QA A','57000000-0000-4000-8000-000000000001','[{"id":"57000000-0000-4000-8000-000000000030","title":"Blue Bossa","artist":"Kenny Dorham","is_approved":true}]'),
 ('57000000-0000-4000-8000-000000000020','Manual QA B','57000000-0000-4000-8000-000000000003','[]');
insert into public.group_members(group_id,profile_id,kind,role)
values ('57000000-0000-4000-8000-000000000010','57000000-0000-4000-8000-000000000002','permanent','Piano');
insert into public.group_events(id,group_id,kind,title,venue,date,setlist)
select '57000000-0000-4000-8000-000000000040',id,'Répétition','Rehearsal','Studio',now()+interval '10 days',repertoire from public.music_groups where id='57000000-0000-4000-8000-000000000010';

set local role authenticated;
select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000001',true);
with member as (insert into public.group_manual_members(group_id,name,role)
values ('57000000-0000-4000-8000-000000000010','Camille Dupont','Saxophone') returning id)
select set_config('qa.manual_id',id::text,true) from member;
select pg_temp.assert_true((select count(*)=1 from public.group_manual_members where id=current_setting('qa.manual_id')::uuid),'Leader cannot read added member');
update public.group_manual_members set name='Camille Martin',kind='guest',role='Saxophone alto' where id=current_setting('qa.manual_id')::uuid;
select public.set_group_song_solos('57000000-0000-4000-8000-000000000010','57000000-0000-4000-8000-000000000030',array[current_setting('qa.manual_id')::uuid,'57000000-0000-4000-8000-000000000002'::uuid,current_setting('qa.manual_id')::uuid]);
select pg_temp.assert_true((select repertoire->0->'solos'=jsonb_build_array(current_setting('qa.manual_id'),'57000000-0000-4000-8000-000000000002') from public.music_groups where id='57000000-0000-4000-8000-000000000010'),'Mixed solos order/dedup failed');
select pg_temp.assert_true((select setlist->0->'solos' ? current_setting('qa.manual_id') from public.group_events where id='57000000-0000-4000-8000-000000000040'),'Event solos not persisted');
do $$ begin
  begin
    update public.group_manual_members set group_id='57000000-0000-4000-8000-000000000020' where id=current_setting('qa.manual_id')::uuid;
    raise exception 'Manual member identity can be moved';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.group_manual_members(group_id,name) values('57000000-0000-4000-8000-000000000010',' ');
    raise exception 'Empty name accepted';
  exception when check_violation then null; end;
  begin
    perform public.transfer_group_leadership('57000000-0000-4000-8000-000000000010',current_setting('qa.manual_id')::uuid);
    raise exception 'Manual member became leader';
  exception when invalid_parameter_value then null; end;
end $$;

select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true((select name='Camille Martin' from public.group_manual_members where id=current_setting('qa.manual_id')::uuid),'Regular member cannot read changes');
do $$ declare affected integer; begin
  begin
    insert into public.group_manual_members(group_id,name) values('57000000-0000-4000-8000-000000000010','Forbidden');
    raise exception 'Regular member can add manual members';
  exception when insufficient_privilege then null; end;
  update public.group_manual_members set name='Forbidden' where id=current_setting('qa.manual_id')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Regular member can update manual members'; end if;
  delete from public.group_manual_members where id=current_setting('qa.manual_id')::uuid;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Regular member can remove manual members'; end if;
  begin
    perform public.set_group_song_solos('57000000-0000-4000-8000-000000000010','57000000-0000-4000-8000-000000000030',array[current_setting('qa.manual_id')::uuid]);
    raise exception 'Regular member can assign solos';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*)=0 from public.group_manual_members where id=current_setting('qa.manual_id')::uuid),'Outsider can read manual member');
do $$ begin
  begin
    perform public.set_group_song_solos('57000000-0000-4000-8000-000000000020','57000000-0000-4000-8000-000000000030',array[current_setting('qa.manual_id')::uuid]);
    raise exception 'Member of another group accepted as soloist';
  exception when check_violation then null; end;
end $$;

select set_config('request.jwt.claim.sub','57000000-0000-4000-8000-000000000001',true);
delete from public.group_manual_members where id=current_setting('qa.manual_id')::uuid;
select pg_temp.assert_true((select repertoire->0->'solos'='["57000000-0000-4000-8000-000000000002"]'::jsonb from public.music_groups where id='57000000-0000-4000-8000-000000000010'),'Removal changed remaining repertoire solos');
select pg_temp.assert_true((select setlist->0->'solos'='["57000000-0000-4000-8000-000000000002"]'::jsonb from public.group_events where id='57000000-0000-4000-8000-000000000040'),'Removal changed remaining event solos');
select pg_temp.assert_true((select repertoire->0->>'title'='Blue Bossa' from public.music_groups where id='57000000-0000-4000-8000-000000000010'),'Removal lost song metadata');
reset role;
select pg_temp.assert_true(not exists(select 1 from auth.users where id=current_setting('qa.manual_id')::uuid),'Manual member created an Auth account');
select pg_temp.assert_true(not exists(select 1 from public.profiles where id=current_setting('qa.manual_id')::uuid),'Manual member created a public profile');
rollback;
