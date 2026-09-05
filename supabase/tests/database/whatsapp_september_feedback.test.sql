-- Base locale uniquement. Toutes les fixtures sont annulées.
begin;
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new)
select '00000000-0000-0000-0000-000000000000',
 ('58000000-0000-4000-8000-00000000000'||i)::uuid,'authenticated','authenticated',
 'sqlqa47-'||i||'@local.test','',now(),'{"provider":"email","providers":["email"]}',jsonb_build_object('name','QA '||i),now(),now(),'','','',''
from generate_series(1,3) i;
update public.profiles set instruments=array['Saxophone'],level='Avancé',available_dates=array[current_date+7],instrument_levels='{"Saxophone":"Avancé"}'
where id::text like '58000000%';
insert into public.music_schools(id,slug,name,city) values ('58000000-0000-4000-8000-000000000010','sqlqa47-school','QA School','Genève');
insert into public.music_school_memberships(profile_id,school_id,status)
values ('58000000-0000-4000-8000-000000000002','58000000-0000-4000-8000-000000000010','active');
insert into public.music_groups(id,name,leader_id,repertoire)
values ('58000000-0000-4000-8000-000000000020','QA Feedback','58000000-0000-4000-8000-000000000001',
 '[{"id":"58000000-0000-4000-8000-000000000030","title":"Afro blue","is_approved":true,"suggested_by":"58000000-0000-4000-8000-000000000001","solos":[]}]');
insert into public.group_members(group_id,profile_id,kind,role)
values ('58000000-0000-4000-8000-000000000020','58000000-0000-4000-8000-000000000002','permanent','Saxophone');
insert into public.group_events(id,group_id,title,kind,venue,public_location_label,date,created_at)
values ('58000000-0000-4000-8000-000000000021','58000000-0000-4000-8000-000000000020','Jeudi','Concert','Genève','Genève',now()+interval '7 days',now()-interval '1 day');
insert into public.gig_requests(id,host_id,title,date,genre,wanted_instruments,wanted_school_ids,place,neighborhood,public_location_label)
values ('58000000-0000-4000-8000-000000000040','58000000-0000-4000-8000-000000000001','Initial',now()+interval '7 days','Jazz',array['Saxophone'],array['58000000-0000-4000-8000-000000000010']::uuid[],'Genève','1201 Genève','Genève');
insert into public.gig_applications(id,gig_id,musician_id,instrument,message)
values ('58000000-0000-4000-8000-000000000041','58000000-0000-4000-8000-000000000040','58000000-0000-4000-8000-000000000002','Saxophone','QA candidature');

set local role authenticated;
select set_config('request.jwt.claim.sub','58000000-0000-4000-8000-000000000001',true);

do $$
declare c jsonb; l jsonb; marker timestamptz;
begin
  update public.group_events set title='Concert' where id='58000000-0000-4000-8000-000000000021';
  if (select schedule_changed_at is not null from public.group_events where id='58000000-0000-4000-8000-000000000021') then raise exception 'title-only edit marked schedule'; end if;
  update public.group_events set date=date+interval '1 hour' where id='58000000-0000-4000-8000-000000000021';
  select schedule_changed_at into marker from public.group_events where id='58000000-0000-4000-8000-000000000021';
  if marker is null then raise exception 'time change not marked'; end if;
  update public.group_events set setlist='[]' where id='58000000-0000-4000-8000-000000000021';
  if (select schedule_changed_at <> marker from public.group_events where id='58000000-0000-4000-8000-000000000021') then raise exception 'setlist edit marked schedule'; end if;
  perform public.set_group_event_location('58000000-0000-4000-8000-000000000021','Genève','Rue QA 1','1201','Genève','CH');
  if (select schedule_changed_at <= marker from public.group_events where id='58000000-0000-4000-8000-000000000021') then raise exception 'private location not marked'; end if;

  c:=jsonb_build_object('title','Modifié','date',now()+interval '8 days','genre','Jazz','description','Nouveau texte','fee',100,'payment_method','twint','wanted_instruments',jsonb_build_array('Saxophone'),'wanted_levels',jsonb_build_array('Avancé'),'wanted_school_ids',jsonb_build_array('58000000-0000-4000-8000-000000000010'),'place','AMR','neighborhood','1201 Genève','public_location_label','AMR');
  l:='{"publicLocationLabel":"AMR","exactAddress":"Rue privée 2","postalCode":"1201","city":"Genève","countryCode":"CH"}';
  perform public.update_gig_request('58000000-0000-4000-8000-000000000040',c,l);
  if (select title <> 'Modifié' or fee <> 100 from public.gig_requests where id='58000000-0000-4000-8000-000000000040') then raise exception 'edit did not persist'; end if;
  if (select count(*) <> 1 from public.gig_applications where gig_id='58000000-0000-4000-8000-000000000040') then raise exception 'edit lost application'; end if;
  if (select exact_address <> 'Rue privée 2' from public.get_gig_request_location('58000000-0000-4000-8000-000000000040')) then raise exception 'private location did not persist'; end if;
  begin
    perform public.update_gig_request('58000000-0000-4000-8000-000000000040',jsonb_set(c,'{title}','"Must rollback"'),jsonb_set(l,'{exactAddress}',to_jsonb(repeat('x',601))));
    raise exception 'invalid address accepted';
  exception when sqlstate '22023' then null;
  end;
  if (select title <> 'Modifié' from public.gig_requests where id='58000000-0000-4000-8000-000000000040') then raise exception 'edit not atomic'; end if;
  perform public.update_gig_request('58000000-0000-4000-8000-000000000040',jsonb_set(c,'{wanted_levels}','null'),l);
  if (select cardinality(wanted_levels) <> 0 from public.gig_requests where id='58000000-0000-4000-8000-000000000040') then raise exception 'open levels not retained'; end if;
  begin
    perform public.update_gig_request('58000000-0000-4000-8000-000000000040',jsonb_set(c,'{wanted_school_ids}','["58000000-0000-4000-8000-000000000099"]'),l);
    raise exception 'invalid school accepted';
  exception when sqlstate '22023' then null;
  end;
  perform public.accept_gig_application('58000000-0000-4000-8000-000000000041');
  begin
    perform public.update_gig_request('58000000-0000-4000-8000-000000000040',jsonb_set(c,'{wanted_instruments}','["Piano"]'),l);
    raise exception 'accepted slot was removed';
  exception when sqlstate '22023' then null;
  end;
  perform public.update_gig_request('58000000-0000-4000-8000-000000000040',jsonb_set(c,'{fee}','150'),l);
  if not exists(select 1 from public.gig_applications where id='58000000-0000-4000-8000-000000000041' and status='accepted') then raise exception 'accepted application was reset'; end if;
