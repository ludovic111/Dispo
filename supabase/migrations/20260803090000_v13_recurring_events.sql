-- Dispo 1.3 — événements récurrents (répétition hebdomadaire, etc.).
--
-- Chaque occurrence reste une ligne `group_events` à part entière : sa propre
-- setlist, sa propre feuille de présence. Elles sont reliées par `series_id`,
-- ce qui permet de les colorer ensemble dans l'app et d'annuler toute la
-- série d'un coup. `reminder_lead_days` porte le délai de rappel choisi par
-- le leader (2 jours par défaut côté app) : il voyage avec l'événement pour
-- que chaque appareil planifie le même rappel local.

alter table public.group_events
  add column if not exists series_id uuid,
  add column if not exists recurrence text,
  add column if not exists reminder_lead_days smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'group_events_recurrence_check'
  ) then
    alter table public.group_events
      add constraint group_events_recurrence_check
      check (
        recurrence is null
        or recurrence in ('Ponctuel', 'Chaque semaine', 'Toutes les 2 semaines', 'Chaque mois')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'group_events_reminder_lead_check'
  ) then
    alter table public.group_events
      add constraint group_events_reminder_lead_check
      check (reminder_lead_days is null or reminder_lead_days between 0 and 60);
  end if;
end $$;

-- Retrouver les autres dates d'une série (suppression groupée, affichage).
create index if not exists group_events_series_idx
  on public.group_events (series_id)
  where series_id is not null;
