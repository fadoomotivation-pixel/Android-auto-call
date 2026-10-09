-- Put each lead's clocks back (the follow-up insert stamped handled_at = now()),
-- then bring the parked follow-ups home.
update public.contacts c
   set handled_at = s.handled_at, last_contacted_at = s.last_contacted_at, attempts = s.attempts,
       last_inbound_at = s.last_inbound_at, last_reply_at = s.last_reply_at
  from _demo_c s
 where c.id = s.id;

update public.follow_ups
   set due_at = due_at - interval '100 years'
 where company_id = 'de000000-0000-4000-8000-000000000001' and status = 'pending';

