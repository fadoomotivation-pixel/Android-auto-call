-- The one branch that puts an unanswered buyer in front of the rep.
--
-- Placed after "overdue" and before "due today": a buyer writing now beats a
-- callback booked for Friday, and does not outrank a callback that is already
-- late or a lead that is finished. See 0205 for the reasoning and the numbers.
--
-- waiting_since rides along so a screen can say HOW LONG rather than only that
-- something is owed. Nothing here may move a lead without being able to say
-- why it moved.
--
-- Both new columns are APPENDED to the end of each view. create or replace
-- cannot insert a column in the middle — and appending is also what keeps
-- every existing reader working, since they ask for columns by name.
--
-- Measured on the live data the moment it went in: three leads, waiting 9, 10
-- and 17 days. Only three because only 70 of this rep's 216 WhatsApp
-- relationships are leads at all — which is the case for capturing the other
-- 146, not an argument against this.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-20.

create or replace view public.v_lead_action_state as
 with nxt as (
   select f.contact_id, min(f.due_at) as due_at
   from public.follow_ups f
   where f.completed_at is null
   group by f.contact_id
 )
 select c.id as contact_id,
    n.due_at,
    case
      when s.is_terminal then 'none'::text
      when n.due_at is not null and n.due_at < (date_trunc('day', timezone('Asia/Kolkata', now())) at time zone 'Asia/Kolkata') then 'overdue'::text
      when n.due_at is not null and n.due_at <= now() then 'call_now'::text
      -- A BUYER WHO JUST WROTE IS THE MOST URGENT THING A REP HAS.
      -- A call counts as answering, which is why last_contacted_at is here.
      when c.last_inbound_at is not null
       and c.last_inbound_at > coalesce(c.last_reply_at, '-infinity'::timestamptz)
       and c.last_inbound_at > coalesce(c.last_contacted_at, '-infinity'::timestamptz)
       and c.last_inbound_at < now() - interval '30 minutes'
      then 'call_now'::text
      when n.due_at is not null and timezone('Asia/Kolkata', n.due_at)::date = timezone('Asia/Kolkata', now())::date then 'due_today'::text
      when n.due_at is not null then 'scheduled'::text
      when c.stage = 'new'::text then 'call_now'::text
      when c.handled_at is null and c.assigned_at is not null and (c.last_contacted_at is null or c.assigned_at > c.last_contacted_at) then 'call_now'::text
      when (c.status = any (array['no_answer'::contact_status, 'busy'::contact_status, 'wrong_person'::contact_status, 'callback'::contact_status, 'follow_up'::contact_status, 'queued'::contact_status])) and (c.handled_at is null or timezone('Asia/Kolkata', c.handled_at)::date < timezone('Asia/Kolkata', now())::date) then 'call_now'::text
      when c.site_visit_at is not null and c.site_visit_at > now() then 'awaiting_visit'::text
      else 'no_next_step'::text
    end as action_state,
    case
      when c.last_inbound_at is not null
       and c.last_inbound_at > coalesce(c.last_reply_at, '-infinity'::timestamptz)
       and c.last_inbound_at > coalesce(c.last_contacted_at, '-infinity'::timestamptz)
       and c.last_inbound_at < now() - interval '30 minutes'
      then c.last_inbound_at
    end as waiting_since
   from public.contacts c
     join public.lead_stages s on s.code = c.stage
     left join nxt n on n.contact_id = c.id;

create or replace view public.v_lead_workstate as
 select c.id as contact_id,
    c.company_id, c.salesperson_id, c.name, c.phone,
    c.status as disposition, c.stage,
    s.label as stage_label, s.short_label as stage_short_label, s.color as stage_color,
    s.sort_order as stage_sort, s.outcome, s.is_terminal, s.is_pipeline, s.is_advanced,
    s.counts_as_sale, s.rep_visible, s.analytics_visible,
    a.action_state, a.due_at,
    c.site_visit_at, c.created_at, c.last_contacted_at, c.handled_at, c.temperature,
    lc.last_call_at, lc.last_call_seconds, lc.calls_total,
    a.due_at is not null and timezone('Asia/Kolkata', a.due_at)::date = timezone('Asia/Kolkata', now())::date as is_due_today,
    timezone('Asia/Kolkata', c.handled_at)::date = timezone('Asia/Kolkata', now())::date as handled_today,
    a.waiting_since
   from public.contacts c
     join public.lead_stages s on s.code = c.stage
     join public.v_lead_action_state a on a.contact_id = c.id
     left join lateral (
       select cl.started_at as last_call_at,
              coalesce(cl.duration_seconds, 0) as last_call_seconds,
              (select count(*)::integer from public.call_logs x
                where x.contact_id = c.id and coalesce(x.off_crm, false) = false) as calls_total
       from public.call_logs cl
       where cl.contact_id = c.id and coalesce(cl.off_crm, false) = false
       order by cl.started_at desc
       limit 1) lc on true;
