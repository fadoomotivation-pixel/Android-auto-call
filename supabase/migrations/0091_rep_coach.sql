-- AI Coach for telecallers — shared data layer.
--
-- The floating in-app coach analyses the rep's own work. Its outputs live in
-- shared tables so the OTHER AI features read them instead of re-deriving:
--   · coach_feedback  — per-call "what went well / what to improve", generated
--     ONCE per call (>= 30s only; short calls are fake/no-signal and coaching
--     every tiny call would frustrate reps). manager-digest / sales-xray can
--     join on call_id for a coaching-aware view, and the accumulated rows are
--     the training corpus that keeps making Call Pro AI's coaching sharper.
--   · coach_briefs    — the 10 AM "kal kaisa tha" and 6 PM "aaj kya acha" brief,
--     one row per rep/date/slot so the LLM runs once, not per open.

create table if not exists public.coach_feedback (
  call_id        uuid primary key references public.call_logs(id) on delete cascade,
  salesperson_id uuid not null references public.profiles(id) on delete cascade,
  company_id     uuid not null references public.companies(id) on delete cascade,
  good           text,
  improve        text,
  created_at     timestamptz not null default now()
);
create index if not exists coach_feedback_rep_idx on public.coach_feedback (salesperson_id, created_at desc);
create index if not exists coach_feedback_company_idx on public.coach_feedback (company_id);

create table if not exists public.coach_briefs (
  salesperson_id uuid not null references public.profiles(id) on delete cascade,
  brief_date     date not null,
  slot           text not null check (slot in ('morning','evening')),
  company_id     uuid not null references public.companies(id) on delete cascade,
  content        text not null,
  created_at     timestamptz not null default now(),
  primary key (salesperson_id, brief_date, slot)
);
create index if not exists coach_briefs_company_idx on public.coach_briefs (company_id);

alter table public.coach_feedback enable row level security;
alter table public.coach_briefs enable row level security;

-- Rep sees own; a company admin sees their company; the super admin sees all.
drop policy if exists coach_feedback_read on public.coach_feedback;
create policy coach_feedback_read on public.coach_feedback
  for select to authenticated
  using (
    salesperson_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.company_id = coach_feedback.company_id)
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

drop policy if exists coach_briefs_read on public.coach_briefs;
create policy coach_briefs_read on public.coach_briefs
  for select to authenticated
  using (
    salesperson_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and p.company_id = coach_briefs.company_id)
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );
