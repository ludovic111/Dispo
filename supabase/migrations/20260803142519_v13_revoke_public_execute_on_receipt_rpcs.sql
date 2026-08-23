-- L'EXECUTE venait du grant implicite à PUBLIC : anon en héritait.
revoke execute on function public.mark_conversation_read(uuid) from public;
revoke execute on function public.mark_messages_delivered() from public;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
grant execute on function public.mark_messages_delivered() to authenticated;
