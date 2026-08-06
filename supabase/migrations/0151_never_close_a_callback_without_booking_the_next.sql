-- A callback must never be closed without the next one being booked.
--
-- THE BUG, as caught on video by Ankita on 6 Aug 2026.
--
-- She rang Dhananjay, nobody picked up, and she recorded a voice note saying
-- "Not answering." The backend did its whole job: transcribed it, summarised
-- it, counted attempt 2, set the lead to `callback`. Then the lead quietly fell
-- out of her worklist, and nobody would ever have rung Dhananjay again.
--
-- Two triggers, and only one of them fires:
--
--   trg_close_followups_on_handled   AFTER UPDATE OF handled_at
--   trg_ensure_callback_followup     AFTER INSERT OR UPDATE **OF status**
--
-- Saving a voice note stamps `contacts.handled_at` (stamp_handled_from_voice_note)
-- and touches NOTHING else. So the first trigger fires and closes the overdue
-- callback — correct, she did handle it — and the second never fires at all,
-- because `status` did not change. It was already 'callback', and staying
-- 'callback' is not an update of it.
--
-- The net effect of handling a lead was to remove the only reason anyone would
-- ever look at it again. Measured across the platform before this migration:
--
--   company           open leads   no next step   'callback' with nothing booked
--   ankit                    238            213                             29
--   Fanbe                    178            133                             95
--   Manas property           150             96                              9
--   sn developers             30             12                              0
--
-- 95 of Fanbe's 121 callback leads. Every one of them a customer who said "call
-- me back" to a system that then forgot.
--
-- THE FIX. ensure_callback_followup already states the invariant: a lead marked
-- `callback` always has a callback booked. It was only ever enforced on one of
-- the two paths that can reach that state. The body moves into a shared
-- function that both paths call, so closing a callback and booking the next one
-- can no longer come apart.
--
-- Deliberately narrow: it re-books for status = 'callback' and nothing else.
-- Auto-booking a follow-up for every open stage would be a new product policy
-- invented inside a bug fix — a site-visit lead scheduled for next Tuesday does
-- not want a callback tomorrow morning. The 455 open leads with no next step
-- are a real and separate finding; this fixes the ones the app actively broke.
--
-- Termination: the insert below fires trg_stamp_handled_followup, which stamps
-- handled_at again, which re-enters close_followups_on_handled. That pass finds
-- the follow-up it just made — created seconds ago and due tomorrow — excluded
-- by both the `created_at < now() - 30 seconds` guard and `due_at <= now()`, so
-- it closes nothing and never reaches the booking branch. One extra pass, no
-- recursion.

-- ── the invariant, in one place ──
--
-- Scalar arguments rather than a `public.contacts` row: a trigger's NEW is a
-- record, and relying on plpgsql to coerce it into a named composite is the
-- kind of thing that works until the table gains a column.

create or replace function public.book_callback_if_missing(
  p_contact_id uuid,
  p_company_id uuid,
  p_salesperson_id uuid,
  p_status text,
  p_stage text,
  p_phone text,
  p_name text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_due timestamptz;
begin
  if p_status is distinct from 'callback'
     or p_salesperson_id is null
     or p_company_id is null
     or not public.stage_is_open(p_stage) then
    return;
  end if;

  if exists (
    select 1 from public.follow_ups f
    where f.contact_id = p_contact_id and f.status = 'pending'
  ) then
    return;
  end if;

  -- next day 11:00 IST, expressed as a UTC timestamptz
  v_due := (date_trunc('day', (now() at time zone 'Asia/Kolkata'))
            + interval '1 day' + interval '11 hour') at time zone 'Asia/Kolkata';

  insert into public.follow_ups (company_id, salesperson_id, contact_id, phone, name, due_at, note)
  values (p_company_id, p_salesperson_id, p_contact_id, p_phone, p_name, v_due,
          'Auto: callback ka time set nahi tha — kal 11 AM');
end $$;

-- ── path 1: the status changed to 'callback' (same behaviour as before) ──

create or replace function public.ensure_callback_followup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public.book_callback_if_missing(
    new.id, new.company_id, new.salesperson_id,
    new.status::text, new.stage, new.phone, new.name);
  return new;
end $$;

-- ── path 2: the lead was handled, and that closed its callback ──

create or replace function public.close_followups_on_handled()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_closed int := 0;
begin
  if new.handled_at is distinct from old.handled_at and new.handled_at is not null then
    update public.follow_ups f
       set status = 'done', completed_at = now()
     where f.contact_id = new.id
       and f.status = 'pending'
       and f.due_at <= now()
       and f.created_at < now() - interval '30 seconds';
    get diagnostics v_closed = row_count;

    -- The half that was missing. Finishing a callback on a lead that still
    -- wants calling means the NEXT one is due, not that the lead is done.
    if v_closed > 0 then
      perform public.book_callback_if_missing(
        new.id, new.company_id, new.salesperson_id,
        new.status::text, new.stage, new.phone, new.name);
    end if;
  end if;
  return new;
end $$;

-- ── backfill: the leads already stranded by this ──
--
-- Every lead sitting on 'callback' with nothing pending. Their old callback was
-- closed by a handling that booked no replacement, so they are invisible to the
-- rep and to every "due now" count. Booked for tomorrow 11:00 IST, the same
-- default the trigger uses and the same note, so a rep reading it sees the
-- wording they already know rather than a new one to decode.

insert into public.follow_ups (company_id, salesperson_id, contact_id, phone, name, due_at, note)
select ct.company_id, ct.salesperson_id, ct.id, ct.phone, ct.name,
       (date_trunc('day', (now() at time zone 'Asia/Kolkata'))
        + interval '1 day' + interval '11 hour') at time zone 'Asia/Kolkata',
       'Auto: callback ka time set nahi tha — kal 11 AM'
from public.contacts ct
where ct.status = 'callback'
  and ct.salesperson_id is not null
  and ct.company_id is not null
  and public.stage_is_open(ct.stage)
  and not exists (
    select 1 from public.follow_ups f
    where f.contact_id = ct.id and f.status = 'pending'
  );
