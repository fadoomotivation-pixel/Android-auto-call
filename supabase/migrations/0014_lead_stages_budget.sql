-- ============================================================
-- Real-estate lead pipeline: richer closing stages + budget.
--   Adds the "Site Visit" and "Proposal" stages telecallers move a lead
--   through, plus an optional budget the rep captures on the lead card.
-- ============================================================
do $$ begin alter type public.contact_status add value if not exists 'site_visit'; exception when others then null; end $$;
do $$ begin alter type public.contact_status add value if not exists 'proposal';   exception when others then null; end $$;

alter table public.contacts add column if not exists budget text;
