-- Make the WhatsApp team inbox actually realtime + idempotent (security/hardening pass).

-- 1) Realtime: the inbox (WhatsAppInbox.tsx) subscribes to postgres_changes on
--    whatsapp_messages, but the table was never added to the realtime publication,
--    so no live events were delivered. RLS stays enforced for postgres_changes, so
--    subscribers only receive rows they can SELECT (the wa_messages_read policy:
--    rep = own, admin = company, super = all).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'whatsapp_messages'
  ) then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
end $$;

-- Full old-row on UPDATE so company_id realtime filters match reliably on status updates.
alter table public.whatsapp_messages replica identity full;

-- 2) Idempotency: Meta retries webhook deliveries. Enforce one row per provider
--    message id. NULLs are distinct in a unique index, so outbound rows without a
--    provider id still insert fine.
create unique index if not exists whatsapp_messages_wa_message_id_key
  on public.whatsapp_messages (wa_message_id);
