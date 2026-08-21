-- Remove the last server-side paths that supported bundled demo accounts.
-- Demo reels stored by real musicians are unrelated and remain supported.

create or replace view public.gig_requests_feed
with (security_invoker = true)
as
 select g.id,
        g.host_id,
        case when public.can_see_full_gig(g.*) then g.title else null::text end as title,
        g.date,
        case when public.can_see_full_gig(g.*) then g.place else null::text end as place,
        case when public.can_see_full_gig(g.*) then g.neighborhood else null::text end as neighborhood,
        g.genre,
        g.wanted_instruments,
        case when public.viewer_is_pro() then g.fee else null::integer end as fee,
        case when public.can_see_full_gig(g.*) then g.description else null::text end as description,
        g.posted_at,
        not public.can_see_full_gig(g.*) as is_locked,
        case when public.viewer_is_pro() then g.payment_method else null::text end as payment_method,
        g.filled_instruments,
        g.group_id,
        g.event_id,
        g.target_id,
        g.target_status,
        g.wanted_levels
   from public.gig_requests g
  where g.date > now()
    and (
        g.target_id is null
        or g.target_id = (select auth.uid())
        or g.host_id = (select auth.uid())
    )
    and (
        g.host_id = (select auth.uid())
        or g.target_id = (select auth.uid())
        or coalesce(array_length(g.wanted_instruments, 1), 0) = 0
        or not (g.wanted_instruments <@ coalesce(g.filled_instruments, '{}'::text[]))
        or exists (
            select 1
              from public.gig_applications a
             where a.gig_id = g.id
               and a.musician_id = (select auth.uid())
        )
    );

drop function if exists public.reply_as_demo(uuid);
drop function if exists public.viewer_is_demo();

drop trigger if exists profiles_protect_demo on public.profiles;
drop function if exists public.protect_demo_flag();
