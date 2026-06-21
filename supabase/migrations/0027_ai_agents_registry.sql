-- ============================================================
-- Telecaller AI Agents :: Core Registry
-- Tracks available agents and their executions
-- ============================================================

create table if not exists public.ai_agents_registry (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    is_active boolean not null default true,
    schedule text, -- e.g. "0 0 * * *"
    config jsonb default '{"monthly_cost_cap_usd": 50.00, "model": "claude-opus-4-8"}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- updated_at trigger
drop trigger if exists trg_ai_agents_updated on public.ai_agents_registry;
create trigger trg_ai_agents_updated before update on public.ai_agents_registry
  for each row execute function public.set_updated_at();

-- RLS
alter table public.ai_agents_registry enable row level security;
create policy ai_agents_read on public.ai_agents_registry
  for select to authenticated
  using (true); -- everyone can read registry

-- ============================================================
-- Agent Runs (Audit Log)
-- ============================================================
create table if not exists public.ai_agent_runs (
    id uuid primary key default gen_random_uuid(),
    agent_id uuid references public.ai_agents_registry(id) on delete cascade,
    company_id uuid references public.companies(id) on delete cascade,
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    status text check (status in ('running', 'success', 'failed')) default 'running',
    logs text,
    tokens_used integer default 0,
    cost_usd numeric default 0.0
);

-- RLS
alter table public.ai_agent_runs enable row level security;
create policy ai_agent_runs_read on public.ai_agent_runs
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin' and p.company_id = ai_agent_runs.company_id
    )
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );
