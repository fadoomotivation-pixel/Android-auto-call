-- Coach memory: every question a telecaller asks the floating AI Coach, with the
-- answer it gave. This is the rep's own growing "AI brain memory" — the manager
-- (and later, aggregate training) can see what reps struggle with, and the best
-- Q&A can be promoted into the shared knowledge brain.
--
-- Linked, not duplicated: answers are grounded in the SAME match_knowledge brain
-- (company + global guidebook + harvested wins) that assistant-chat / rag-ask /
-- rep-coach use. Nothing here re-implements retrieval.

create table if not exists public.coach_qa (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  salesperson_id uuid not null references public.profiles(id) on delete cascade,
  question       text not null,
  answer         text,
  -- Which lead the rep was working when they asked (optional context).
  contact_id     uuid references public.contacts(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists idx_coach_qa_rep on public.coach_qa(salesperson_id, created_at desc);
create index if not exists idx_coach_qa_company on public.coach_qa(company_id, created_at desc);

alter table public.coach_qa enable row level security;

-- A rep sees/writes their own; a company admin sees their whole team; the
-- platform super-admin sees everything. Same shape as coach_feedback (0091).
drop policy if exists coachqa_select on public.coach_qa;
create policy coachqa_select on public.coach_qa for select using (
  salesperson_id = auth.uid()
  or (company_id = public.current_company_id() and public.is_admin())
  or public.is_super_admin()
);

drop policy if exists coachqa_insert on public.coach_qa;
create policy coachqa_insert on public.coach_qa for insert with check (
  salesperson_id = auth.uid() and company_id = public.current_company_id()
);

-- The coach now also caches ONE daily "tip" per rep, reusing coach_briefs with a
-- new slot value. Widen the slot check to allow it.
alter table public.coach_briefs drop constraint if exists coach_briefs_slot_check;
alter table public.coach_briefs add constraint coach_briefs_slot_check
  check (slot in ('morning','evening','tip'));
