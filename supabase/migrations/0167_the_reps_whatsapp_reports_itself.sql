-- A telecaller's WhatsApp, observed — never driven.
--
-- The founder's call: run Baileys on the reps' own numbers, read only, "bus
-- data le rahe h". This encodes that decision so it cannot quietly drift into
-- the thing that gets numbers banned.
--
-- WHY OBSERVE-ONLY IS THE WHOLE DESIGN
--
-- Baileys is an unofficial WhatsApp client and accounts do get banned for it.
-- What gets banned fastest is a SENDING pattern: identical messages, bursts, a
-- number that talks to strangers all day. A linked device that watches the
-- conversations a human is already having by hand looks, to WhatsApp, like a
-- second phone — which is what it is. That is a materially smaller risk than
-- automated sending, and it is the only version of this the schema allows: no
-- table here holds an outbound queue, and nothing here can be sent from.
--
-- The rep keeps sending by hand from their own WhatsApp, exactly as today. This
-- only writes down what happened, so the admin's Daily Pulse stops pretending
-- that WhatsApp work does not exist.
--
-- WHAT IS DELIBERATELY NOT STORED
--
-- A rep's WhatsApp carries their life: family, friends, salary talk. The rule
-- here is absolute and enforced in match_wa_contact() below — a message is only
-- ever recorded when the other party's number matches a LEAD IN THAT REP'S OWN
-- COMPANY. Everything else is dropped at the door and never reaches a row. The
-- body is a 300-character preview, not the message, for the same reason.

-- ── 1. a Baileys session can now belong to a rep ─────────────────────────────
--
-- Existing rows are the founder/company notification numbers. They stay exactly
-- as they are: salesperson_id null, observe_only false, still allowed to send
-- the daily pulse. A rep row is the opposite of that in both columns.

alter table public.whatsapp_baileys
  add column if not exists salesperson_id uuid references public.profiles(id) on delete cascade;

alter table public.whatsapp_baileys
  add column if not exists observe_only boolean not null default false;

-- One live session per rep, and one company-level session as before.
create unique index if not exists uq_wa_baileys_rep
  on public.whatsapp_baileys(company_id, salesperson_id)
  where salesperson_id is not null;

comment on column public.whatsapp_baileys.observe_only is
  'true = this session may only listen. Rep numbers are always true; the '
  'founder notification number is false so it can still send the daily pulse.';

-- A rep session that is not observe_only is the one mistake this feature must
-- never make, so the database refuses it rather than trusting every caller.
alter table public.whatsapp_baileys
  drop constraint if exists chk_wa_baileys_rep_observe_only;
alter table public.whatsapp_baileys
  add constraint chk_wa_baileys_rep_observe_only
  check (salesperson_id is null or observe_only);

-- ── 2. what was observed ─────────────────────────────────────────────────────

create table if not exists public.wa_observed_messages (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  salesperson_id uuid not null references public.profiles(id) on delete cascade,
  -- Always set: a row that matched no lead is never written at all.
  contact_id     uuid not null references public.contacts(id) on delete cascade,
  -- WhatsApp's own id, so replaying a batch cannot double-count a rep's day.
  wa_message_id  text not null,
  direction      text not null check (direction in ('out', 'in')),
  -- A preview, never the message. Enough for an admin to see that details went
  -- out; not enough to read a rep's conversations over their shoulder.
  body_preview   text,
  has_media      boolean not null default false,
  -- Did this message carry the project details a buyer asked for? Set by the
  -- ingest function from a link or an attachment, not guessed here.
  shared_details boolean not null default false,
  sent_at        timestamptz not null,
  created_at     timestamptz not null default now()
);

create unique index if not exists uq_wa_observed_msg
  on public.wa_observed_messages(salesperson_id, wa_message_id);
create index if not exists idx_wa_observed_contact
  on public.wa_observed_messages(contact_id, sent_at desc);
create index if not exists idx_wa_observed_rep_day
  on public.wa_observed_messages(company_id, salesperson_id, sent_at desc);

alter table public.wa_observed_messages enable row level security;

-- Same shape as lead_activities: super admin sees all, an admin sees their
-- company, a rep sees their own. A rep must never read another rep's WhatsApp.
drop policy if exists wa_observed_select on public.wa_observed_messages;
create policy wa_observed_select on public.wa_observed_messages
  for select using (
    public.is_super_admin()
    or (company_id = public.current_company_id()
        and (public.is_admin() or salesperson_id = auth.uid()))
  );

