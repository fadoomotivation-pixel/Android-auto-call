-- "Jo number call kar liye the, wo abhi bhi New me pade hain."
--
-- They are right, and 0114 is why. It only moved a lead out of New when the
-- call ran 30 seconds or longer. Everything shorter kept status='new' and just
-- bumped attempts, so twelve leads that had genuinely been dialled were still
-- sitting in New:
--
--   Bijender Kumar  — connected, 11s   → still New
--   Kamal Singh     — connected, 12s   → still New
--   Rupalidiwakar   — connected, 16s   → still New
--   six more        — no_answer        → still New
--
-- 0114 split the rule at 30 seconds to protect against a mis-tap dialling and
-- silently emptying New. That fear was right about a lead VANISHING and wrong
-- about what "New" means. New is labelled "never called yet". A rep who dialled
-- a number and heard it ring has called it. Leaving it in New tells them the
-- opposite of what they just did, and it is the second time they have reported
-- exactly this.
--
-- So the rule is now what a rep would say out loud:
--
--   • they picked up (connected)   → 'called'. Not a funnel claim — only that
--     this lead has been spoken to. Out of New, into the working pile.
--   • it rang and nobody answered  → 'no_answer', and attempts counts the real
--     number of no-connect calls on the log. Out of New, into Follow-up, which
--     is where the app now shows "call these again".
--
-- Nothing here invents a funnel stage, and nothing touches a lead whose rep has
-- already recorded an outcome — it still only ever acts on 'new' / 'queued'.
-- And a mis-tap no longer disappears anything: 'no_answer' is a LOUDER place
-- than New, not a quieter one.
create or replace function public.apply_call_to_new_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c record;
  secs int := coalesce(new.duration_seconds, 0);
  reached boolean := (new.outcome = 'connected');
  tries int;
begin
  if new.contact_id is null then
    return null;                       -- off-CRM call: belongs to no lead
  end if;

  select id, status::text as st, attempts, handled_at into c
    from public.contacts where id = new.contact_id;
  if not found or c.st not in ('new', 'queued') then
    return null;                       -- the rep has already said what happened
  end if;

  if reached then
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
  else
    -- Counted from the log rather than incremented, so a re-fired trigger or a
    -- re-synced row can never inflate the attempt ladder that decides when a
    -- lead goes cold.
    select count(*) into tries
      from public.call_logs l
     where l.contact_id = c.id and coalesce(l.outcome, '') <> 'connected';

    update public.contacts
       set status = 'no_answer',
           attempts = greatest(coalesce(c.attempts, 0), tries, 1)
     where id = c.id;

    -- Deliberately NO handled_at: nobody was reached, so nothing was recorded.
    -- Stamping it would drop the lead into Today as if it were done, when what
    -- it actually needs is another call.
  end if;

  return null;
end $$;

drop trigger if exists trg_apply_call_to_new_lead on public.call_logs;
create trigger trg_apply_call_to_new_lead
  after insert or update of contact_id, duration_seconds, outcome on public.call_logs
  for each row execute function public.apply_call_to_new_lead();

-- Catch up every lead the old 30-second rule left behind. Reached first...
with reached as (
  select cl.contact_id as id, max(cl.started_at) as at
    from public.call_logs cl
    join public.contacts c on c.id = cl.contact_id
   where c.status::text in ('new', 'queued') and cl.outcome = 'connected'
   group by cl.contact_id
)
update public.contacts c
   set status = 'called', handled_at = coalesce(r.at, c.handled_at, now())
  from reached r
 where c.id = r.id;

-- ...then everyone who was dialled and never picked up.
with tried as (
  select cl.contact_id as id, count(*) as tries
    from public.call_logs cl
    join public.contacts c on c.id = cl.contact_id
   where c.status::text in ('new', 'queued')
   group by cl.contact_id
)
update public.contacts c
   set status = 'no_answer',
       attempts = greatest(coalesce(c.attempts, 0), t.tries, 1)
  from tried t
 where c.id = t.id;
