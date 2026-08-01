-- A dead lead must not keep asking to be called.
--
-- The rep marks a lead "Not interested" and moves on. The callback they had
-- booked earlier stays pending, slides past its due time, and the lead sits in
-- the follow-up list wearing "Overdue" forever. The rep opens it, sees a lead
-- they already closed, and learns that the follow-up list lies. That is exactly
-- the confusion the telecallers are reporting: 15 of the pending callbacks on
-- the platform are on leads that are already not_interested, lost — leads
-- nobody should be calling at all.
--
-- 0107 closes an OVERDUE callback when the lead is worked, and 0109 closes one
-- the call log proves was kept. Neither covers this: closing a lead is not
-- "working" the callback, it is cancelling the reason for it.
--
-- The rule is simply: when a lead reaches a state where calling it again is
-- either pointless (not interested / lost / do-not-call) or already won
-- (booked / token paid), the callbacks attached to it are finished.
--
-- Note this fires on the lead CLOSING. A follow-up created deliberately AFTER
-- a lead is booked — paperwork, payment chase — is untouched, because the
-- status is not changing at that moment.
create or replace function public.close_followups_on_lead_closed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status
     and new.status::text in ('not_interested', 'lost', 'dnc', 'booked', 'token_paid') then
    update public.follow_ups f
       set status = 'done', completed_at = now()
     where f.contact_id = new.id
       and f.status = 'pending';
  end if;
  return null;
end $$;

drop trigger if exists trg_close_followups_on_lead_closed on public.contacts;
create trigger trg_close_followups_on_lead_closed
  after update of status on public.contacts
  for each row execute function public.close_followups_on_lead_closed();

-- Clear the ones already sitting there.
update public.follow_ups f
   set status = 'done', completed_at = now()
  from public.contacts c
 where c.id = f.contact_id
   and f.status = 'pending'
   and c.status::text in ('not_interested', 'lost', 'dnc', 'booked', 'token_paid');
