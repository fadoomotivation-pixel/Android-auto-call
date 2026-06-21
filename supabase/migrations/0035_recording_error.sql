-- Persist WHY a recording failed, so "recording_status = failed" is never opaque.
-- Populated by the recording-upload edge function (e.g. missing Google OAuth
-- secrets, revoked refresh token, Drive API rejection). NULL on success.
alter table public.call_logs
  add column if not exists recording_error text;
