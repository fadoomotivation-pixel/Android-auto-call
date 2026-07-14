-- RAG v7 — a two-layer brain.
--
--  1) GLOBAL layer  (company_id IS NULL): a shared, general real-estate brain the
--     platform super-admin trains once (a book / article / best-practice guide).
--     Every company can READ it, so even a brand-new company starts smart.
--  2) COMPANY layer (company_id = <id>): each company's own private material —
--     price sheets, brochures, offers. Strictly isolated: company A can never read
--     company B's rows.
--
-- Only a platform super-admin may WRITE the global layer (enforced in the
-- knowledge-ingest edge function via the service role; there is no client insert
-- policy). Reads stay guarded here + in match_knowledge so isolation holds.

-- Global rows have no company, so the column must allow NULL.
alter table public.knowledge_chunks alter column company_id drop not null;

-- SELECT: your own company's rows, the shared global rows, or anything if you're
-- a platform admin. Company A still can't see Company B's private rows.
drop policy if exists knowledge_select on public.knowledge_chunks;
create policy knowledge_select on public.knowledge_chunks
  for select using (
    company_id is null
    or company_id = public.current_company_id()
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

-- DELETE: a company admin may prune their own rows; a platform admin may prune
-- anything (including the global layer).
drop policy if exists knowledge_delete on public.knowledge_chunks;
create policy knowledge_delete on public.knowledge_chunks
  for delete using (
    (company_id = public.current_company_id() and public.is_admin())
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

-- Retrieval blends the company's own chunks with the shared global brain, while
-- keeping the company rows ownership-guarded (the v4 cross-company fix stays).
create or replace function public.match_knowledge(
  p_company uuid,
  p_embedding vector,
  p_match_count integer default 5,
  p_min_similarity double precision default 0.30
)
returns table (id uuid, title text, content text, source_kind text, similarity double precision)
language sql stable security definer set search_path = public, extensions as $$
  select k.id, k.title, k.content, k.source_kind,
         1 - (k.embedding <=> p_embedding) as similarity
  from public.knowledge_chunks k
  where k.embedding is not null
    and (
      k.company_id is null   -- shared global brain
      or (
        k.company_id = p_company
        and (
          exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.company_id = p_company)
          or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
        )
      )
    )
    and 1 - (k.embedding <=> p_embedding) >= p_min_similarity
  order by k.embedding <=> p_embedding
  limit greatest(1, least(p_match_count, 20));
$$;
