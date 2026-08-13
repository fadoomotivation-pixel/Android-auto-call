-- 0160 — The coach can finally read the company brain
--
-- "RAG bilkul dead jaisa feel hota hai." It was dead. Not slow, not vague —
-- blind.
--
-- match_knowledge is SECURITY DEFINER, and it gates the company's own chunks on
-- auth.uid():
--
--     or (
--       k.company_id = p_company
--       and ( exists (select 1 from profiles      where id = auth.uid() ...)
--          or exists (select 1 from platform_admins where user_id = auth.uid()) )
--     )
--
-- Every edge function that calls it with the SERVICE-ROLE client has no
-- auth.uid() at all. Both EXISTS clauses are false, so the whole company branch
-- is false, and the only rows that survive are `company_id is null` — the
-- fourteen chunks of the shared global guidebook.
--
-- Proven, not guessed: searching with a Fanbe price chunk's OWN embedding — a
-- perfect self-match — returned four global "Indian Real Estate CRM AI Coach"
-- rows and not the chunk itself.
--
-- Which functions were blind:
--
--     rep-coach   — the AI Coach. The floating brain, the two-way ask, the
--                   daily tip, the per-call coaching. The one a rep touches
--                   most.
--     ad-advisor
--
-- and which were fine, because they call with the rep's own JWT: rag-ask,
-- assistant-chat, focus-five, lead-brief, second-chance.
--
-- So every price sheet, project brain and harvested win the founder uploaded —
-- a hundred chunks across five companies — has never once been read by the
-- coach. It has been answering out of a generic guidebook and sounding like it.
-- coach_qa has zero rows in fourteen days; nobody asks a brain twice after it
-- fails them once.
--
-- THE FIX, and why it is safe.
--
-- Only service_role, authenticated and postgres hold EXECUTE on this function —
-- anon does not, and this migration revokes it from public/anon so that stays
-- true. Therefore a caller with no auth.uid() is a server-side caller, and a
-- server-side caller has already decided which company it is acting for before
-- it gets here. A caller WITH a uid is a real end user, and for them the
-- membership check applies exactly as before.
--
-- The one thing not done here: widening this to "any company_id" for the
-- service role. p_company is still honoured, so an edge function still cannot
-- read a company it was not invoked for.
create or replace function public.match_knowledge(
  p_company uuid,
  p_embedding vector,
  p_match_count integer default 5,
  p_min_similarity double precision default 0.30
)
returns table(id uuid, title text, content text, source_kind text, similarity double precision)
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  select k.id, k.title, k.content, k.source_kind,
         1 - (k.embedding <=> p_embedding) as similarity
  from public.knowledge_chunks k
  where k.embedding is not null
    and (
      k.company_id is null   -- shared global brain
      or (
        k.company_id = p_company
        and (
          -- Server-side caller (service_role). Only trusted roles can execute
          -- this without a JWT, and such a caller has already resolved which
          -- company it is acting for — p_company still scopes the read.
          auth.uid() is null
          or exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.company_id = p_company)
          or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
        )
      )
    )
    and 1 - (k.embedding <=> p_embedding) >= p_min_similarity
  order by k.embedding <=> p_embedding
  limit greatest(1, least(p_match_count, 20));
$function$;

-- The safety this fix leans on, made explicit rather than assumed.
revoke all on function public.match_knowledge(uuid, vector, integer, double precision) from public;
revoke all on function public.match_knowledge(uuid, vector, integer, double precision) from anon;
grant execute on function public.match_knowledge(uuid, vector, integer, double precision) to authenticated;
grant execute on function public.match_knowledge(uuid, vector, integer, double precision) to service_role;
