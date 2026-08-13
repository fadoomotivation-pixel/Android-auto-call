-- 0164 — The Content Library takes FILES, not just links
--
-- content_assets has only ever stored a URL, so a brochure had to live
-- somewhere else on the internet before a rep could send it. Every company
-- here has its brochures as PDFs on somebody's laptop, which is why the
-- library is empty on all five tenants and reps have nothing to share.
--
-- A bucket, therefore. Two decisions worth writing down:
--
-- PUBLIC, deliberately. This is marketing material a rep sends to a buyer over
-- WhatsApp, and the buyer forwards it to their spouse. A signed URL expires and
-- that forward becomes a dead link and a call to the office. There is no
-- customer data in a brochure — the private buckets (call-recordings,
-- voice-notes) hold that, and they stay private.
--
-- WRITES ARE NOT PUBLIC. Only an admin of the owning company may upload, and
-- the first path segment MUST be their company id, so one tenant cannot write
-- into another's folder or overwrite their brochure.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content-library', 'content-library', true,
  52428800,  -- 50 MB: a plotted-development brochure with site photos
  array[
    'application/pdf',
    'image/png','image/jpeg','image/webp',
    'video/mp4','video/quicktime',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anyone may READ: the point of the bucket is a link a customer can open
-- without an account.
drop policy if exists content_library_read on storage.objects;
create policy content_library_read on storage.objects
  for select using (bucket_id = 'content-library');

-- Writes: an admin, inside their own company's folder, or the super admin.
-- storage.foldername()[1] is the first path segment — the company id.
drop policy if exists content_library_insert on storage.objects;
create policy content_library_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'content-library'
    and (
      public.is_super_admin()
      or (public.is_admin() and (storage.foldername(name))[1] = public.current_company_id()::text)
    )
  );

drop policy if exists content_library_update on storage.objects;
create policy content_library_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'content-library'
    and (
      public.is_super_admin()
      or (public.is_admin() and (storage.foldername(name))[1] = public.current_company_id()::text)
    )
  );

drop policy if exists content_library_delete on storage.objects;
create policy content_library_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'content-library'
    and (
      public.is_super_admin()
      or (public.is_admin() and (storage.foldername(name))[1] = public.current_company_id()::text)
    )
  );

-- Which file backs this asset, so a delete can take the file with it and the
-- page can tell an uploaded brochure from a pasted link.
alter table public.content_assets
  add column if not exists storage_path text;

-- Did this upload also go into the brain? Null = never tried (a link, or a
-- video), true = its text is in knowledge_chunks, false = we tried and the file
-- had no readable text (a scan). Shown on the page, because "I uploaded the
-- price list and the AI still doesn't know the price" is the question this
-- column exists to answer before it is asked.
alter table public.content_assets
  add column if not exists trained boolean;
