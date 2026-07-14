-- RAG v4 isolation — lock EVERY write path to the caller's own company.
-- knowledge_chunks had only a SELECT policy, so (a) the admin "Remove" button
-- was silently denied by RLS, and (b) there was no explicit delete boundary.
-- These policies let an admin delete ONLY their own company's rows (platform
-- admins any) — fixing the button and making the isolation wall explicit on
-- the write side too. (Inserts happen only via service-role edge functions,
-- which set company_id from the caller's profile; there is no client insert
-- policy, so a client can never write into another company's brain.)
drop policy if exists knowledge_delete on public.knowledge_chunks;
create policy knowledge_delete on public.knowledge_chunks for delete to authenticated
  using (
    (company_id = public.current_company_id() and public.is_admin())
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

drop policy if exists knowledge_gaps_delete on public.knowledge_gaps;
create policy knowledge_gaps_delete on public.knowledge_gaps for delete to authenticated
  using (
    (company_id = public.current_company_id() and public.is_admin())
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );
