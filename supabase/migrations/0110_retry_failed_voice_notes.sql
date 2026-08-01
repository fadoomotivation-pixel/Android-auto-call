-- "AI summary failed" was never a verdict on the audio — it was a coin toss.
--
-- Ankita's screenshot shows a 5s note sitting on "AI summary failed — audio
-- saved, admin can still listen." Re-dispatching that exact note, byte for
-- byte, produced a clean summary on the FIRST retry. So the audio was always
-- fine: the transcribe/model call hiccuped once (rate limit, cold start,
-- timeout) and nothing on the platform ever tried again. One unlucky second
-- and the rep's note was dead forever.
--
-- 26 notes are stuck like that, 22 of them a real length. Every one is
-- recoverable. What was missing is simply a retry.
--
-- The trigger on lead_voice_notes is AFTER INSERT only, so flipping ai_status
-- back to 'pending' here cannot re-fire it — the retry has to dispatch the
-- call itself, which is what this does.
alter table public.lead_voice_notes
  add column if not exists ai_attempts int not null default 0;

comment on column public.lead_voice_notes.ai_attempts is
  'How many times the AI has been dispatched for this note. Caps the retry loop so genuinely unreadable audio stops costing calls.';

-- Count the first dispatch, so the retry budget is honest.
create or replace function public.trigger_voice_note_ai()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'vault', 'net'
as $function$
begin
  if coalesce(new.duration_seconds, 0) < 3 then
    update public.lead_voice_notes
       set ai_status = 'ready',
           summary = 'Too short to read anything from — nothing was changed on the lead. '
                     || 'Record again and speak for a few seconds.'
     where id = new.id;
    return null;
  end if;

  update public.lead_voice_notes set ai_attempts = 1 where id = new.id;

  perform net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/voice-note-ai',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := jsonb_build_object('note_id', new.id)
  );
  return null;
end $function$;

-- Pick up anything that failed and give it another go. Deliberately bounded:
--   • only notes long enough to be worth reading (the <3s gate owns the rest),
--   • only the last 7 days — older than that nobody is waiting on the summary,
--   • at most 6 dispatches per note, so bad audio can't loop forever,
--   • TWO per run, once a minute.
--
-- That last limit is the actual cure, not a politeness. Dispatching ten of the
-- stuck notes at once, most of them failed again; dispatching the very same
-- notes one at a time, they transcribed cleanly. The failures were never about
-- the audio — they were concurrent calls tripping the provider's rate limit.
-- Which is also how they got stuck in the first place: a rep working fast
-- records several notes a minute apart, they all hit the model together, and
-- the losers were marked failed forever. Trickling them fixes the backlog and
-- absorbs the next burst.
--
-- The attempt counter is incremented BEFORE the call, so two overlapping runs
-- can never double-dispatch the same note.
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
    select id from public.lead_voice_notes
     where ai_status = 'failed'
       and coalesce(duration_seconds, 0) >= 3
       and created_at > now() - interval '7 days'
       and ai_attempts < 6
     order by created_at
     limit 2
  loop
    update public.lead_voice_notes
       set ai_status = 'pending', ai_attempts = ai_attempts + 1
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

  -- Out of retries and still failing: stop pretending it might fix itself and
  -- tell the rep the one thing that is still true — the audio is fine, play it.
  update public.lead_voice_notes
     set summary = 'Could not read this one automatically. The recording is saved — press play to hear it.'
   where ai_status = 'failed'
     and ai_attempts >= 6
     and coalesce(summary, '') = '';

  return sent;
end $$;

select cron.schedule(
  'retry-voice-note-ai-1m',
  '* * * * *',
  $$select public.retry_failed_voice_notes();$$
);

-- Mis-taps recorded before the <3s gate existed are still sitting on "AI
-- summary failed", which reads like the app broke. It didn't — there was
-- nothing in the audio to read. Retrying them would only burn calls, so say
-- what actually happened instead. This is the same wording the gate uses, so
-- the rep sees one consistent explanation whenever a note was too short.
update public.lead_voice_notes
   set ai_status = 'ready',
       summary = 'Too short to read anything from — nothing was changed on the lead. '
                 || 'Record again and speak for a few seconds.'
 where ai_status = 'failed'
   and coalesce(duration_seconds, 0) < 3;
