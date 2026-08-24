-- Android utilise les Firebase Installation IDs (FID), actuellement plus
-- courts que les anciens tokens FCM. La colonne conserve son nom historique
-- afin de rester compatible avec les appareils iOS et la file existante.

alter table public.push_devices
  drop constraint push_devices_token_check;

alter table public.push_devices
  add constraint push_devices_token_check
  check (length(token) between 16 and 256);
