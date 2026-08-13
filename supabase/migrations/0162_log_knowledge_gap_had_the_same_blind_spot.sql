-- 0162 — log_knowledge_gap had the same blind spot as match_knowledge
--
-- Found while wiring the project-name fix. The same shape as 0160:
--
--     if not exists (select 1 from profiles pr
--                     where pr.id = auth.uid() and pr.company_id = p_company)
--     then return; end if;
--
-- SECURITY DEFINER, gated on auth.uid(), and therefore a silent no-op for every
-- caller using the service-role client — it does not error, it just returns and
-- the gap is never recorded. "The brain didn't know this" is exactly the signal
-- a founder needs to keep the brain useful, and it has been going in the bin
-- whenever a server-side caller reported one.
--
-- Same reasoning as 0160 for why allowing a null uid is safe: only authenticated
-- and service_role hold EXECUTE (anon was already revoked in 0064 and is
-- revoked again here), so no uid means a trusted server caller that has already
-- resolved which company it is acting for, and p_company still scopes the write.
create or replace function public.log_knowledge_gap(p_company uuid, p_question text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_company is null then return; end if;
  -- A real end user must belong to the company. A server-side caller (no JWT,
  -- so no auth.uid()) has already established the company it is acting for.
  if auth.uid() is not null
     and not exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.company_id = p_company)
     and not exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  then
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
