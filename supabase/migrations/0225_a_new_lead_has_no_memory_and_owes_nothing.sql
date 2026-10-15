-- A lead handed over "as new" must not arrive carrying somebody else's words.
--
-- hand_over_as_new predates lead_memory and lead_promises. Its own rule is in
-- its first line: "Snapshot first. Nothing here is deleted; it stops being
-- VISIBLE to the rep." It clears the contact's notes, budget, temperature and
-- stage, sets fresh_start_at so the RLS on call_logs, lead_activities and
-- lead_voice_notes hides everything older, and cancels the previous rep's
-- booked callback — because that appointment is about a conversation the new
-- rep never had.
--
-- Two tables arrived after it was written and were not covered:
--
--   lead_memory    one distilled paragraph per lead: what the buyer wants,
--                  what they objected to, where it was left. Its RLS has no
--                  fresh_start_at clause, so a lead handed over AS NEW still
--                  showed the new rep another rep's account of a call she has
--                  never made. That is exactly the confusion the handover
--                  exists to prevent.
--
--   lead_promises  an unkept promise is a record of WHO BROKE THEIR WORD. It
--                  belongs to the rep who gave it. Carried across a handover
--                  it makes the new rep answerable for a sentence she never
--                  said, and puts a debt at the top of her Call now list on
--                  day one.
--
-- Both are hidden the same way as everything else: salesperson_id goes null.
-- Nothing is deleted, the rows keep their company, and is_admin() still reads
-- them — so the founder and the dashboard lose nothing while the rep starts
-- clean. The lead_handovers snapshot now records who owned those rows, so the
-- handover reverses as cleanly as it applies.
--
-- APPLIED TO PRODUCTION on 2026-10-15, then used on Nidhi's 112 leads.
-- Result: 112 at stage New, 112 with fresh_start_at, 0 notes or budgets left,
-- 0 memory rows visible to her, 0 promises on her name, 0 inherited
-- callbacks. Nothing lost: 50 memory rows, 27 promises and 191 call_logs are
-- all still in the database, and 115 snapshots hold what was cleared.

create or replace function public.hand_over_as_new(p_contact_ids uuid[], p_to uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare n integer;
begin
  insert into public.lead_handovers
    (company_id, contact_id, from_salesperson_id, to_salesperson_id, handed_by, snapshot)
  select c.company_id, c.id, c.salesperson_id, p_to, auth.uid(),
         jsonb_strip_nulls(jsonb_build_object(
           'status', c.status, 'stage', c.stage, 'notes', c.notes,
           'temperature', c.temperature, 'budget', c.budget,
           'ai_next_action', c.ai_next_action, 'ai_scored_at', c.ai_scored_at,
           'close_probability', c.close_probability,
           'attempts', c.attempts, 'last_contacted_at', c.last_contacted_at,
           'handled_at', c.handled_at, 'last_inbound_at', c.last_inbound_at,
           'site_visit_at', c.site_visit_at, 'site_visit_project', c.site_visit_project,
           'site_visit_outcome', c.site_visit_outcome,
           'token_amount', c.token_amount, 'token_paid_at', c.token_paid_at,
           'reactivated_at', c.reactivated_at, 'reactivation_count', c.reactivation_count,
           'assigned_at', c.assigned_at, 'previous_fresh_start_at', c.fresh_start_at,
           'calls', (select count(*) from public.call_logs l where l.contact_id = c.id),
           -- Who owned the hidden rows, so this reverses as cleanly as it applies.
           'memory_salesperson_id',
             (select m.salesperson_id from public.lead_memory m where m.contact_id = c.id),
           'open_promise_salesperson_ids',
             (select jsonb_agg(distinct pr.salesperson_id) from public.lead_promises pr
               where pr.contact_id = c.id and pr.status in ('open','missed')
                 and pr.salesperson_id is not null)
         ))
  from public.contacts c
  where c.id = any(p_contact_ids);

  update public.contacts c
     set salesperson_id       = p_to,
         status               = 'new',
         stage                = 'new',
         notes                = null,
         temperature          = null,
         budget               = null,
         ai_next_action       = null,
         ai_scored_at         = null,
         close_probability    = null,
         close_probability_at = null,
         attempts             = 0,
         last_contacted_at    = null,
         handled_at           = null,
         last_inbound_at      = null,
         site_visit_at        = null,
         site_visit_project   = null,
         site_visit_outcome   = null,
         site_visit_arrived_at   = null,
         site_visit_arrived_lat  = null,
         site_visit_arrived_lng  = null,
         site_visit_distance_m   = null,
         site_visit_verified     = null,
         token_amount         = null,
         token_paid_at        = null,
         reactivated_at       = null,
         reactivation_count   = 0,
         fresh_start_at       = now(),
         assigned_at          = now(),
         updated_at           = now()
   where c.id = any(p_contact_ids);
  get diagnostics n = row_count;

  update public.follow_ups
     set status = 'cancelled'
   where contact_id = any(p_contact_ids) and status = 'pending';

  -- Somebody else's account of a call she never made.
  update public.lead_memory
     set salesperson_id = null
   where contact_id = any(p_contact_ids);

  -- Somebody else's word. Not her debt to carry.
  update public.lead_promises
     set salesperson_id = null
   where contact_id = any(p_contact_ids) and status in ('open','missed');

  -- A drafted message written in the previous rep's voice, to a thread the
  -- new rep cannot see.
  update public.followup_drafts
     set salesperson_id = null
   where contact_id = any(p_contact_ids);

  return n;
end
$function$;

comment on function public.hand_over_as_new(uuid[], uuid) is
  'Hands leads to a rep as if brand new: snapshots everything into lead_handovers, clears the contact''s working fields, sets fresh_start_at so older calls and activity are hidden, cancels the old callback, and — since 0225 — detaches lead_memory, open promises and drafts so the rep does not meet another rep''s conversation on a lead she has never called. Nothing is deleted; admins keep every row.';
