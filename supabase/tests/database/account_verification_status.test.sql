-- Local only. All fixtures and writes are rolled back.
-- Covers 20260913158000_account_verification_status.
begin;

-- Fixture: e-mail confirmé, téléphone enregistré mais non confirmé.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,phone,phone_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
values ('00000000-0000-0000-0000-000000000000','5d000000-0000-4000-8000-000000000001','authenticated','authenticated',
 'sqlqa5d-1@local.test','',now(),'41791234512',null,'{"provider":"email","providers":["email"]}',jsonb_build_object('name','Verify QA 1'),now(),now(),'','','','');

-- Flags par défaut : faux.
do $$ begin
  if (select value from public.app_settings where key='require_phone_verification') <> 'false'::jsonb
     or (select value from public.app_settings where key='require_email_verification') <> 'false'::jsonb then
    raise exception 'app_settings defaults are not false';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','5d000000-0000-4000-8000-000000000001',true);

-- La table est scellée : lecture refusée à authenticated.
do $$ begin
  begin
    perform * from public.app_settings;
    raise exception 'authenticated could read app_settings';
  exception when insufficient_privilege then null; end;
end $$;

-- Les réglages exposés sont limités à la liste blanche, à faux par défaut.
do $$ declare v jsonb; begin
  v := public.get_app_settings();
  if v <> '{"require_phone_verification": false, "require_email_verification": false}'::jsonb then
    raise exception 'get_app_settings shape or defaults wrong: %', v;
  end if;
end $$;

-- Forme du statut de compte pour la fixture.
do $$ declare v jsonb; begin
  v := public.get_my_account_status();
  if v is null then raise exception 'get_my_account_status returned null'; end if;
  if (v->>'email_verified')::boolean is not true then raise exception 'email_verified expected true: %', v; end if;
  if (v->>'phone_verified')::boolean is not false then raise exception 'phone_verified expected false: %', v; end if;
  if v->>'phone' <> '+41 79 *** ** 12' then raise exception 'phone mask wrong: %', v->>'phone'; end if;
  if v->>'moderation_status' <> 'active' then raise exception 'moderation_status expected active: %', v; end if;
  if v ? 'suspended_until' is not true or v ? 'moderation_reason' is not true then
    raise exception 'moderation keys missing: %', v;
  end if;
  if (v->>'require_phone_verification')::boolean is not false
     or (v->>'require_email_verification')::boolean is not false then
    raise exception 'requirement flags expected false: %', v;
  end if;
end $$;

-- Sans session, aucune ligne (null), jamais le statut d'un autre compte.
select set_config('request.jwt.claim.sub','',true);
do $$ begin
  if public.get_my_account_status() is not null then
    raise exception 'anonymous call leaked an account status';
  end if;
end $$;

reset role;

-- L'équipe active l'obligation : le statut la reflète, et une suspension expirée
-- reste rendue telle quelle (le client décide qu'elle est passée).
update public.app_settings set value='true'::jsonb, updated_at=now() where key='require_phone_verification';
update public.profiles set moderation_status='suspended', suspended_until=now()-interval '1 day', moderation_reason='QA'
 where id='5d000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub','5d000000-0000-4000-8000-000000000001',true);
do $$ declare v jsonb; begin
  v := public.get_my_account_status();
  if (v->>'require_phone_verification')::boolean is not true then raise exception 'flag not reflected: %', v; end if;
  if v->>'moderation_status' <> 'suspended' or v->>'moderation_reason' <> 'QA' or v->>'suspended_until' is null then
    raise exception 'moderation state not reflected: %', v;
  end if;
  -- Un utilisateur ne peut pas modifier les réglages.
  begin
    update public.app_settings set value='false'::jsonb where key='require_phone_verification';
    raise exception 'authenticated could update app_settings';
  exception when insufficient_privilege then null; end;
end $$;

reset role;

-- Le numéro d'un autre format reste masqué ; un numéro vide ne fuit rien.
do $$ begin
  if private.mask_phone('+33 6 12 34 56 78') <> '+33 61 *** ** 78' then raise exception 'mask fr'; end if;
  if private.mask_phone('') is not null or private.mask_phone(null) is not null then raise exception 'mask empty'; end if;
  if private.mask_phone('123456') is not null then raise exception 'mask short'; end if;
end $$;

rollback;
