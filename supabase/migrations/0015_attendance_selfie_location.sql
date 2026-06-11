-- ============================================================
-- Attendance proof: store the punch-in selfie + a human location label.
--   punch_in_lat / punch_in_lng already exist (migration 0012). We keep the
--   selfie as a compressed base64 data-URL thumbnail so no storage bucket /
--   signed-URL plumbing is needed; it renders directly in the app + dashboard.
-- ============================================================
alter table public.attendance
  add column if not exists selfie         text,
  add column if not exists location_label text;
