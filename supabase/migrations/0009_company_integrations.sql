-- Per-client uroperator integration (token is super-admin-only; edge fn reads via service role).
create table if not exists public.company_integrations (
  company_id        uuid primary key references public.companies(id) on delete cascade,
  uro_token         text,
  uro_tenant_id     text,
  default_caller_id text,
  updated_at        timestamptz not null default now()
);
alter table public.company_integrations enable row level security;
drop policy if exists ci_super on public.company_integrations;
create policy ci_super on public.company_integrations for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());
