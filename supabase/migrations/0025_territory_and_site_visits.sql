-- ============================================================
-- Add Territory and Site Visit support
-- ============================================================

alter table public.profiles
  add column if not exists territory text;

alter table public.contacts
  add column if not exists territory text,
  add column if not exists site_visit_at timestamptz,
  add column if not exists site_visit_project text;
