insert into public.contacts (id, company_id, salesperson_id, name, phone, company_name, notes, status, stage,
                             temperature, budget, ai_next_action, site_visit_at, site_visit_project,
                             lead_source, lead_source_id, token_amount, token_paid_at, site_visit_arrived_at,
                             site_visit_verified, attempts, close_probability, close_probability_at, extra, created_at)
select id, 'de000000-0000-4000-8000-000000000001', salesperson_id, name, phone, company_name, notes,
       status::public.contact_status, stage, temperature, budget, ai_next_action, site_visit_at, site_visit_project,
       'facebook', lead_source_id, token_amount, token_paid_at, site_visit_arrived_at,
       site_visit_arrived_at is not null, attempts, close_probability,
       case when close_probability is not null then coalesce(handled_at, created_at) end, extra, created_at
  from _demo_c;

-- The insert trigger stamps created_at and assigned_at to now(). Put back when
-- each lead really arrived (Meta leads go to a rep the moment they land).
update public.contacts c
   set created_at = s.created_at, assigned_at = s.created_at, origin_created_at = s.created_at
  from _demo_c s
 where c.id = s.id;

-- Callback leads were just given an automatic "11 AM tomorrow" follow-up by
-- their insert trigger. The real ones are written below.
delete from public.follow_ups where company_id = 'de000000-0000-4000-8000-000000000001';

