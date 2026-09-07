-- Acknowledging a visible thread also clears its message notifications.
-- Bound by the latest loaded message timestamp, including older paginated messages.
-- Invoker rights preserve message visibility and notification ownership RLS.
create or replace function public.mark_thread_notifications_read(
  p_source_table text, p_thread_id uuid, p_through timestamptz
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_source_table = 'group_messages' then
    update public.push_notifications n set read_at = now()
    from public.group_messages m
    where n.user_id = (select auth.uid()) and n.read_at is null
      and n.source_table = 'group_messages' and n.source_id = m.id
      and m.group_id = p_thread_id and m.created_at <= p_through;
  elsif p_source_table = 'messages' then
    update public.push_notifications n set read_at = now()
    from public.messages m
    where n.user_id = (select auth.uid()) and n.read_at is null
      and n.source_table = 'messages' and n.source_id = m.id
      and m.conversation_id = p_thread_id and m.created_at <= p_through;
  else
    raise exception 'invalid_message_source' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.mark_thread_notifications_read(text, uuid, timestamptz) from public, anon;
grant execute on function public.mark_thread_notifications_read(text, uuid, timestamptz) to authenticated;
