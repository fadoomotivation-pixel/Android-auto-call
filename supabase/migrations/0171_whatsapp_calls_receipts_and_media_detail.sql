-- WhatsApp calls, read receipts, and what the attachment actually was.
--
-- THE CALL GAP, CLOSED AT LAST
--
-- The first thing asked of this whole feature was: "jo lead ko call WhatsApp
-- call se jaa rahi hai uska Daily Pulse me log nahi aata." Reps here ring buyers
-- on WhatsApp constantly. The SIM call log cannot see it, and neither could the
-- observer — so a rep who spent the morning on WhatsApp calls read as a rep who
-- made no calls at all. Every other part of this feature shipped before the one
-- that was actually asked for.
--
-- Calls get their OWN table rather than a row in wa_observed_messages. A call is
-- not a message, and folding it in would silently corrupt messages_sent,
-- details_shared and reply-speed — every number the founder already reads.

create table if not exists public.wa_observed_calls (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  salesperson_id uuid not null references public.profiles(id) on delete cascade,
  contact_id     uuid not null references public.contacts(id) on delete cascade,
  wa_call_id     text not null,
  direction      text not null check (direction in ('out', 'in')),
  -- offer | ringing | accept | reject | timeout. Kept raw from WhatsApp: the
  -- CRM decides what "connected" means, rather than the worker guessing and
  -- being wrong in a way nobody can audit later.
  status         text not null,
  video          boolean not null default false,
  started_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

create unique index if not exists uq_wa_observed_call
  on public.wa_observed_calls(salesperson_id, wa_call_id);
create index if not exists idx_wa_call_contact
  on public.wa_observed_calls(contact_id, started_at desc);
create index if not exists idx_wa_call_rep_day
  on public.wa_observed_calls(company_id, salesperson_id, started_at desc);

alter table public.wa_observed_calls enable row level security;

-- Identical shape to wa_observed_messages: super admin everything, an admin
-- their company, a rep only their own. A rep must never read another rep's
-- call log any more than their chats.
drop policy if exists wa_calls_select on public.wa_observed_calls;
create policy wa_calls_select on public.wa_observed_calls
  for select using (
    public.is_super_admin()
    or (company_id = public.current_company_id()
        and (public.is_admin() or salesperson_id = auth.uid()))
  );

-- ── did the rep even open it? ───────────────────────────────────────────────
--
-- "Buyer waiting 4 hours" is already the sharpest line in the Pulse. read_at
-- splits it into the two cases that deserve different conversations: the rep
-- read the question and has not answered (a priorities problem), or has not
-- looked at WhatsApp at all (an attendance one).
alter table public.wa_observed_messages
  add column if not exists read_at timestamptz;

comment on column public.wa_observed_messages.read_at is
  'When the REP opened an inbound message. Null on outbound, and null inbound '
  'means unread — which is a different failure from unanswered.';

-- ── what the attachment actually was ────────────────────────────────────────
--
-- "Sent a document" and "sent Dholera-Plot-A-Layout.pdf" are the same event and
-- very different sentences. WhatsApp does not keep the filename anywhere the
-- CRM can reach afterwards, so if it is not captured on arrival it is gone.
alter table public.wa_observed_messages
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size bigint,
  add column if not exists duration_seconds int,
  -- The buyer's own WhatsApp profile name. Never used for matching — that stays
  -- phone-number-only — but it puts a human name next to "Facebook Lead 4412".
  add column if not exists peer_name text;

-- ── the rep's WhatsApp calls, per IST day ───────────────────────────────────
create or replace view public.v_rep_wa_calls_daily
with (security_invoker = true) as
select
  c.company_id,
  c.salesperson_id,
  (c.started_at at time zone 'Asia/Kolkata')::date as day_ist,
  count(*)                                             as calls_total,
  count(*) filter (where c.direction = 'out')          as calls_out,
  count(*) filter (where c.direction = 'in')           as calls_in,
  -- Answered is the only one worth a founder's attention. A ring that nobody
  -- picked up is effort, not contact, and counting the two together is how
  -- "40 WhatsApp calls today" would come to mean nothing.
  count(*) filter (where c.status = 'accept')          as calls_answered,
  count(distinct c.contact_id)                         as leads_called
from public.wa_observed_calls c
group by c.company_id, c.salesperson_id, (c.started_at at time zone 'Asia/Kolkata')::date;

comment on view public.v_rep_wa_calls_daily is
  'WhatsApp calls a rep made or received with this company''s leads. The SIM '
  'call log cannot see these at all.';
