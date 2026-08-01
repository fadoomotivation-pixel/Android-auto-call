-- A note stuck half-way is worse than one that failed.
--
-- 0110's retry only ever looked at ai_status = 'failed'. But a note passes
-- through 'pending' (queued) and 'processing' (the AI has it) on the way, and
-- if the dispatch dies in between — edge function timeout, pg_net request that
-- never lands, a deploy mid-flight — the note simply stops there. It is not
-- failed, so nothing retries it. It is not ready, so the rep never gets a
-- summary. It just sits.
--
-- Five notes were sitting in exactly that state for TWENTY-EIGHT HOURS when
-- this was found, and nothing on the platform would ever have touched them
-- again. That is the same shape as every other bug worth fixing today: not a
-- loud error, just work that quietly stopped and told nobody.
--
-- A dispatch takes seconds. Ten minutes is far past "still working" and safely
-- clear of anything genuinely in flight, so anything older than that in a
-- half-way state is stuck by definition and goes back in the queue. The
-- existing attempt cap and backoff then apply as normal, so a note that is
-- stuck for a real reason still can't loop forever.
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
     where coalesce(duration_seconds, 0) >= 3
       and created_at > now() - interval '7 days'
       and ai_attempts < 12
       and coalesce(ai_next_retry_at, created_at) <= now()
       and (
         ai_status = 'failed'
         -- Half-way and going nowhere.
         or (ai_status in ('pending', 'processing')
             and created_at < now() - interval '10 minutes')
       )
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

-- Free the ones already stranded: they were parked against providers that no
-- longer sit first in the chain, so give them a clean run at it.
update public.lead_voice_notes
   set ai_attempts = 0, ai_next_retry_at = null
 where ai_status in ('pending', 'processing')
   and created_at < now() - interval '10 minutes'
   and coalesce(duration_seconds, 0) >= 3;
