-- ============================================================
-- 1. Voice-note AI trigger — server-side, bulletproof
--    The app used to kick voice-note-ai itself; if that request died
--    the note sat on "AI summary ban raha hai…" forever. Now the DB
--    fires the function the moment a note row lands.
-- 2. rep-assistant crons — daily agenda (10:00 IST), bhoola-lead
--    guard (12:00 IST), and twice-a-day AI motivation quotes
--    (11:00 & 16:00 IST) for telecallers.
-- ============================================================
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.trigger_voice_note_ai()
returns trigger language plpgsql security definer set search_path = public, vault, net as $$
begin
  perform net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/voice-note-ai',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := jsonb_build_object('note_id', new.id)
  );
  return null;
end $$;

drop trigger if exists trg_voice_note_ai on public.lead_voice_notes;
create trigger trg_voice_note_ai
  after insert on public.lead_voice_notes
  for each row execute function public.trigger_voice_note_ai();

-- ---------- rep-assistant crons (times are UTC; IST = UTC+5:30) ----------
create or replace function public.call_rep_assistant(p_task text)
returns void language plpgsql security definer set search_path = public, vault, net as $$
begin
  perform net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/rep-assistant',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := jsonb_build_object('task', p_task)
  );
end $$;

do $$ begin perform cron.unschedule('rep-agenda-daily');   exception when others then null; end $$;
do $$ begin perform cron.unschedule('rep-guard-daily');    exception when others then null; end $$;
do $$ begin perform cron.unschedule('rep-quote-morning');  exception when others then null; end $$;
do $$ begin perform cron.unschedule('rep-quote-evening');  exception when others then null; end $$;

select cron.schedule('rep-agenda-daily',  '30 4 * * *',  $$select public.call_rep_assistant('agenda')$$);  -- 10:00 IST
select cron.schedule('rep-guard-daily',   '30 6 * * *',  $$select public.call_rep_assistant('guard')$$);   -- 12:00 IST
select cron.schedule('rep-quote-morning', '30 5 * * *',  $$select public.call_rep_assistant('quote')$$);   -- 11:00 IST
select cron.schedule('rep-quote-evening', '30 10 * * *', $$select public.call_rep_assistant('quote')$$);   -- 16:00 IST
