-- The ledger for the Nidhi transfers, written down because it exists.
--
-- This table was created straight against production while moving leads, and
-- a table that is in the database and in no migration is drift: the next
-- person to rebuild this schema gets a database that cannot answer "where did
-- this lead come from". It holds every lead handed to Nidhi, its original
-- company and rep, and why it was picked — which is the only way the two
-- transfers can be reversed.
--
-- batch 1 (112)  leads with real evidence of interest, pulled from Manas
--                property, capital brix, ankit and mayur dholera.
-- batch 2 (363)  leads nobody owned and nobody had ever called: 316 from
--                Manas (Aug) and 47 from ankit (Jul).
--
-- RLS on with no policies, the same shape as the other operational tables
-- here: PostgREST reaches nothing, the service role is unaffected. It maps
-- customers to the company that used to own them, which is not something a
-- logged-in client should be able to read a row of.
--
-- APPLIED TO PRODUCTION on 2026-10-19.

create table if not exists public.lead_transfer_to_nidhi_backup (
  contact_id uuid primary key,
  from_company_id uuid,
  from_company text,
  from_salesperson_id uuid,
  from_rep text,
  tier text,
  stage text,
  best_talk_seconds int,
  moved_at timestamptz not null default now(),
  batch int not null default 1
);

alter table public.lead_transfer_to_nidhi_backup add column if not exists batch int not null default 1;
alter table public.lead_transfer_to_nidhi_backup enable row level security;

comment on table public.lead_transfer_to_nidhi_backup is
  'Every lead handed to Nidhi, with the company and rep it came from and the reason it was chosen. The reverse of both transfers is driven from here.';
