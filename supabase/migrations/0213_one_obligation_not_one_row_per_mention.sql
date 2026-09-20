-- Caught on the first real scan, before anyone saw it.
--
-- Rahul Chaudhary came back with "Arrange site visit" TWICE — two calls on the
-- same evening, each producing its own row, because the unique key was
-- (call_id, kind). A rep who mentions a visit on three calls owes ONE visit.
-- Three rows would have meant three lines in her Call now list for one job,
-- three in the founder's tally, and a list she stops reading by Thursday.
--
-- THE OLDEST SURVIVES, not the newest. The age of a broken promise is measured
-- from when it was first made — "9 days" is the true state of that lead, and
-- letting a repeat reset the clock would hide exactly the promises that have
-- been rotting longest.
--
-- The repeats are kept, marked 'duplicate', because the fact that she said it
-- twice is evidence too, and because deleting the row would let the next scan
-- re-create it forever.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-20.

alter table public.lead_promises drop constraint if exists lead_promises_status_check;
alter table public.lead_promises add constraint lead_promises_status_check
  check (status in ('open', 'kept', 'missed', 'duplicate'));

create or replace function public.settle_promises()
returns integer
language plpgsql security definer set search_path to 'public'
as $function$
declare
  n_kept integer := 0;
  n_missed integer := 0;
  n integer;
begin
  -- 1. "Main bhej deta hoon" — kept by a WhatsApp that carried SOMETHING.
  --    A bare "ji namaste" after the call is not the floor plan.
  update public.lead_promises p
     set status = 'kept',
         kept_by = 'whatsapp',
         settled_at = now(),
         kept_at = (
           select min(w.sent_at) from public.wa_observed_messages w
            where w.contact_id = p.contact_id and w.direction = 'out'
              and w.archived_at is null and w.sent_at > p.said_at
              and (w.media_kind is not null or w.body ilike '%http%'))
   where p.status not in ('kept', 'duplicate') and p.kind = 'send'
     and exists (
       select 1 from public.wa_observed_messages w
        where w.contact_id = p.contact_id and w.direction = 'out'
          and w.archived_at is null and w.sent_at > p.said_at
          and (w.media_kind is not null or w.body ilike '%http%'));
  get diagnostics n = row_count; n_kept := n_kept + n;

  -- 2. A visit agreed on the phone is kept when it reaches the diary — or,
  --    far better, when they turned up. Arriving wins the label.
  update public.lead_promises p
     set status = 'kept',
         kept_by = case
           when (select c.site_visit_arrived_at >= p.said_at from public.contacts c where c.id = p.contact_id)
           then 'visit_done' else 'visit_booked' end,
         settled_at = now(),
         kept_at = (select least(
                      coalesce(c.site_visit_arrived_at, 'infinity'::timestamptz),
                      coalesce(c.site_visit_at, 'infinity'::timestamptz))
                    from public.contacts c where c.id = p.contact_id)
   where p.status not in ('kept', 'duplicate') and p.kind = 'visit'
     and exists (
       select 1 from public.contacts c
        where c.id = p.contact_id
          and (c.site_visit_at >= p.said_at or c.site_visit_arrived_at >= p.said_at));
  get diagnostics n = row_count; n_kept := n_kept + n;

  -- 3. "Manager se baat karke batata hoon" is delivered by TALKING.
  update public.lead_promises p
     set status = 'kept',
         kept_by = 'call',
         settled_at = now(),
         kept_at = (
           select min(l.started_at) from public.call_logs l
            where l.contact_id = p.contact_id and l.started_at > p.said_at
              and coalesce(l.off_crm, false) = false
              and coalesce(l.duration_seconds, 0) >= 20)
   where p.status not in ('kept', 'duplicate') and p.kind = 'price_check'
     and exists (
       select 1 from public.call_logs l
        where l.contact_id = p.contact_id and l.started_at > p.said_at
          and coalesce(l.off_crm, false) = false
          and coalesce(l.duration_seconds, 0) >= 20);
  get diagnostics n = row_count; n_kept := n_kept + n;

  -- …or by writing the answer down.
  update public.lead_promises p
     set status = 'kept',
         kept_by = 'whatsapp',
         settled_at = now(),
         kept_at = (
           select min(w.sent_at) from public.wa_observed_messages w
            where w.contact_id = p.contact_id and w.direction = 'out'
              and w.archived_at is null and w.sent_at > p.said_at
              and coalesce(btrim(w.body), '') <> '')
   where p.status not in ('kept', 'duplicate') and p.kind = 'price_check'
     and exists (
       select 1 from public.wa_observed_messages w
        where w.contact_id = p.contact_id and w.direction = 'out'
          and w.archived_at is null and w.sent_at > p.said_at
          and coalesce(btrim(w.body), '') <> '');
  get diagnostics n = row_count; n_kept := n_kept + n;

  -- 5. ONE OBLIGATION, NOT ONE ROW PER TIME SHE SAID IT. See the header.
  --    Runs AFTER the keep-detection so a repeat that was genuinely delivered
  --    is recorded as kept rather than quietly swallowed as a duplicate.
  with ranked as (
    select id, row_number() over (partition by contact_id, kind order by said_at) as rn
    from public.lead_promises
    where status in ('open', 'missed')
  )
  update public.lead_promises p
     set status = 'duplicate', settled_at = now()
    from ranked r
   where r.id = p.id and r.rn > 1;

  -- 6. Out of time. Only now does it become a dropped ball — a rep gets her
  --    window before this system says a word about her.
  update public.lead_promises p
     set status = 'missed', settled_at = now()
   where p.status = 'open' and now() >= p.due_by;
  get diagnostics n = row_count; n_missed := n;

  return n_kept + n_missed;
end;
$function$;

comment on function public.settle_promises() is
  'Marks promises kept using evidence from WhatsApp, later calls and the site-visit fields, collapses repeats of the same obligation, then times out the rest. No model and no rep self-report is involved.';

revoke all on function public.settle_promises() from public, anon, authenticated;

-- A promise said twice is not two promises, so it must not be counted twice.
create or replace view public.v_company_promises as
select p.company_id,
       p.kind,
       count(*) filter (where p.status <> 'duplicate')::int as made,
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
