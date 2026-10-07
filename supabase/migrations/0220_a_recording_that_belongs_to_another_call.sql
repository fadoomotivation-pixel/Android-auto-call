-- The founder opened the app, pressed Play on a lead called Prashant, and
-- heard a stranger. He assumed a recording had leaked from somewhere it should
-- not have been. It had not. It was filed against the wrong buyer.
--
-- WHAT WAS ACTUALLY HAPPENING
--
-- The phone attaches an OEM recording to a call by picking the file whose
-- timestamp sits closest to the call's START, accepting it if it is within
-- TWELVE HOURS, and uploading it. It never asked whether the call connected.
--
-- So a number that rang out for ZERO seconds — which recorded nothing, because
-- nobody spoke — was handed the nearest file in the folder, which is the
-- previous call's conversation. When a rep power-dials, "nearest" is forty
-- seconds away.
--
--   2,108  calls that lasted zero seconds carry a recording
--   1,759  of them carry a TRANSCRIPT of somebody else's conversation
--     901  carry an AI SUMMARY written about that conversation
--     359  real leads have at least one
--      28  promises were extracted by promise-watch from audio that was never
--           theirs, and placed at the top of a rep's Call now list
--
-- Ankita's 2 Oct rows are the proof, and they are unanswerable: 15:12:57 and
-- 15:13:33, two separate no-answers to the same lead, zero seconds each,
-- pointing at two DIFFERENT Drive files, carrying a byte-identical
-- 129-character transcript of a conversation that happened on neither call.
--
-- WHAT THIS MIGRATION DOES, AND WHAT IT REFUSES TO DO
--
-- It does not delete anything. Every value it clears is copied first into
-- call_logs_foreign_audio_backup, Drive file id included, so a recording that
-- is genuinely some OTHER call's can still be found and re-filed later. The
-- audio in Drive is untouched.
--
-- What it clears from call_logs is the part that LIES: a status of 'ready' on
-- a call that recorded nothing, and a transcript and summary describing a
-- conversation that did not happen on this call. Those are not merely wrong —
-- they are read by lead-memory, by win-harvest and by the coach, and a rep is
-- being told what a buyer said by a machine that is quoting a different buyer.
--
-- The promises built from that audio become 'void'. Not 'duplicate' (they are
-- not a repeat of a real obligation) and not deleted (the fact that the system
-- invented them is worth keeping). They leave v_open_promises, which shows
-- only open and missed.
--
-- 28 promises trace back to a poisoned call; 18 of them were still open or
-- missed and are the ones this voids. The other 10 had already been settled as
-- kept or collapsed as duplicates, and rewriting a settled row to chase a
-- tidier number would be editing history to match a sentence in a header.
--
-- STILL TO DO BY HAND, and it is not optional: re-run lead-memory for the 359
-- affected leads. This migration cannot do it — lead_memory is a distillation,
-- not a join, and there is no way in SQL to tell which sentence in it came
-- from which call. Until that is re-run, those leads' memories still contain
-- the stranger's words.
--
-- The code fix ships alongside this: the phone now requires a file to have
-- been written DURING the call it is claimed for and skips calls with no talk
-- time, and recording-upload refuses audio that cannot belong to the call
-- (see audioBelongsToAnotherCall). Applying this migration without that code
-- means the next hourly sync re-creates every row it just cleaned.
--
-- APPLIED TO PRODUCTION on 2026-10-07, after that code merged in #507.
-- Result: 2,108 rows quarantined with all 2,108 Drive ids kept, 0 zero-second
-- calls left holding a recording, 18 promises voided. v_foreign_audio then
-- held 2 rows — both real connected calls whose audio runs far past them
-- (38s/496s and 12s/79s, both off-CRM). Those are the second rule, not the
-- zero-second one, and this migration deliberately does not touch them.

-- ── 1. Keep everything, before changing anything ────────────────────────────

create table if not exists public.call_logs_foreign_audio_backup (
  id uuid primary key,
  company_id uuid,
  salesperson_id uuid,
  contact_id uuid,
  started_at timestamptz,
  phone text,
  outcome text,
  duration_seconds integer,
  recording_path text,
  recording_status text,
  recording_seconds integer,
  recording_source text,
  audio_seconds integer,
  transcript text,
  summary text,
  quarantined_at timestamptz not null default now()
);

