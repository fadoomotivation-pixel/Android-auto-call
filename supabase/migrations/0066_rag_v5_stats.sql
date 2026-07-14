-- RAG v5 — a super-admin overview of every company's AI brain, aggregate-only
-- (no raw knowledge leaks across companies). Platform admins see all companies;
-- a company admin sees just their own row. SECURITY DEFINER so it can read the
-- knowledge tables for the counts, but it hard-scopes by the caller's role.
create or replace function public.rag_stats()
returns table (
  company_id   uuid,
  company_name text,
  chunks       bigint,
  brochures    bigint,
  prices       bigint,
  faqs         bigint,
  calls        bigint,
  notes        bigint,
  open_gaps    bigint,
  last_learned timestamptz
)
language sql stable security definer set search_path = public as $$
  select co.id, co.name,
    count(k.id),
    count(k.id) filter (where k.source_kind = 'brochure'),
    count(k.id) filter (where k.source_kind = 'price'),
    count(k.id) filter (where k.source_kind = 'faq'),
    count(k.id) filter (where k.source_kind = 'call'),
    count(k.id) filter (where k.source_kind = 'note'),
    (select count(*) from public.knowledge_gaps g where g.company_id = co.id and not g.resolved),
    max(k.created_at)
  from public.companies co
  left join public.knowledge_chunks k on k.company_id = co.id
  where
    exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
    or (co.id = public.current_company_id() and public.is_admin())
  group by co.id, co.name
  order by count(k.id) desc, co.name;
$$;

revoke all on function public.rag_stats() from public, anon;
grant execute on function public.rag_stats() to authenticated;
