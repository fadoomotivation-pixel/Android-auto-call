-- A one-second tap is not a voice note.
--
-- Whisper returns *something* even for near-silence, and the model then invented
-- an outcome from that nothing: of 49 one-second notes, 46 changed the lead's
-- stage, bumped the attempt counter and booked a callback. Those invented
-- callbacks are a large part of why Today filled with overdue work nobody asked
-- for, and why reps saw "AI summary failed" sitting next to a lead that had
-- quietly been moved.
--
-- The gate belongs here, at the point the AI is dispatched, so it holds however
-- the note arrived. Notes under 3 seconds are marked ready with an honest line
-- and the AI is never called — nothing is transcribed, nothing is invented, and
-- nothing on the lead moves. The audio is untouched and still playable, and
-- because the row lands as 'ready' the app won't sit re-kicking it forever.
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
