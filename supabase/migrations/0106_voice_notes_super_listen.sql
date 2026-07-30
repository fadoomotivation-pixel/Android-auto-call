-- The super admin could read every voice note's TEXT but could not play one.
--
-- The storage policy scopes the voice-notes bucket to current_company_id(), so
-- signing a playback URL worked only inside the admin's own tenant. On the Daily
-- Pulse — which is explicitly cross-company for the platform owner — every
-- other company's audio was unplayable.
--
-- Same gap already closed for companies and profiles. Company admins are
-- unchanged: still their own company's folder only.
drop policy if exists voice_notes_storage_select_super on storage.objects;
create policy voice_notes_storage_select_super on storage.objects
  for select
  using (bucket_id = 'voice-notes' and public.is_super_admin());
