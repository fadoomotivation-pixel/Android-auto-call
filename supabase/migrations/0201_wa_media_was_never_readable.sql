-- The file was stored. It was never readable.
--
-- The panel showed both halves of this contradiction at once: a green
-- "📎 1/1 file downloaded" in the header, and "The file was not saved" on the
-- bubble underneath it. Both were reading the same row.
--
-- The header counts media_path. The bubble needs a SIGNED URL, and
-- createSignedUrls runs as the signed-in user, against storage.objects RLS.
--
-- storage.objects has policies for every bucket this product uses —
-- expense-bills, employee-photos, content-library, voice-notes — and NONE for
-- wa-media. The edge function could write files because the service role
-- bypasses RLS. Nobody could ever read one back.
--
-- It went unnoticed for as long as it did because until today there were no
-- files to fail on: two gates in whatsapp-observe were discarding every
-- attachment on arrival, so the first file that reached the bucket was also the
-- first request for a signed URL. Two bugs in a row, each hiding the next. And
-- the page discarded the error from createSignedUrls, which is what made a
-- permissions problem look like a download problem.
--
-- Same shape as the message RLS (wa_observed_select), so the file and the
-- message it belongs to are visible to exactly the same people: the super
-- admin anywhere, a company admin inside their own company, and a telecaller
-- for their own captures. The path is <company_id>/<salesperson_id>/<file>.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-16.

drop policy if exists wa_media_select_super on storage.objects;
create policy wa_media_select_super on storage.objects
  for select using (bucket_id = 'wa-media' and public.is_super_admin());

drop policy if exists wa_media_select_admin on storage.objects;
create policy wa_media_select_admin on storage.objects
  for select to authenticated using (
    bucket_id = 'wa-media'
    and (storage.foldername(name))[1] = (public.current_company_id())::text
    and public.is_admin()
  );

drop policy if exists wa_media_select_own on storage.objects;
create policy wa_media_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'wa-media'
    and (storage.foldername(name))[2] = (auth.uid())::text
  );
