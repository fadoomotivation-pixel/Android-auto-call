-- Lead reactivation
--
-- "Today's buyer goes cold, then re-engages later." Previously a cold/dormant
-- lead only came back to life if a rep manually noticed and re-scored it. This
-- makes it automatic: whenever a dormant lead re-engages on any channel (replies
-- on WhatsApp, re-submits a web capture form), it is flipped back to a HOT
-- "callback" so it resurfaces in the rep's existing Hot/Open lead filters, a
-- due-now follow-up task is created for the owner, and the event is tracked.
--
-- Design note: reusing temperature='hot' + status='callback' means the feature
-- shows up through the UI the app already has — no client changes required for
-- it to be visible. reactivated_at / reactivation_count are added for reporting.

alter table public.contacts
  add column if not exists last_inbound_at    timestamptz,
  add column if not exists reactivated_at     timestamptz,
  add column if not exists reactivation_count integer not null default 0;

create index if not exists idx_contacts_reactivated_at on public.contacts(reactivated_at);

-- Shared reactivation routine, called by the inbound triggers/functions below.
-- SECURITY DEFINER so it can run from a trigger fired by any inserting role; we
-- revoke direct EXECUTE from clients so it can't be called arbitrarily over RPC.
create or replace function public.reactivate_lead(p_contact_id uuid, p_signal text default 'inbound')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.contacts;
begin
  select * into c from public.contacts where id = p_contact_id;
  if not found then return; end if;

  -- Always record that the buyer reached out.
  update public.contacts
     set last_inbound_at = now(), updated_at = now()
   where id = p_contact_id;

  -- Never wake a Do-Not-Call, a brand-new lead (that's first-touch, not a
  -- reactivation), or a lead already moving through the closing stages.
  if c.status in ('dnc', 'new', 'interested', 'site_visit', 'proposal', 'booked') then
    return;
  end if;

  -- Everything else (no_answer, busy, callback, called, queued, not_interested,
  -- callback, lost, invalid, …) — or anything the AI marked cold — is dormant and
  -- worth resurfacing as a hot callback.
  update public.contacts
     set status             = 'callback',
         temperature        = 'hot',
         reactivated_at     = now(),
         reactivation_count = reactivation_count + 1,
         updated_at         = now()
   where id = p_contact_id;

  -- Drop a due-now follow-up task for the owning rep (the table requires an
  -- owner). Don't pile up duplicates if one is already pending for this lead.
  if c.salesperson_id is not null then
    insert into public.follow_ups (company_id, salesperson_id, contact_id, phone, name, due_at, note, status)
    select c.company_id, c.salesperson_id, c.id, c.phone, c.name, now(),
           '🔥 Re-engaged (' || p_signal || ') — call back', 'pending'
    where not exists (
      select 1 from public.follow_ups f
       where f.contact_id = c.id and f.status = 'pending'
    );
  end if;
end;
$$;

revoke execute on function public.reactivate_lead(uuid, text) from public;
revoke execute on function public.reactivate_lead(uuid, text) from anon, authenticated;

-- Fire on every inbound WhatsApp message that's linked to a known contact — the
-- single most common "buyer comes back" signal.
create or replace function public.trg_wa_inbound_reactivate()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.direction = 'in' and new.contact_id is not null then
    perform public.reactivate_lead(new.contact_id, 'whatsapp');
  end if;
  return new;
end;
$$;

drop trigger if exists wa_inbound_reactivate on public.whatsapp_messages;
create trigger wa_inbound_reactivate
  after insert on public.whatsapp_messages
  for each row execute function public.trg_wa_inbound_reactivate();
