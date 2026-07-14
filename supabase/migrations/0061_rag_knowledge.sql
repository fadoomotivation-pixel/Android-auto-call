-- RAG v1 — a per-company knowledge base the AI coach can retrieve from.
-- Chunks of the company's real material (brochures, price lists, FAQs, winning
-- call transcripts, admin notes) are embedded with Supabase Edge's built-in
-- gte-small model (384-dim, free — no external embedding API) and matched by
-- cosine similarity so the coach answers from the company's OWN facts instead
-- of guessing.

create extension if not exists vector with schema extensions;

create table if not exists public.knowledge_chunks (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  -- Where this chunk came from, so we can re-ingest / delete a source cleanly.
  source_kind text not null default 'note',       -- 'brochure' | 'price' | 'faq' | 'call' | 'note'
  source_id   text,                               -- e.g. a content_assets.id or call_logs.id
  title       text,
  content     text not null,
  embedding   extensions.vector(384),
  created_at  timestamptz not null default now()
);

create index if not exists idx_knowledge_company on public.knowledge_chunks(company_id, source_kind);
-- IVFFlat cosine index for fast top-k retrieval as the base grows.
create index if not exists idx_knowledge_embedding on public.knowledge_chunks
  using ivfflat (embedding extensions.vector_cosine_ops) with (lists = 100);

alter table public.knowledge_chunks enable row level security;

-- The whole company can read its knowledge (the coach runs as the rep); only
-- admins / super admins curate it (writes go through the service role anyway).
drop policy if exists knowledge_select on public.knowledge_chunks;
create policy knowledge_select on public.knowledge_chunks for select to authenticated
  using (company_id = public.current_company_id());

-- Cosine-similarity retrieval, scoped to one company. Returns the closest
-- chunks above a similarity floor (SECURITY DEFINER so the service role in the
-- edge function can match without exposing the table to writes).
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
    and k.embedding is not null
    and 1 - (k.embedding <=> p_embedding) >= p_min_similarity
  order by k.embedding <=> p_embedding
  limit greatest(1, least(p_match_count, 20));
$$;

revoke all on function public.match_knowledge(uuid, extensions.vector, int, float) from public, anon;
grant execute on function public.match_knowledge(uuid, extensions.vector, int, float) to authenticated, service_role;
