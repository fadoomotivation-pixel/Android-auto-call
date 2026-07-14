-- Harden RAG retrieval: match_knowledge is SECURITY DEFINER (it bypasses RLS),
-- so it MUST verify the caller actually belongs to p_company — otherwise any
-- authenticated user could pass another company's id and read its knowledge.
-- This is the wall that keeps company A's coach from ever seeing company B's
-- data even if someone calls the RPC directly.
create or replace function public.match_knowledge(
  p_company    uuid,
  p_embedding  extensions.vector(384),
  p_match_count int default 5,
  p_min_similarity float default 0.30
) returns table (id uuid, title text, content text, source_kind text, similarity float)
language sql stable security definer set search_path = public, extensions as $$
  select k.id, k.title, k.content, k.source_kind,
         1 - (k.embedding <=> p_embedding) as similarity
  from public.knowledge_chunks k
  where k.company_id = p_company
    and (
      exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.company_id = p_company)
      or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
    )
    and k.embedding is not null
    and 1 - (k.embedding <=> p_embedding) >= p_min_similarity
  order by k.embedding <=> p_embedding
  limit greatest(1, least(p_match_count, 20));
$$;