-- Writes come from the ingest edge function on the service role only. No
-- policy for insert/update/delete: nothing with a user JWT can write here.

-- ── 3. the matching rule, and the privacy gate ───────────────────────────────

create or replace function public.match_wa_contact(p_company uuid, p_phone text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  -- Last ten digits: the CRM stores +91 98765 43210, WhatsApp hands back
  -- 919876543210, and a rep may have saved it either way.
  select c.id
  from public.contacts c
  where c.company_id = p_company
    and right(regexp_replace(c.phone, '\D', '', 'g'), 10)
      = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
    and length(regexp_replace(p_phone, '\D', '', 'g')) >= 10
  order by c.created_at desc
  limit 1;
$$;

comment on function public.match_wa_contact(uuid, text) is
  'The privacy gate. Returns null for any number that is not a lead in this '
  'company, and the ingest function drops those messages unread. This is what '
  'keeps a rep''s personal chats out of the CRM.';

-- ── 4. it shows up where the rep and the admin already look ──────────────────
--
-- lead_activities is what "What I did today" reads and what the lead page's
-- Journey draws. Putting WhatsApp there means it appears in both without a
-- second feed to build, and it is why the Daily Pulse can finally count it.

create or replace function public.wa_observed_to_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor text;
begin
  -- Only what the REP did. A buyer's reply is worth storing and worth showing
  -- on the lead, but it is not the rep's work and must not inflate their day.
  if new.direction <> 'out' then
    return null;
  end if;

  select coalesce(p.full_name, 'WhatsApp') into v_actor
  from public.profiles p where p.id = new.salesperson_id;

  insert into public.lead_activities (company_id, contact_id, actor_id, actor_name, type, detail)
  values (
    new.company_id, new.contact_id, new.salesperson_id,
    coalesce(v_actor, 'WhatsApp') || ' 💬',
    'whatsapp',
    case
      when new.shared_details then 'Sent project details on WhatsApp'
      when new.has_media then 'Sent a file on WhatsApp'
      else 'Messaged on WhatsApp'
    end
  );
  return null;
end $$;

drop trigger if exists trg_wa_observed_to_activity on public.wa_observed_messages;
create trigger trg_wa_observed_to_activity
  after insert on public.wa_observed_messages
  for each row execute function public.wa_observed_to_activity();

-- ── 5. what the admin gets ───────────────────────────────────────────────────
--
-- The question this exists to answer: who actually worked today, and on how
-- many leads — not who dialled the most numbers for eight seconds each.

create or replace view public.v_rep_whatsapp_daily
with (security_invoker = true) as
select
  m.company_id,
  m.salesperson_id,
  (m.sent_at at time zone 'Asia/Kolkata')::date            as day_ist,
  count(*) filter (where m.direction = 'out')              as messages_sent,
  count(distinct m.contact_id) filter (where m.direction = 'out') as leads_messaged,
  count(*) filter (where m.direction = 'out' and m.shared_details) as details_shared,
  count(distinct m.contact_id) filter (where m.direction = 'in')   as leads_who_replied,
  min(m.sent_at) filter (where m.direction = 'out')        as first_message_at,
  max(m.sent_at) filter (where m.direction = 'out')        as last_message_at
from public.wa_observed_messages m
group by m.company_id, m.salesperson_id, (m.sent_at at time zone 'Asia/Kolkata')::date;

comment on view public.v_rep_whatsapp_daily is
  'Per rep per IST day: messages sent, distinct leads messaged, project '
  'details shared, and leads who replied. leads_who_replied is the honest '
  'one — it cannot be inflated by sending more.';

-- Session health, so a rep whose WhatsApp quietly logged out three days ago is
-- visible instead of just looking like a rep who stopped working.
create or replace view public.v_rep_whatsapp_health
with (security_invoker = true) as
select b.company_id, b.salesperson_id, p.full_name as rep,
       b.status, b.wa_number, b.last_seen_at, b.last_error,
       b.last_seen_at < now() - interval '2 hours' as stale
from public.whatsapp_baileys b
join public.profiles p on p.id = b.salesperson_id
where b.salesperson_id is not null;
