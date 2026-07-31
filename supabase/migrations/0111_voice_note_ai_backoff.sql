-- The notes weren't unreadable. The account was out of tokens.
--
-- 0110 assumed the failures were concurrent calls tripping a per-request rate
-- limit, because dispatching stuck notes one at a time fixed them. That was
-- true while quota remained. Once the last few were dispatched alone and STILL
-- failed, the API finally said what was actually wrong:
--
--   Rate limit reached for model `llama-3.3-70b-versatile` … on tokens per day
--   (TPD): Limit 100000, Used 99567
--
-- So the real ceiling is a DAILY token budget, and it is being spent by about
-- lunchtime. Every note recorded after that fails, which is exactly what the
-- reps have been seeing: fine in the morning, "AI summary failed" all
-- afternoon. Retrying inside the same day cannot fix it — there is nothing
-- left to retry with.
--
-- Two changes follow from that:
--   1. Store WHY a note failed, so nobody has to guess again.
--   2. Back off instead of hammering. A minute-by-minute retry against an
--      exhausted daily budget burns the retry allowance in a few minutes and
--      leaves the note dead for the rest of the day; spreading attempts out
--      means a note recorded at 2pm is still waiting, and succeeds, when the
--      quota rolls over.
alter table public.lead_voice_notes
  add column if not exists ai_error text,
  add column if not exists ai_next_retry_at timestamptz;

comment on column public.lead_voice_notes.ai_error is
  'Last failure reason from voice-note-ai. Usually the provider quota message.';
comment on column public.lead_voice_notes.ai_next_retry_at is
  'Earliest time the retry may dispatch this note again (backoff).';

create index if not exists lead_voice_notes_retry_idx
  on public.lead_voice_notes (ai_status, ai_next_retry_at)
  where ai_status = 'failed';

-- Same bounds as before, plus:
--   • a note waits for its backoff window before being tried again,
--   • the window grows 3, 6, 9 … up to 60 minutes, so a note that failed on an
--     exhausted daily budget is still in the queue when the budget resets,
--   • the allowance rises to 12 attempts, which those slower windows spread
--     across roughly half a day rather than twelve minutes.
create or replace function public.retry_failed_voice_notes()
returns integer
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $$
declare
  n record;
  sent int := 0;
  key text := coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '');
begin
  for n in
    select id, ai_attempts from public.lead_voice_notes
     where ai_status = 'failed'
       and coalesce(duration_seconds, 0) >= 3
       and created_at > now() - interval '7 days'
       and ai_attempts < 12
       and coalesce(ai_next_retry_at, created_at) <= now()
     order by created_at
     limit 2
  loop
    update public.lead_voice_notes
       set ai_status = 'pending',
           ai_attempts = ai_attempts + 1,
           ai_next_retry_at = now() + least(
             interval '60 minutes',
             interval '3 minutes' * (ai_attempts + 1)
           )
     where id = n.id;

    perform net.http_post(
      url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/voice-note-ai',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || key
      ),
      body := jsonb_build_object('note_id', n.id)
    );
    sent := sent + 1;
  end loop;

  -- Out of retries: say which wall we hit. A quota message is not the rep's
  -- fault and shouldn't read like their recording was bad.
  update public.lead_voice_notes
     set summary = case
       when ai_error ilike '%rate limit%' or ai_error ilike '%quota%'
         then 'The AI ran out of its daily limit before it reached this note. The recording is saved — press play to hear it.'
       else 'Could not read this one automatically. The recording is saved — press play to hear it.'
     end
   where ai_status = 'failed'
     and ai_attempts >= 12
     and coalesce(summary, '') = '';

  return sent;
end $$;

-- The notes parked at the old 6-attempt ceiling never got a fair chance: they
-- burnt their allowance against an empty daily budget, a minute apart. Put
-- them back in the queue with the new spacing.
update public.lead_voice_notes
   set ai_attempts = 0,
       ai_next_retry_at = null,
       summary = null
 where ai_status = 'failed'
   and ai_attempts >= 6;
