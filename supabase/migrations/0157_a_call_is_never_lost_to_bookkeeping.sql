-- 0157 — A call is never lost to bookkeeping
--
-- WHAT HAPPENED
--
-- On 5 Aug the canonical lead lifecycle landed and contacts gained `stage`.
-- apply_call_to_new_lead() — an AFTER INSERT trigger on call_logs — was updated
-- to branch on the new column:
--
--     select id, status::text as st, attempts, handled_at into c   -- no stage
--       from public.contacts where id = new.contact_id;
--     if not found or c.stage <> 'new' then                        -- reads stage
--
-- `stage` was never put in the select list, so the record has no such field and
-- plpgsql raises 42703 "record c has no field stage" at runtime. Postgres cannot
-- catch that at CREATE FUNCTION time — a record's shape only exists once the
-- query runs.
--
-- The trigger throws, so the INSERT is rolled back. And the very first line of
-- the function is `if new.contact_id is null then return null`, so the failure
-- lands on EXACTLY ONE class of row: a call that was successfully matched to a
-- CRM lead. Calls to unknown numbers return early and save fine.
--
-- For seven days the database therefore accepted every personal and spam call
-- and silently rejected every single call a telecaller made to an actual lead.
-- Every company, every rep, from 6 Aug: 0 linked calls out of 374, against
-- 46-of-47 the week before. That is the whole of it — the empty Daily Pulse, the
-- 0 talk time on leads, last_contacted_at never stamped, site visits with no
-- call behind them, recordings with no row to hang on. Not the phones, not the
-- sync, not the reps. One missing word in a select list.
--
-- Worse, the app uploads in bulk chunks: one matched call in a chunk took the
-- whole chunk down with it, including the off-CRM rows travelling beside it.
--
-- TWO FIXES, AND THE SECOND MATTERS MORE
--
-- 1. Select `stage`.
--
-- 2. No bookkeeping trigger on call_logs may ever again reject a call. A call
--    log is EVIDENCE — the phone made it, it happened, and once we refuse it, it
--    is gone for good the moment the handset's own 7-day window rolls past.
--    Stage updates, follow-up closing, last_contacted stamps: all of that is
--    derived, and all of it can be recomputed from the calls. Evidence must
--    never be sacrificed to keep a derived column tidy. So every AFTER trigger
--    on call_logs now runs inside an exception guard: if the bookkeeping breaks,
--    it logs a warning and the call is still saved.
--
--    This is not defensive noise. It is the difference between "a stage counter
--    is briefly wrong" and "seven days of a company's work never existed".
--
-- RECOVERY: the rejected calls were never written, so there is nothing to
-- backfill here — but they are still on the handsets, and the app rescans a
-- 7-day window. Once this lands, the next sync re-uploads them and they link
-- normally. refuse_duplicate_call won't block them; there is no row to collide
-- with.

-- ---------------------------------------------------------------------------
-- The bug itself
-- ---------------------------------------------------------------------------
create or replace function public.apply_call_to_new_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c record;
  secs int := coalesce(new.duration_seconds, 0);
  reached boolean := (new.outcome = 'connected');
  tries int;
begin
  if new.contact_id is null then
    return null;
  end if;

  -- `stage` in the select list. This line is the fix.
  select id, stage, attempts into c
    from public.contacts where id = new.contact_id;
  if not found or c.stage <> 'new' then
    return null;
  end if;

  if reached then
    update public.contacts
       set status = 'called',
           handled_at = coalesce(new.started_at, now())
     where id = c.id;

    if new.company_id is not null then
      insert into public.lead_activities (company_id, contact_id, actor_id, actor_name, type, detail)
      values (new.company_id, c.id, new.salesperson_id, 'Call log 📞', 'status',
              'Stage → Called — a ' || secs || ' second call is on the log, so this is not a new lead any more.');
    end if;
  else
    select count(*) into tries
      from public.call_logs l
     where l.contact_id = c.id
       and l.outcome is distinct from 'connected'::public.call_outcome;

    update public.contacts
       set status = 'no_answer',
           attempts = greatest(coalesce(c.attempts, 0), tries, 1)
     where id = c.id;
  end if;

  return null;
exception when others then
  -- The call is already saved by the time we get here. Keep it that way.
  raise warning 'apply_call_to_new_lead skipped (call %, contact %): % %',
    new.id, new.contact_id, sqlstate, sqlerrm;
  return null;
end $function$;

-- ---------------------------------------------------------------------------
-- The rule: derived bookkeeping can fail, the call still lands
-- ---------------------------------------------------------------------------
create or replace function public.stamp_last_contacted()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_when timestamptz := coalesce(new.started_at, new.created_at, now());
begin
  if new.contact_id is not null then
    update public.contacts
    set last_contacted_at = greatest(coalesce(last_contacted_at, 'epoch'::timestamptz), v_when)
    where id = new.contact_id;
  end if;
  return new;
exception when others then
  raise warning 'stamp_last_contacted skipped (call %): % %', new.id, sqlstate, sqlerrm;
  return new;
end $function$;

create or replace function public.close_followups_on_call()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.contact_id is null then
    return null;
  end if;

  update public.follow_ups f
     set status = 'done',
         completed_at = coalesce(new.started_at, now())
   where f.contact_id = new.contact_id
     and f.status = 'pending'
     and f.due_at <= coalesce(new.started_at, now());
  return null;
exception when others then
  raise warning 'close_followups_on_call skipped (call %): % %', new.id, sqlstate, sqlerrm;
  return null;
end $function$;

create or replace function public.stamp_handled_from_call_note()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.contact_id is not null and coalesce(btrim(new.notes), '') <> '' then
    update public.contacts set handled_at = now() where id = new.contact_id;
  end if;
  return null;
exception when others then
  raise warning 'stamp_handled_from_call_note skipped (call %): % %', new.id, sqlstate, sqlerrm;
  return null;
end $function$;
