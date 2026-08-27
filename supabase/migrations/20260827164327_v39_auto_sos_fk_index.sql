-- Cover the Auto-SOS absent-member foreign key used by cleanup and joins.
create index if not exists gig_requests_auto_sos_absent_profile_id_idx
  on public.gig_requests(auto_sos_absent_profile_id)
  where auto_sos_absent_profile_id is not null;
