-- Public bucket for company logos (white-label). Super-admin uploads a logo in
-- the web dashboard; its public URL is stored on companies.logo_url and shown on
-- the app's home hero. Public so the app can load it without auth; writes happen
-- only through the service role in the super-admin action.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos', 'company-logos', true, 2097152,
  array['image/png','image/jpeg','image/webp','image/svg+xml']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 2097152,
      allowed_mime_types = array['image/png','image/jpeg','image/webp','image/svg+xml'];
