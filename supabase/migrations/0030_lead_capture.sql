-- Generic inbound lead capture: any external source (website form, landing page,
-- Google form, etc.) POSTs to the lead-capture edge function with a per-company
-- token. Optionally fires a WhatsApp welcome template on new leads.

create table if not exists public.lead_capture_config (
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- unguessable token that identifies the company in the public webhook URL
  capture_token text not null unique
    default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  default_salesperson_id uuid references public.profiles(id) on delete set null,
  welcome_enabled boolean not null default false,
  welcome_template text,                       -- Meta-approved template name
  welcome_template_lang text not null default 'en',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.lead_capture_config enable row level security;
drop policy if exists lead_capture_rw on public.lead_capture_config;
create policy lead_capture_rw on public.lead_capture_config
  for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.company_id=lead_capture_config.company_id)
    or exists (select 1 from public.platform_admins pa where pa.user_id=auth.uid())
  )
  with check (
    exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.company_id=lead_capture_config.company_id)
    or exists (select 1 from public.platform_admins pa where pa.user_id=auth.uid())
  );
