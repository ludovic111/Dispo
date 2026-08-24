-- Dispo 2.4 — un même backend de notifications pour iOS et Android.
-- La livraison reste séparée par fournisseur dans l'Edge Function `push` :
-- un token FCM ne doit jamais être envoyé à APNs.

alter table public.push_devices
  drop constraint push_devices_platform_check;

alter table public.push_devices
  add constraint push_devices_platform_check
  check (platform in ('ios', 'android'));
