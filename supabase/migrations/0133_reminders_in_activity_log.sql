-- Reminders belong in the lead's timeline, not in a table of their own.
--
-- This CRM already has a general activity log — lead_activities — carrying
-- calls, notes, status changes, site visits and follow-ups, with actor_id,
-- actor_name and created_at. A reminder sent by a manager is an event in a
-- lead's history exactly like those. Giving it a private table would mean the
-- lead's story is told in two places, and every future "what happened to this
-- lead" query would have to know to union them.
--
-- 'reminder' joins the nine kinds the check already allowed, so a lead's
-- timeline can read as one sequence:
--
--   10:42  Reminder sent            Super Admin
--   11:15  Follow-up completed      Ankita
--   11:30  Site visit outcome       Ankita
--
-- The one thing lost by not having a bespoke table is a typed `kind` column;
-- the queue it came from is carried in `detail` instead and matched on a short
-- phrase the UI itself writes. That is a fair price for keeping operational
-- history in one place.
alter table public.lead_activities drop constraint if exists lead_activities_type_check;
alter table public.lead_activities add constraint lead_activities_type_check
  check (type = any (array[
    'status', 'temperature', 'note', 'budget', 'site_visit',
    'follow_up', 'call', 'system', 'update', 'reminder'
  ]));
