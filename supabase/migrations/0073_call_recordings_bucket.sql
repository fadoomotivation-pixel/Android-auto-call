-- Private bucket for call recordings so the feature works WITHOUT Google Drive.
-- Accessed only through the recording-upload / recording-url edge functions
-- (service role); those already gate access via call_logs RLS.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('call-recordings', 'call-recordings', false, 52428800, array['audio/mp4','audio/wav','audio/mpeg','audio/aac','audio/x-m4a'])
on conflict (id) do nothing;
