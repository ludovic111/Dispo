-- Dispo 1.3 — règles de la bêta fermée + statut « pro ».
--
-- 1. BÊTA : pendant la phase de test avec un cercle d'invités, Premium est
--    ouvert à tout le monde. Aucun achat n'est proposé dans l'app, donc rien
--    ne doit dépendre de `is_premium` côté serveur : ni l'avant-première des
--    SOS, ni la création de groupe. Ces deux règles sont à rétablir le jour
--    de la mise en vente (voir la fin du fichier).
-- 2. PRO : le cachet d'un SOS et les notes en étoiles ne concernent que les
--    musiciens de niveau « Professionnel ». Un amateur ne voit pas les
--    montants et ne peut pas être noté — entre amateurs, il n'y a que
--    « on a joué ensemble ».
-- 3. DÉMO : les comptes d'exemple ne doivent plus polluer le fil d'un vrai
--    utilisateur.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

/// Le compte connecté est-il un musicien professionnel ?
create or replace function public.viewer_is_pro()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select level = 'Professionnel' from public.profiles where id = auth.uid()),
    false
  );
$$;

/// Le compte connecté est-il un compte de démonstration ?
create or replace function public.viewer_is_demo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_demo from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke execute on function public.viewer_is_pro() from public, anon;
revoke execute on function public.viewer_is_demo() from public, anon;
grant execute on function public.viewer_is_pro() to authenticated;
grant execute on function public.viewer_is_demo() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Bêta : plus rien ne dépend de `is_premium`
-- ---------------------------------------------------------------------------

create or replace function public.can_see_full_gig(gig public.gig_requests)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Bêta : tout le monde voit tout. À la mise en vente, restaurer :
  --   gig.host_id = auth.uid()
  --   or gig.posted_at + interval '30 minutes' <= now()
  --   or coalesce((select is_premium from public.profiles where id = auth.uid()), false)
  select auth.uid() is not null;
$$;

drop policy if exists "music_groups_insert_premium" on public.music_groups;
create policy "music_groups_insert_own"
  on public.music_groups for insert to authenticated
  with check (leader_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Cachets et notes réservés aux professionnels
-- ---------------------------------------------------------------------------

-- Le fil masque désormais le cachet et le moyen de versement aux non-pros.
create or replace view public.gig_requests_feed
with (security_invoker = false) as
  select
    g.id,
    g.host_id,
    case when public.can_see_full_gig(g.*) then g.title end as title,
    g.date,
    case when public.can_see_full_gig(g.*) then g.place end as place,
    case when public.can_see_full_gig(g.*) then g.neighborhood end as neighborhood,
    g.genre,
    g.wanted_instruments,
    -- Un cachet ne s'affiche qu'entre professionnels.
    case when public.viewer_is_pro() then g.fee end as fee,
    case when public.can_see_full_gig(g.*) then g.description end as description,
    g.posted_at,
    not public.can_see_full_gig(g.*) as is_locked,
    case when public.viewer_is_pro() then g.payment_method end as payment_method,
    g.filled_instruments
  from public.gig_requests g
  where g.date > now()
    -- 3. Les SOS des comptes de démo restent entre comptes de démo.
    and (public.viewer_is_demo() or not exists (
      select 1 from public.profiles p where p.id = g.host_id and p.is_demo
    ));

grant select on public.gig_requests_feed to authenticated;

-- Seuls les professionnels peuvent recevoir une note en étoiles.
drop policy if exists "ratings_insert_own" on public.ratings;
create policy "ratings_insert_own"
  on public.ratings for insert to authenticated
  with check (
    rater_id = (select auth.uid())
    and rated_id <> (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = rated_id and p.level = 'Professionnel'
    )
  );

drop policy if exists "ratings_update_own" on public.ratings;
create policy "ratings_update_own"
  on public.ratings for update to authenticated
  using (rater_id = (select auth.uid()))
  with check (
    rater_id = (select auth.uid())
    and rated_id <> (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = rated_id and p.level = 'Professionnel'
    )
  );

-- Les notes déjà données à des non-pros n'ont plus lieu d'être : elles
-- disparaissent, et le trigger d'agrégat remet les moyennes à jour.
delete from public.ratings r
using public.profiles p
where p.id = r.rated_id and p.level <> 'Professionnel';
