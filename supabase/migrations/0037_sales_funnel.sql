-- ============================================================
-- Sales funnel: Negotiation + Token Paid stages, with the
-- booking/token money milestone captured on the lead.
--   New → Contacted → Interested → Site Visit → Negotiation
--       → Token Paid → Booked
-- "Negotiation" supersedes the older "proposal" status (kept for
-- back-compat and folded into the Negotiation stage in the app).
-- "Token Paid" is the first money milestone: the buyer has paid a
-- booking token, recorded as token_amount + token_paid_at.
-- ============================================================
do $$ begin alter type public.contact_status add value if not exists 'negotiation'; exception when others then null; end $$;
do $$ begin alter type public.contact_status add value if not exists 'token_paid';  exception when others then null; end $$;

alter table public.contacts add column if not exists token_amount numeric;
alter table public.contacts add column if not exists token_paid_at timestamptz;
