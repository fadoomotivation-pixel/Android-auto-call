-- The call log is the honest witness. Use it.
--
-- 0107 closes a due callback when the rep RECORDS an outcome. That still leaves
-- the hole the telecallers actually complained about: skipping the post-call
-- prompt is allowed (and deliberately harmless), so a rep who really did call
-- but tapped Skip kept staring at "Overdue" and rightly said "maine call kar li
-- hai". Believing the rep required trusting a form they didn't fill.
--
-- We never had to. Every call reaches call_logs on its own — the dialer writes
-- outgoing rows itself, and the phone's background sync backfills the rest,
-- including calls placed from outside the app. So a logged call to that lead,
-- at or after the callback was due, IS the proof that the callback happened. No
-- form, no tap, no trust required.
--
-- "Called" means called, not "reached": if nobody picked up, that is still the
-- appointment kept — the attempt ladder and the new disposition handle what
-- comes next. And a callback booked for LATER stays booked; only one already
-- due is settled by the call.
create or replace function public.close_followups_on_call()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is null then
    return null;              -- off-CRM call: belongs to no lead
  end if;

  update public.follow_ups f
     set status = 'done',
         completed_at = coalesce(new.started_at, now())
   where f.contact_id = new.contact_id
     and f.status = 'pending'
     and f.due_at <= coalesce(new.started_at, now());
  return null;
end $$;

-- Fires on INSERT and on contact_id being filled in later, because the phone's
-- sync can link a call to its lead minutes after the call itself landed.
drop trigger if exists trg_close_followups_on_call on public.call_logs;
create trigger trg_close_followups_on_call
  after insert or update of contact_id on public.call_logs
  for each row execute function public.close_followups_on_call();

-- Same rule over the history: any callback still pending whose lead was called
-- after it fell due was kept, whatever the rep did or didn't tap afterwards.
update public.follow_ups f
   set status = 'done',
       completed_at = sub.called_at
  from (
    select f2.id, max(cl.started_at) as called_at
    from public.follow_ups f2
    join public.call_logs cl
      on cl.contact_id = f2.contact_id
     and cl.started_at >= f2.due_at
    where f2.status = 'pending'
    group by f2.id
  ) sub
 where f.id = sub.id;
