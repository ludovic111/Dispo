-- Réponses ciblées dans les conversations de groupe. Aucun contenu recopié :
-- la citation est relue avec la RLS du message source, y compris sa suppression.
alter table public.group_messages
  add column reply_to_id uuid references public.group_messages(id) on delete set null,
  add constraint group_messages_reply_not_self check (reply_to_id is distinct from id);

create index group_messages_reply_to_id_idx on public.group_messages(reply_to_id)
  where reply_to_id is not null;

grant insert (reply_to_id) on public.group_messages to authenticated;

create function private.validate_group_message_reply()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1 from public.group_messages original
    where original.id = new.reply_to_id
      and original.group_id = new.group_id
      and original.deleted_at is null
  ) then
    raise exception 'group_reply_unavailable' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_group_message_reply() from public, anon, authenticated;

create trigger group_messages_validate_reply
  before insert or update of reply_to_id, group_id on public.group_messages
  for each row execute function private.validate_group_message_reply();

comment on column public.group_messages.reply_to_id is
  'Message du même groupe auquel cette réponse se rapporte ; citation relue sans copie de contenu.';
