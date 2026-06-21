-- ============================================================
-- Telecaller AI Agents :: Outputs
-- ============================================================

-- AI Insights (Business Analyst)
create table if not exists public.ai_insights (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    date date not null,
    metrics jsonb default '{}'::jsonb,
    anomalies jsonb default '{}'::jsonb,
    top_problems text[],
    top_opportunities text[],
    narrative_digest text,
    created_at timestamptz not null default now(),
    unique (company_id, date)
);

alter table public.ai_insights enable row level security;
create policy ai_insights_read on public.ai_insights
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin' and p.company_id = ai_insights.company_id
    )
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

-- AI Tasks (Sales Head)
create table if not exists public.ai_tasks (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    assignee_id uuid references public.profiles(id) on delete cascade,
    contact_id uuid references public.contacts(id) on delete set null,
    agent_source uuid references public.ai_agents_registry(id) on delete set null,
    title text not null,
    description text,
    priority text check (priority in ('high', 'medium', 'low')) default 'medium',
    status text check (status in ('pending', 'in_progress', 'done', 'cancelled')) default 'pending',
    due_date timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists trg_ai_tasks_updated on public.ai_tasks;
create trigger trg_ai_tasks_updated before update on public.ai_tasks
  for each row execute function public.set_updated_at();

alter table public.ai_tasks enable row level security;
create policy ai_tasks_read on public.ai_tasks
  for select to authenticated
  using (
    -- reps can read their own tasks
    (assignee_id = auth.uid())
    or 
    -- admins can read all tasks for their company
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin' and p.company_id = ai_tasks.company_id
    )
  );
create policy ai_tasks_update on public.ai_tasks
  for update to authenticated
  using (
    (assignee_id = auth.uid())
    or 
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin' and p.company_id = ai_tasks.company_id
    )
  );

-- Call Reviews (Call Quality Agent)
create table if not exists public.call_reviews (
    id uuid primary key default gen_random_uuid(),
    call_id uuid not null references public.call_logs(id) on delete cascade,
    agent_id uuid not null references public.profiles(id) on delete cascade,
    transcript text,
    language text,
    score_greeting integer,
    score_discovery integer,
    score_objection integer,
    score_compliance integer,
    score_closing integer,
    total_score integer,
    feedback text,
    flags text[],
    objections text[],
    reviewed_at timestamptz not null default now(),
    unique(call_id)
);

alter table public.call_reviews enable row level security;
create policy call_reviews_read on public.call_reviews
  for select to authenticated
  using (
    -- reps can read their own reviews
    (agent_id = auth.uid())
    or
    -- admins can read all reviews for their company
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin' and p.company_id = (select company_id from public.call_logs cl where cl.id = call_reviews.call_id)
    )
  );


-- ============================================================
-- Customer-Facing Message Drafts (Follow-up / SDR Agent)
-- ============================================================
create table if not exists public.ai_message_drafts (
    id uuid primary key default gen_random_uuid(),
    company_id uuid not null references public.companies(id) on delete cascade,
    contact_id uuid not null references public.contacts(id) on delete cascade,
    agent_source uuid references public.ai_agents_registry(id) on delete set null,
    message_content text not null,
    channel text check (channel in ('whatsapp', 'sms', 'email')) default 'whatsapp',
    approved boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

drop trigger if exists trg_ai_message_drafts_updated on public.ai_message_drafts;
create trigger trg_ai_message_drafts_updated before update on public.ai_message_drafts
  for each row execute function public.set_updated_at();

alter table public.ai_message_drafts enable row level security;
create policy ai_message_drafts_read on public.ai_message_drafts
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin' and p.company_id = ai_message_drafts.company_id
    )
  );
create policy ai_message_drafts_update on public.ai_message_drafts
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin' and p.company_id = ai_message_drafts.company_id
    )
  );
