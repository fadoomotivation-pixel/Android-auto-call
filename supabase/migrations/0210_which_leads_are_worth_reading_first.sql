-- Which conversations to read, and in what order.
--
-- The scan must not walk 542 leads to find the dozen worth a model call. This
-- picks only leads that HAD a real conversation — a transcript over 400
-- characters, or a WhatsApp thread with at least two messages FROM the buyer —
-- and puts the ones with the newest material first.
--
-- It also skips anything already up to date, so a nightly pass over a quiet
-- company costs one query and nothing else. 400 characters is measured, not
-- chosen: of 3,158 transcripts on this platform, 594 clear it and the rest are
-- "hello… hello?".
--
-- On the day it shipped: 226 leads waiting, oldest material 18 July.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-20.

create or replace function public.lead_memory_candidates(p_limit integer default 12)
returns table(contact_id uuid, company_id uuid, salesperson_id uuid, material_at timestamptz)
language sql stable security definer set search_path to 'public'
as $function$
  with talked as (
    select l.contact_id, max(l.started_at) as at
    from public.call_logs l
    where l.contact_id is not null
      and l.transcript is not null and length(l.transcript) >= 400
    group by 1
    union all
    select m.contact_id, max(m.sent_at)
    from public.wa_observed_messages m
    where m.contact_id is not null and m.archived_at is null
      and not coalesce(m.is_group, false) and coalesce(btrim(m.body), '') <> ''
    group by 1
    having count(*) filter (where m.direction = 'in') >= 2
  ),
  newest as (
    select contact_id, max(at) as material_at from talked group by 1
  )
  select c.id, c.company_id, c.salesperson_id, n.material_at
  from newest n
  join public.contacts c on c.id = n.contact_id
  left join public.lead_memory lm on lm.contact_id = c.id
  where lm.contact_id is null or lm.material_at is null or lm.material_at < n.material_at
  order by n.material_at desc
  limit greatest(p_limit, 1);
$function$;

comment on function public.lead_memory_candidates(integer) is
  'Leads that had a real conversation and whose memory is missing or out of date, newest material first. Keeps the nightly harvest to the dozen leads actually worth a model call.';

revoke all on function public.lead_memory_candidates(integer) from public, anon, authenticated;

-- Read twelve conversations an hour, forever.
--
-- 226 leads are waiting. At twelve an hour the backlog clears in under a day
-- and then the job costs one query on most runs, because the candidate list
-- only returns leads whose material is newer than their memory.
--
-- Twelve and not forty: each one is a model call over up to 1,500 characters
-- of transcript plus sixty WhatsApp messages. win-harvest takes forty because
-- it reads short summaries. This reads the actual conversation, and the edge
-- CPU budget is what returns HTTP 546 when a batch is too greedy — the same
-- wall knowledge-ingest hit with a whole book.

select cron.unschedule('lead-memory-hourly')
 where exists (select 1 from cron.job where jobname = 'lead-memory-hourly');

select cron.schedule('lead-memory-hourly', '23 * * * *', $$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/lead-memory',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('mode', 'scan', 'limit', 12)
  );
$$);
