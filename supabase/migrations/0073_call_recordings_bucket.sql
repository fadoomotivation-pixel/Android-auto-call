-- Private bucket for call recordings so the feature works WITHOUT Google Drive.
-- Accessed only through the recording-upload / recording-url edge functions
-- (service role); those already gate access via call_logs RLS.
-- No allowed_mime_types restriction: budget phones' native recorders emit many
-- containers (amr, 3gp, ogg, …). This bucket is private and written ONLY by the
-- recording-upload edge function, which sniffs magic bytes before storing, so
-- the size limit is the guard we need — not a mime allow-list that silently
-- rejects real recordings.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('call-recordings', 'call-recordings', false, 52428800, null)
on conflict (id) do nothing;