comment on table public.call_logs_foreign_audio_backup is
  'Recordings, transcripts and summaries detached from calls that lasted zero seconds and therefore could not have produced them. The Drive file id is kept so the audio can be re-filed against the call it really belongs to. Nothing here was deleted from Drive.';

-- RLS on with NO policies: PostgREST reaches nothing, the service role is
-- unaffected. This holds other people's conversations; it is not a table any
-- logged-in client should be able to read a row of. Same shape as 0219.
alter table public.call_logs_foreign_audio_backup enable row level security;

insert into public.call_logs_foreign_audio_backup (
  id, company_id, salesperson_id, contact_id, started_at, phone, outcome,
  duration_seconds, recording_path, recording_status, recording_seconds,
  recording_source, audio_seconds, transcript, summary
)
select cl.id, cl.company_id, cl.salesperson_id, cl.contact_id, cl.started_at,
       cl.phone, cl.outcome, cl.duration_seconds, cl.recording_path,
       cl.recording_status, cl.recording_seconds, cl.recording_source,
       cl.audio_seconds, cl.transcript, cl.summary
from public.call_logs cl
where cl.recording_status = 'ready'
  and coalesce(cl.duration_seconds, 0) = 0
  and cl.outcome in ('no_answer', 'failed')
on conflict (id) do nothing;

-- ── 2. Stop the call saying things that are not true of it ──────────────────

update public.call_logs cl
   set recording_status = 'failed',
       recording_path = null,
       recording_seconds = 0,
       audio_seconds = null,
       audio_complete = null,
       transcript = null,
       summary = null,
       recording_error = 'This call lasted zero seconds and recorded nothing. '
                      || 'The audio previously attached to it was another call''s and has been removed.'
 where cl.recording_status = 'ready'
   and coalesce(cl.duration_seconds, 0) = 0
   and cl.outcome in ('no_answer', 'failed');

-- ── 3. Promises that were never made ────────────────────────────────────────

alter table public.lead_promises drop constraint if exists lead_promises_status_check;
alter table public.lead_promises add constraint lead_promises_status_check
  check (status in ('open', 'kept', 'missed', 'duplicate', 'void'));

update public.lead_promises p
   set status = 'void',
       settled_at = now()
 where p.status in ('open', 'missed')
   and exists (
     select 1 from public.call_logs_foreign_audio_backup b
      where b.id = p.call_id);

-- A void promise is not a missed one, so it must not be counted as either.
create or replace view public.v_company_promises as
select p.company_id,
       p.kind,
       count(*) filter (where p.status not in ('duplicate', 'void'))::int as made,
       count(*) filter (where p.status = 'kept')::int as kept,
       count(*) filter (where p.status = 'missed')::int as missed,
       count(*) filter (where p.status = 'open')::int as still_open,
       count(*) filter (where p.status = 'missed' and s.is_terminal)::int as missed_on_lost,
       count(distinct p.contact_id) filter (where p.status = 'missed')::int as leads_missed,
       (array_agg(p.promise order by p.said_at)
          filter (where p.status = 'missed'))[1] as oldest_missed,
       min(p.said_at) filter (where p.status = 'missed') as oldest_missed_at
from public.lead_promises p
join public.contacts c on c.id = p.contact_id
join public.lead_stages s on s.code = c.stage
group by 1, 2;

-- ── 4. One query that finds this happening again ────────────────────────────

create or replace view public.v_foreign_audio as
select cl.id,
       cl.company_id,
       cl.salesperson_id,
       cl.contact_id,
       cl.started_at,
       cl.phone,
       cl.outcome,
       cl.duration_seconds as call_seconds,
       cl.audio_seconds,
       cl.recording_source,
       case
         when coalesce(cl.duration_seconds, 0) = 0
           then 'call recorded nothing, yet a recording is attached'
         else 'audio far longer than the call it is attached to'
       end as why
from public.call_logs cl
where cl.recording_status = 'ready'
  and (
    (coalesce(cl.duration_seconds, 0) = 0 and cl.outcome in ('no_answer', 'failed'))
    or (cl.audio_seconds is not null
        and cl.audio_seconds > cl.duration_seconds + greatest(60, cl.duration_seconds))
  );

comment on view public.v_foreign_audio is
  'Calls holding audio that cannot be theirs — a recording on a call that never connected, or audio far longer than the call. Should be empty; anything in it means a recording is filed against the wrong buyer.';
