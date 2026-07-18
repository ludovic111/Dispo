-- can_see_full_gig est utilise par la policy et la vue teaser. Seuls les
-- membres authentifies doivent pouvoir l'invoquer; PUBLIC inclut sinon anon.
revoke all on function public.can_see_full_gig(public.gig_requests) from public, anon;
grant execute on function public.can_see_full_gig(public.gig_requests) to authenticated;
