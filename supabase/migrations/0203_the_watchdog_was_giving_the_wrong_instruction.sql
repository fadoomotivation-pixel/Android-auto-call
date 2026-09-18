-- The watchdog said "re-upload the worker to restart it".
--
-- The worker was running the whole time. It answers /health every three
-- minutes and has been saying, to anyone able to ask it:
--
--   {"sessions":1,"states":{"disconnected":1},
--    "last_error":"No one scanned the QR, so it stopped refreshing."}
--
-- The WhatsApp login had been removed from the rep's phone at 22:39. Nothing a
-- re-upload can touch — a logged-out device needs a person holding that phone.
--
-- A watchdog that names the wrong remedy is worse than one that names none: it
-- sends someone to do a thing that cannot work, and when it does not work they
-- conclude the diagnosis was right and the problem is deeper.
--
-- So it stops guessing. The worker now heartbeats for the life of a session
-- rather than only while connected (v27), which means its own status and its
-- own error reach last_error every four minutes. The watchdog only fills the
-- gap when NOTHING has been heard at all — and says exactly that, without
-- prescribing a cure it cannot know.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-18.

create or replace function public.wa_watchdog()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare n integer;
begin
  update public.wa_rep_sessions s
     set status = 'offline',
         last_error = 'No word from this rep''s watcher for ' ||
           case
             when now() - s.link_ok_at >= interval '1 hour'
               then round(extract(epoch from now() - s.link_ok_at) / 3600)::text || ' hours'
             else round(extract(epoch from now() - s.link_ok_at) / 60)::text || ' minutes'
           end ||
           '. Nothing has been captured in that time. Open the WhatsApp page — if it offers a QR, the rep is logged out and needs to scan; if it does not, the worker itself is down.'
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
  'Marks a rep session offline when nothing has been heard from its watcher for 15 minutes. It states the silence and what to check — never a remedy, because from here the two causes (logged-out link, stopped process) are indistinguishable. The worker reports its own status and error directly once it is heartbeating for the life of a session.';
