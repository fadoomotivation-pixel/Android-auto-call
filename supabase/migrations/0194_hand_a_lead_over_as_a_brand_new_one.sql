-- "Purani leads kisi ko reassign karu to vo as a new lead ki tarah aaye."
--
-- WHY THIS IS A REAL PROBLEM AND NOT A PREFERENCE
--
-- Redistributing a pile of old leads is the commonest thing a founder does with
-- this CRM, and today it hands the new rep somebody else's verdict. The lead
-- opens at "not interested", with March's note saying the buyer was rude, a
-- cold temperature, a close probability of 11, and a callback the last rep
-- booked and never made. A telecaller reads that and rings — if they ring at
-- all — expecting a no. The whole reason for giving the lead to someone else
-- was to get a different conversation, and the screen guarantees the same one.
--
-- WHAT IS RESET, AND WHAT IS NOT
--
-- Reset: everything that records WORK DONE on the lead — status, stage, notes,
-- temperature, budget, the AI score and next action, close probability,
-- attempts, last contacted, handled, site visit, token. The pending callback is
-- cancelled rather than inherited: it was the previous rep's appointment, about
-- a conversation the new one has never had.
--
-- Kept: everything that IS the lead — name, number, alternate number, email,
-- company, source, campaign, the original created_at. Those did not change
-- hands; only the ownership did.
--
-- NOTHING IS DELETED
--
-- Every reset value is snapshotted into lead_handovers first. The founder and
-- the company admin keep the full story — who had it, what they did, what it
-- looked like at the moment it was passed on — and can see that a lead has been
-- round the block three times, which is exactly the sort of thing worth
-- knowing. The rep is the only one who sees a clean slate, because the rep is
-- the only one for whom a clean slate is useful.
--
-- The call recordings, activity timeline and voice notes are not touched at
-- all. They stop being VISIBLE to the current owner (0196) and stay in full for
-- anyone auditing.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-16.

alter table public.contacts
  add column if not exists fresh_start_at timestamptz;

comment on column public.contacts.fresh_start_at is
  'Set when this lead was handed to a rep as a BRAND-NEW lead. Everything before this moment belongs to the previous owner and is hidden from the current one — the old values are kept in lead_handovers and the old trail is still visible to admins.';

create index if not exists contacts_fresh_start_idx
  on public.contacts (salesperson_id, fresh_start_at)
  where fresh_start_at is not null;

create table if not exists public.lead_handovers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  from_salesperson_id uuid references public.profiles(id) on delete set null,
  to_salesperson_id uuid references public.profiles(id) on delete set null,
  handed_by uuid references public.profiles(id) on delete set null,
  at timestamptz not null default now(),
  snapshot jsonb not null default '{}'::jsonb
);

comment on table public.lead_handovers is
  'What a lead looked like the moment it was handed over as new. Nothing is deleted when a lead is reset — the previous owner''s stage, notes, scores and outcomes are copied here first, so the founder can still see the full story the rep no longer sees.';

create index if not exists lead_handovers_contact_idx on public.lead_handovers (contact_id, at desc);
create index if not exists lead_handovers_company_idx on public.lead_handovers (company_id, at desc);

alter table public.lead_handovers enable row level security;

drop policy if exists lead_handovers_select on public.lead_handovers;
create policy lead_handovers_select on public.lead_handovers
  for select using (
    is_super_admin() or (company_id = current_company_id() and is_admin())
  );
