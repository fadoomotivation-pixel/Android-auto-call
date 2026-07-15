-- White-label branding per company. The company NAME already exists, so
-- name-branding works immediately; these add an optional brand colour + logo
-- so each company's app can feel like their own dedicated application.
alter table public.companies
  add column if not exists brand_color text,   -- hex like #0E7C66 (optional)
  add column if not exists logo_url    text;   -- public URL to the company logo (optional)

-- Everyone in a company may READ their own company's branding (the app needs it
-- to render). Writes stay with admins / platform admins via existing policies.
-- companies already has RLS; branding columns ride the existing SELECT policy.