end;
$$;

-- Un membre propose un morceau ; il ne peut pas l'approuver lui-même.
select set_config('request.jwt.claim.sub','58000000-0000-4000-8000-000000000002',true);
do $$
declare original jsonb; desired jsonb;
begin
  select repertoire into original from public.music_groups where id='58000000-0000-4000-8000-000000000020';
  desired:=original||'[{"id":"58000000-0000-4000-8000-000000000031","title":"Suggestion","is_approved":false,"suggested_by":"58000000-0000-4000-8000-000000000002"}]';
  perform public.merge_group_repertoire_snapshot('58000000-0000-4000-8000-000000000020',original,desired);
  begin
    perform public.merge_group_repertoire_snapshot('58000000-0000-4000-8000-000000000020',desired,jsonb_set(desired,'{1,is_approved}','true'));
    raise exception 'member self-approved suggestion';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.update_gig_request('58000000-0000-4000-8000-000000000040','{}','{}');
    raise exception 'other member edited SOS';
  exception when insufficient_privilege then null;
  end;
end;
$$;

-- Approbation leader, morceau propre à l'événement, sets et Auto-SOS idempotent.
select set_config('request.jwt.claim.sub','58000000-0000-4000-8000-000000000001',true);
do $$
declare original jsonb; sid uuid; sid2 uuid;
begin
  select repertoire into original from public.music_groups where id='58000000-0000-4000-8000-000000000020';
  perform public.merge_group_repertoire_snapshot('58000000-0000-4000-8000-000000000020',original,jsonb_set(original,'{1,is_approved}','true'));
  perform public.merge_event_setlist_snapshot('58000000-0000-4000-8000-000000000021','[]','[{"id":"58000000-0000-4000-8000-000000000035","title":"Uniquement ce concert","is_approved":true,"suggested_by":"58000000-0000-4000-8000-000000000001","solos":[]},{"id":"58000000-0000-4000-8000-000000000036","title":"Deuxième set","starts_set":true,"is_approved":true,"suggested_by":"58000000-0000-4000-8000-000000000001","solos":[]}]');
  if (select jsonb_array_length(repertoire) <> 2 from public.music_groups where id='58000000-0000-4000-8000-000000000020') then raise exception 'event song leaked into repertoire'; end if;
  if (select setlist#>>'{1,starts_set}' <> 'true' from public.group_events where id='58000000-0000-4000-8000-000000000021') then raise exception 'set break lost'; end if;
end;
$$;
select set_config('request.jwt.claim.sub','58000000-0000-4000-8000-000000000002',true);
insert into public.event_attendance(event_id,profile_id,status,responded_at)
values('58000000-0000-4000-8000-000000000021','58000000-0000-4000-8000-000000000002','unavailable',now());
select set_config('request.jwt.claim.sub','58000000-0000-4000-8000-000000000001',true);
update public.music_groups set auto_sos_enabled=true,auto_sos_min_level='same' where id='58000000-0000-4000-8000-000000000020';
do $$
declare a uuid; b uuid; c jsonb; old_date timestamptz;
begin
  select gig_id into a from public.create_auto_sos('58000000-0000-4000-8000-000000000021','58000000-0000-4000-8000-000000000002','Concert — Saxophone','','Saxophone');
  select gig_id into b from public.create_auto_sos('58000000-0000-4000-8000-000000000021','58000000-0000-4000-8000-000000000002','Concert — Saxophone','','Saxophone');
  if a is null or a<>b then raise exception 'duplicate auto SOS'; end if;
  if not exists(select 1 from public.gig_requests where id=a and wanted_instruments=array['Saxophone'] and wanted_levels=array['Avancé']) then raise exception 'absent profile not reused'; end if;
  select to_jsonb(g),g.date into c,old_date from public.gig_requests g where id=a;
  perform public.update_gig_request(a,jsonb_set(jsonb_set(c,'{title}','"SOS lié modifié"'),'{date}',to_jsonb(now()+interval '20 days')),'{"exactAddress":"Autre adresse"}');
  if not exists(select 1 from public.gig_requests where id=a and date=old_date and event_id='58000000-0000-4000-8000-000000000021' and title='SOS lié modifié') then raise exception 'linked event identity or time changed'; end if;

end;
$$;
rollback;
