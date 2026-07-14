-- RAG v3 — active learning. When the coach has NO company knowledge to answer a
-- rep's question, we record the gap. The admin then sees exactly what their
-- team keeps asking that the AI can't answer, and fills it in one tap — so the
-- knowledge base grows toward real need instead of guesswork.
create table if not exists public.knowledge_gaps (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies(id) on delete cascade,
  question     text not null,
  norm         text not null,
  ask_count    int not null default 1,
  resolved     boolean not null default false,
  last_asked_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (company_id, norm)
);
create index if not exists idx_knowledge_gaps_company on public.knowledge_gaps(company_id, resolved, ask_count desc);

alter table public.knowledge_gaps enable row level security;

drop policy if exists knowledge_gaps_select on public.knowledge_gaps;
create policy knowledge_gaps_select on public.knowledge_gaps for select to authenticated
  using (
    (company_id = public.current_company_id() and public.is_admin())
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );
drop policy if exists knowledge_gaps_update on public.knowledge_gaps;
create policy knowledge_gaps_update on public.knowledge_gaps for update to authenticated
  using (
    (company_id = public.current_company_id() and public.is_admin())
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

create or replace function public.log_knowledge_gap(p_company uuid, p_question text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.company_id = p_company) then
    return;
  end if;
  if p_question is null or length(trim(p_question)) < 3 then return; end if;
  insert into public.knowledge_gaps (company_id, question, norm)
  values (p_company, left(trim(p_question), 300), lower(left(trim(p_question), 160)))
  on conflict (company_id, norm) do update
    set ask_count = public.knowledge_gaps.ask_count + 1,
        last_asked_at = now(),
        resolved = false,
        question = excluded.question;
end $$;

revoke all on function public.log_knowledge_gap(uuid, text) from public, anon;
grant execute on function public.log_knowledge_gap(uuid, text) to authenticated, service_role;
