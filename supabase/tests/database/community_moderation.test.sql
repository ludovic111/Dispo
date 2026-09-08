begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
values('00000000-0000-0000-0000-000000000000','55000000-0000-4000-8000-000000000098','authenticated','authenticated','moderation55@local.test','',now(),'{}','{}',now(),now(),'','','','');
do $$ begin
 if not private.community_text_allowed('Jazz swing, bass, classical: a session in Nègrepelisse.') then raise exception 'Legitimate music text blocked'; end if;
 if private.community_text_allowed('  va  te suicider  ') then raise exception 'Threat not filtered'; end if;
 if private.community_text_allowed('WHITE POWER') then raise exception 'Hateful slogan not filtered'; end if;
 if private.community_text_allowed('hello, kill yourself!') then raise exception 'Threat with punctuation not filtered'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','55000000-0000-4000-8000-000000000098',true);
update public.profiles set name='Camille Martin',bio='Jazz swing, bass and classical music.' where id=(select auth.uid());
do $$ begin
 begin insert into private.community_text_rules(pattern) values('.*'); raise exception 'User can sabotage moderation'; exception when insufficient_privilege then null; end;
 begin update public.profiles set bio='hello, kill yourself!' where id=(select auth.uid()); raise exception 'Profile trigger accepts a threat'; exception when check_violation then
   if sqlerrm <> 'content_not_allowed' then raise; end if;
 end;
 if (select bio from public.profiles where id=(select auth.uid())) <> 'Jazz swing, bass and classical music.' then raise exception 'Rejected update damaged the profile'; end if;
end $$;
reset role;
rollback;
