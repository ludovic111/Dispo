-- Indexes de couverture des trois cles etrangeres ajoutees par la file
-- d'enrichissement. Ils gardent les suppressions de compte ou de morceau
-- bornees lorsque l'historique de demandes et de reservations grandit.

create index if not exists song_enrichment_jobs_last_requested_by_idx
  on private.song_enrichment_jobs(last_requested_by)
  where last_requested_by is not null;

create index if not exists song_enrichment_rate_events_song_idx
  on private.song_enrichment_rate_events(song_id, started_at desc);

create index if not exists song_enrichment_user_requests_song_idx
  on private.song_enrichment_user_requests(song_id, requested_at desc);
