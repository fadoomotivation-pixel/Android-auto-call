-- ============================================================
-- Scheduled push reminders
-- A queue of future pushes ("kal 10 baje yaad dilana: site visit"),
-- drained every 5 minutes by pg_cron → notify-rep (FCM). Written by
-- trusted server code (e.g. the voice-note AI when it detects an
-- agreed site visit / callback in the telecaller's note).
-- ============================================================

create table if not exists public.scheduled_notifications (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid references public.companies(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  contact_id  uuid references public.contacts(id) on delete cascade,
  title       text not null,
  body        text not null,
  channel     text not null default 'hot_leads',
  send_at     timestamptz not null,
  sent_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_sched_notif_due on public.scheduled_notifications(send_at) where sent_at is null;

-- Server-only table: RLS on with no user policies (service role bypasses).
alter table public.scheduled_notifications enable row level security;

-- Drains due reminders. SKIP LOCKED + mark-before-send keeps overlapping
-- cron runs from double-pushing.
create or replace function public.process_due_notifications()
returns int language plpgsql security definer set search_path = public, vault, net as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, user_id, contact_id, title, body, channel
    from public.scheduled_notifications
    where sent_at is null and send_at <= now()
    order by send_at
    limit 50
    for update skip locked
  loop
    update public.scheduled_notifications set sent_at = now() where id = r.id;
    perform net.http_post(
      url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/notify-rep',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
      ),
      body := jsonb_build_object(
        'user_ids', jsonb_build_array(r.user_id),
        'title', r.title,
        'body', r.body,
        'channel', r.channel
      ) || case when r.contact_id is null then '{}'::jsonb
                else jsonb_build_object('data', jsonb_build_object('contact_id', r.contact_id::text)) end
    );
    n := n + 1;
  end loop;
  return n;
end $$;

-- Every 5 minutes; idempotent re-schedule.
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
  perform cron.unschedule('send-due-notifications');
exception when others then null; end $$;
select cron.schedule('send-due-notifications', '*/5 * * * *', 'select public.process_due_notifications();');
