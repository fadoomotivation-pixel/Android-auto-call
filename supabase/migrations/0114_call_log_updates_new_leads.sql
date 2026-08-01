-- "74 leads in New" — but Shweta had already spoken to fifteen of them.
--
-- New is labelled "Not called yet". It was holding leads she had talked to for
-- 175, 148, 126, 107 and 90 seconds. Every one still said status='new',
-- attempts=0, so they sat in the FRESH section, indistinguishable from a lead
-- nobody has ever touched. She is right that the number is wrong.
--
-- The reason is the same hole 0109 closed for follow-ups: skipping the
-- post-call prompt is allowed and deliberately harmless, but nothing else ever
-- read the call log back onto the lead. The call log knew she had a
-- three-minute conversation; the lead did not.
--
-- 0101 deliberately refused to move a lead on a call alone, and it was right to:
-- a mis-tap dials and hangs up, and leads used to vanish out of New with
-- nothing written down. That reasoning holds for a two-second mis-dial. It does
-- not hold for a two-minute conversation. So the rule is split by what the call
-- log actually shows:
--
--   • 30 seconds or more, connected  → the rep SPOKE to this person. The lead is
--     'called' (which claims nothing about the funnel — only that it has been
--     called) and handled_at is stamped at the time of the call.
--   • shorter than that             → treat it as a try, not a conversation:
--     bump attempts so it shows under "Tried before — call again" instead of
--     posing as a fresh lead. Status is untouched.
--
-- Neither branch invents a funnel stage, and neither touches a lead whose rep
-- has already recorded an outcome — this only ever acts on 'new' / 'queued'.
create or replace function public.apply_call_to_new_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c record;
  secs int := coalesce(new.duration_seconds, 0);
begin
  if new.contact_id is null then
    return null;                       -- off-CRM call: belongs to no lead
  end if;

  select id, status::text as st, attempts, handled_at into c
    from public.contacts where id = new.contact_id;
  if not found or c.st not in ('new', 'queued') then
    return null;                       -- the rep has already said what happened
  end if;

  if secs >= 30 then
    update public.contacts
       set status = 'called',
           handled_at = coalesce(new.started_at, now())
     where id = c.id;

    -- company_id is NOT NULL on lead_activities, so never let a call row that
    -- somehow lacks one turn a timeline note into a failed call sync.
    if new.company_id is not null then
      insert into public.lead_activities (company_id, contact_id, actor_id, actor_name, type, detail)
      values (new.company_id, c.id, new.salesperson_id, 'Call log 📞', 'status',
              'Stage → Called — a ' || secs || ' second call is on the log, so this is not a new lead any more.');
    end if;
  elsif coalesce(c.attempts, 0) = 0 then
    update public.contacts set attempts = 1 where id = c.id;
  end if;

  return null;
end $$;

drop trigger if exists trg_apply_call_to_new_lead on public.call_logs;
create trigger trg_apply_call_to_new_lead
  after insert or update of contact_id, duration_seconds on public.call_logs
  for each row execute function public.apply_call_to_new_lead();

-- Same rule over the history. Talked-to leads first...
with talked as (
  select c.id,
         max(cl.duration_seconds) as secs,
         max(cl.started_at)       as at
    from public.contacts c
    join public.call_logs cl on cl.contact_id = c.id
   where c.status::text in ('new', 'queued')
     and coalesce(cl.duration_seconds, 0) >= 30
   group by c.id
)
update public.contacts c
   set status = 'called', handled_at = t.at
  from talked t
 where c.id = t.id;

-- ...then the short tries, which stay where they are but stop looking untouched.
update public.contacts c
   set attempts = 1
 where c.status::text in ('new', 'queued')
   and coalesce(c.attempts, 0) = 0
   and exists (select 1 from public.call_logs cl where cl.contact_id = c.id);
