-- An additional phone number a telecaller can capture for a lead (many buyers
-- share a second/alternate mobile). Nullable and additive — old clients ignore it.
alter table public.contacts
  add column if not exists alt_phone text;

comment on column public.contacts.alt_phone is
  'Optional second phone number for the lead, editable by the rep on the lead page.';
