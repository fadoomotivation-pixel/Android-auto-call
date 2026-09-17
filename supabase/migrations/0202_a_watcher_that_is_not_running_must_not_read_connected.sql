-- The worker keeps stopping, and the screen keeps saying "connected".
--
-- WHAT THE EVIDENCE SHOWS
--
--   16 Sept 13:47 → 19:30   silent. Heartbeat was 4h50m old: the process was
--                           DEAD, not idle.
--   16 Sept 19:30 → 17 Sept 01:09   alive after a manual upload. Messages,
--                           names, files — everything worked.
--   17 Sept 01:09 → 15:30   silent again. Heartbeat 14h21m old. Dead again.
--
-- A heartbeat fires every four minutes. Fourteen hours of silence from it is
-- not a quiet rep or a sleepy socket; the Node process is not running. Hostinger
-- gets no inbound HTTP to this app — the worker only makes outbound calls — so
-- it is idled out, and nothing brings it back until somebody uploads a zip.
--
-- This also corrects yesterday's conclusion. Messages resumed right after the
-- v25 upload and the presence refresh was credited with it — but that upload
-- also restarted a process that had been dead for five hours, which explains
-- the recovery on its own. The presence refresh may still be right; it has not
-- been shown to be, and the outage it was blamed for was a stopped process.
--
-- Two fixes, neither of which is in the worker, because no code inside a
-- process can keep that process alive.
--
-- 1. KEEP IT WARM. A GET to /health every three minutes is inbound traffic,
--    which is what the host is waiting for. /health is the one route that needs
--    no bearer, exactly so it can be pinged.
--
-- 2. STOP LYING ABOUT IT. status stayed 'connected' through both outages
--    because nothing writes to that column when a process simply stops. Every
--    screen reading it was wrong for nineteen of the last twenty-six hours, and
--    the founder found out by noticing a video he had sent was missing from a
--    chat.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-17.

create or replace function public.wa_keepalive()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare n integer := 0;
begin
  perform net.http_get(
    url := s.base_url || '/health',
    timeout_milliseconds := 8000
  )
  from public.wa_rep_sessions s
  where coalesce(s.base_url, '') <> '';
  get diagnostics n = row_count;
  return n;
end
$function$;

comment on function public.wa_keepalive() is
  'Pings each worker''s /health so the host does not idle the process out. The worker only makes OUTBOUND calls, so without this it receives no traffic at all and gets put to sleep — twice in twenty-six hours, for five hours and then fourteen.';

create or replace function public.wa_watchdog()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare n integer;
begin
  update public.wa_rep_sessions s
     set status = 'offline',
         last_error = 'The watcher stopped running ' ||
           case
             when now() - s.link_ok_at >= interval '1 hour'
               then round(extract(epoch from now() - s.link_ok_at) / 3600)::text || ' hours ago'
             else round(extract(epoch from now() - s.link_ok_at) / 60)::text || ' minutes ago'
           end ||
           '. Nothing has been captured since then — messages sent to this rep in that time are not here. Re-upload the worker to restart it.'
   where s.link_ok_at is not null
     and s.link_ok_at < now() - interval '15 minutes'
     and s.status is distinct from 'offline';
  get diagnostics n = row_count;

  update public.wa_rep_sessions s
     set status = 'connected'
   where s.status = 'offline'
     and s.link_ok_at >= now() - interval '15 minutes';

  return n;
end
$function$;

comment on function public.wa_watchdog() is
  'Flips a rep session to offline when its heartbeat goes stale, with a sentence saying how long and what it means. status used to stay "connected" through a dead process, so every screen reporting on it was confidently wrong.';

-- cron.schedule is not idempotent across re-runs; unschedule first if present.
select cron.unschedule('wa-keepalive-3min') where exists (select 1 from cron.job where jobname = 'wa-keepalive-3min');
select cron.unschedule('wa-watchdog-5min')  where exists (select 1 from cron.job where jobname = 'wa-watchdog-5min');
select cron.schedule('wa-keepalive-3min', '*/3 * * * *', $$select public.wa_keepalive();$$);
select cron.schedule('wa-watchdog-5min',  '*/5 * * * *', $$select public.wa_watchdog();$$);
