-- A brand-new lead that doesn't answer loses the call log entirely.
--
-- My own bug, shipped in 0120 this morning. The attempt counter read:
--
--     where l.contact_id = c.id and coalesce(l.outcome, '') <> 'connected'
--
-- call_logs.outcome is the enum call_outcome, and '' is not a member of it, so
-- coalesce() cannot build a common type and Postgres raises
--
--     invalid input value for enum call_outcome: ""
--
-- inside a BEFORE-INSERT trigger — which aborts the whole INSERT. The rep's
-- call simply never lands.
--
-- It hid because of the branch it lives in: the trigger returns early unless the
-- lead is still 'new'/'queued', and 0120's own backfill had just moved every
-- previously-called lead out of New. So the only way to reach it is a genuinely
-- fresh lead that doesn't pick up — which is the single most common thing that
-- happens to a new Facebook lead, arriving every ten minutes on the poll cron.
-- My testing after 0120 checked the backfill and the "already called" paths and
-- never dialled a new lead that didn't answer.
--
-- `is distinct from` needs no cast and treats a NULL outcome as "not connected",
-- which is what an unlabelled call actually is.
create or replace function public.apply_call_to_new_lead()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c record;
  secs int := coalesce(new.duration_seconds, 0);
  reached boolean := (new.outcome = 'connected');
  tries int;
begin
  if new.contact_id is null then
    return null;
  end if;

  select id, status::text as st, attempts, handled_at into c
    from public.contacts where id = new.contact_id;
  if not found or c.st not in ('new', 'queued') then
    return null;
  end if;

  if reached then
    update public.contacts
       set status = 'called',
           handled_at = coalesce(new.started_at, now())
     where id = c.id;

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
     where l.contact_id = c.id
       and l.outcome is distinct from 'connected'::public.call_outcome;

    update public.contacts
       set status = 'no_answer',
           attempts = greatest(coalesce(c.attempts, 0), tries, 1)
     where id = c.id;

    -- Deliberately NO handled_at: nobody was reached, so nothing was recorded.
  end if;

  return null;
end $$;
