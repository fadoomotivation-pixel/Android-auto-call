-- A website enquiry has a follow-up date.
--
-- The onboarding admin (website.callproai.in/admin, source site999/admin/)
-- sets it from "Follow up on" and shows Overdue / Today badges and a "Follow up
-- due" tab. Only the site999 edge function writes it, with the service role
-- behind the admin password.
--
-- Nothing else changes: no existing column is touched, and the table stays
-- insert-only for anon (policy site999_anon_insert) — anon has no SELECT or
-- UPDATE policy, so this column is as private as the rest of the row.

alter table public.site999_onboarding add column if not exists follow_up_at timestamptz;

create index if not exists site999_onboarding_follow_up_idx
  on public.site999_onboarding (follow_up_at)
  where follow_up_at is not null;

comment on column public.site999_onboarding.follow_up_at is
  'When to follow up with this enquiry. Set from the onboarding admin; read by its Follow up due tab.';
