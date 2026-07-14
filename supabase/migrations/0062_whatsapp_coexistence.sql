-- Coexistence: record when the business app's contact list last synced.
-- (The webhook now also handles message_echoes + history backfill; those need
--  no new columns — they reuse whatsapp_messages.)
alter table public.whatsapp_integrations
  add column if not exists last_contacts_sync_at timestamptz;
