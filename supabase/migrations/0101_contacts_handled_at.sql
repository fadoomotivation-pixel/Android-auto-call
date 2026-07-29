-- A lead leaves "New" only once the rep has SAID something about it.
--
-- Until now the app drained a lead out of New the moment last_contacted_at was
-- stamped — and that is stamped by a trigger on every call_logs insert. So a
-- mis-tap that dialled and hung up instantly moved the lead into Today with
-- nothing recorded, which is exactly what the telecallers were complaining
-- about: "galti se click ho jaata hai aur lead New se hat jaati hai".
--
-- last_contacted_at keeps its own meaning (when was this lead last CALLED — the
-- velocity and reporting views depend on it). This adds a separate stamp for
-- when the rep actually recorded an outcome, and that is what moves a lead.
--
-- "Recorded an outcome" = any of the three things the post-call prompt offers:
--   • picked a funnel status   • left a voice note   • typed a note
-- plus scheduling a callback, which is a decision too.
alter table public.contacts
  add column if not exists handled_at timestamptz;

create index if not exists idx_contacts_handled
  on public.contacts (salesperson_id, handled_at);

-- 1. The rep picked a status. Reassignment resets a lead to 'new' (see
--    stamp_assigned_at) and imports arrive as 'new'/'queued' — neither is the
--    rep reporting a call, so those never count.
create or replace function public.stamp_handled_from_status()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status
     and new.status::text not in ('new', 'queued') then
    new.handled_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_handled_status on public.contacts;
create trigger trg_stamp_handled_status
  before update of status on public.contacts
  for each row execute function public.stamp_handled_from_status();

-- 2. A voice note about the lead.
create or replace function public.stamp_handled_from_voice_note()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.contacts set handled_at = now() where id = new.contact_id;
  return null;
end $$;

drop trigger if exists trg_stamp_handled_voice on public.lead_voice_notes;
create trigger trg_stamp_handled_voice
  after insert on public.lead_voice_notes
  for each row execute function public.stamp_handled_from_voice_note();

-- 3. A typed note on the call itself. The call log alone means nothing; the
--    note on it is the rep talking.
create or replace function public.stamp_handled_from_call_note()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is not null and coalesce(btrim(new.notes), '') <> '' then
    update public.contacts set handled_at = now() where id = new.contact_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_stamp_handled_call_note on public.call_logs;
create trigger trg_stamp_handled_call_note
  after insert or update of notes on public.call_logs
  for each row execute function public.stamp_handled_from_call_note();

-- 4. The typed note from the post-call prompt lands on the lead itself, not on
--    the call row, so it needs its own stamp. UPDATE only: an import that
--    arrives carrying notes hasn't been worked by anyone.
create or replace function public.stamp_handled_from_contact_note()
returns trigger language plpgsql as $$
begin
  if new.notes is distinct from old.notes and coalesce(btrim(new.notes), '') <> '' then
    new.handled_at := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_handled_contact_note on public.contacts;
create trigger trg_stamp_handled_contact_note
  before update of notes on public.contacts
  for each row execute function public.stamp_handled_from_contact_note();

-- 5. Booking the next touch is a decision about the lead.
create or replace function public.stamp_handled_from_follow_up()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is not null then
    update public.contacts set handled_at = now() where id = new.contact_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_stamp_handled_followup on public.follow_ups;
create trigger trg_stamp_handled_followup
  after insert on public.follow_ups
  for each row execute function public.stamp_handled_from_follow_up();

-- Backfill so nothing jumps around on the day this ships: a lead that already
-- carries a real status, a note, a voice note or a follow-up was handled, and
-- the best timestamp we have for that is when it was last called.
update public.contacts ct
set handled_at = coalesce(ct.last_contacted_at, ct.updated_at)
where ct.handled_at is null
  and (
    ct.status::text not in ('new', 'queued')
    or exists (select 1 from public.lead_voice_notes v where v.contact_id = ct.id)
    or exists (select 1 from public.follow_ups f where f.contact_id = ct.id)
    or exists (select 1 from public.call_logs cl
               where cl.contact_id = ct.id and coalesce(btrim(cl.notes), '') <> '')
  );
