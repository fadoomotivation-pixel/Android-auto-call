-- Admin-assigned uroperator agent extension + caller ID (DID) per salesperson.
alter table public.profiles add column if not exists sip_agent_id text;
alter table public.profiles add column if not exists caller_id text;
