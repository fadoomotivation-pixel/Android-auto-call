-- How long the recording actually is, as opposed to how long the call was.
--
-- THE QUESTION NOBODY COULD ANSWER
--
-- A 4m52s call played back as "0:01 / 0:01" and the founder asked why the
-- recording was one second. Nothing in this database could answer him, because
-- nothing had ever measured the audio:
--
--   duration_seconds   the PHONE'S CALL LOG — how long the two people talked
--   recording_seconds  the x-duration header the app sends, which is a COPY of
--                      that same number (recording-upload line 158). It has
--                      never described the audio at all.
--
-- So a one-second stub and a perfect five-minute recording are identical in
-- this table, and both render "4m 52s" in the admin. The screen was not lying
-- on purpose; it had nothing else to print. I reached for recording_seconds
-- myself while diagnosing this and concluded the files were fine. They were
-- not, and the column could never have told me either way.
--
-- WHAT THE NUMBERS ACTUALLY SHOWED
--
--   952  SIM recordings marked ready in 30 days
--   253  have a transcript of any substance
--   104  calls over a minute long with no transcript at all
--
-- and the failure rate is FLAT across every call length — 21% of calls under
-- 15 seconds transcribe, 33% of calls over three minutes. A truncation bug
-- would get worse with length. This does not. Something is wrong with the
-- files themselves, uniformly, and until now there was no way to see it.
--
-- audio_complete IS THE DIAGNOSIS, NOT JUST A FLAG
--
-- An MPEG-4 file keeps its duration in a `moov` box that MediaRecorder writes
-- LAST, on stop(). A file cut off before that — a killed service, a stop()
-- that threw, an upload that read the file while the recorder still held it —
-- contains audio and no moov. A player cannot find a duration, so it prints a
-- second. Whisper cannot decode it, so the transcript comes back empty. One
-- cause, both symptoms, and it is detectable in twenty bytes of header.
--
-- Nothing is back-filled. These two columns describe uploads from here on;
-- the 952 files already in Drive are not re-read, because re-downloading them
-- to count bytes is a job worth doing deliberately and not inside a migration.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-10-02.

alter table public.call_logs add column if not exists audio_seconds integer;
alter table public.call_logs add column if not exists audio_complete boolean;

comment on column public.call_logs.audio_seconds is
  'Length of the RECORDING, read from the container''s own header at upload. Null when the format gives no cheap exact answer. Not to be confused with duration_seconds (how long the call was) or recording_seconds (a copy of that).';

comment on column public.call_logs.audio_complete is
  'False when the uploaded container is unfinished — an mp4 with audio but no moov box, which no player can time and no transcriber can read. The single best explanation for a long call that plays as one second.';

-- Finding the broken ones has to be one query, or nobody will run it.
create or replace view public.v_broken_recordings as
select cl.id,
       cl.company_id,
       cl.salesperson_id,
       cl.started_at,
       cl.phone,
       cl.duration_seconds as call_seconds,
       cl.audio_seconds,
       cl.audio_complete,
       cl.recording_source,
       cl.recording_error,
       coalesce(length(cl.transcript), 0) as transcript_chars
from public.call_logs cl
where cl.recording_status = 'ready'
  and (
    cl.audio_complete is false
    -- Audio that is under a fifth of the call it belongs to. The threshold is
    -- deliberately loose: a recorder that starts a second late is normal, a
    -- four-minute call that produced eleven seconds of audio is not.
    or (cl.audio_seconds is not null and cl.duration_seconds > 30
        and cl.audio_seconds < cl.duration_seconds * 0.2)
  );

comment on view public.v_broken_recordings is
  'Recordings that are stored and marked ready but are not actually playable or complete — an unfinished container, or audio far shorter than the call it came from.';
