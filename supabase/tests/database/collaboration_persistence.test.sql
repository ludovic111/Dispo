begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000', ('69000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated',
'collab69-'||i||'@local.test','',now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('name','Collab QA '||i),now(),now(),'','','','' from generate_series(1,3) i;
update public.profiles set instruments=array['Piano'] where id::text like '69000000-%';
set local role authenticated;
select set_config('request.jwt.claim.sub','69000000-0000-4000-8000-000000000001',true);
-- Regression: PostgREST's default upsert needs UPDATE even on a new pair.
do $$ begin
  begin
    insert into public.collaborations(a_id,b_id) values ('69000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000002')
      on conflict(a_id,b_id) do update set a_id=excluded.a_id;
    raise exception 'Unexpected UPDATE privilege on collaborations';
  exception when insufficient_privilege then raise notice 'Original upsert failure reproduced'; end;
end $$;
insert into public.collaborations(a_id,b_id) values ('69000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000002') on conflict(a_id,b_id) do nothing;
insert into public.collaborations(a_id,b_id) values ('69000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000002') on conflict(a_id,b_id) do nothing;
do $$ begin
 if (select count(*) from public.collaborations where a_id=auth.uid()) <> 1 then raise exception 'Collaboration not persisted exactly once'; end if;
end $$;
select set_config('request.jwt.claim.sub','69000000-0000-4000-8000-000000000003',true);
do $$ begin
 begin
  insert into public.collaborations(a_id,b_id) values ('69000000-0000-4000-8000-000000000001','69000000-0000-4000-8000-000000000002') on conflict(a_id,b_id) do nothing;
  raise exception 'Outsider can declare collaboration';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','69000000-0000-4000-8000-000000000002',true);
delete from public.collaborations where b_id=auth.uid();
do $$ begin
 if exists(select 1 from public.collaborations where b_id=auth.uid()) then raise exception 'Removal failed'; end if;
end $$;
reset role;
rollback;
