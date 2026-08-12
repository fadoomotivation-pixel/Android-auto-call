-- 0159 — A rep can see WHO to hand a lead to
--
-- reassign_contacts() (0158) already lets a telecaller give their own leads to a
-- colleague. The app cannot offer that, because a rep cannot read a single
-- teammate's name: profiles_select is
--
--     (id = auth.uid()) OR (company_id = current_company_id() AND is_admin())
--
-- so for a salesperson the list is exactly themselves. A picker with one name in
-- it, and that name their own.
--
-- The narrowest possible opening: id and display name, salespeople only, the
-- caller's own company only, the caller themselves excluded. No phone, no email,
-- no role, no company id. Enough to draw the list and nothing that could not
-- already be read off the office wall.
--
-- Widening profiles_select instead would have been the easy version and the
-- wrong one — it would hand every rep every colleague's phone number and email
-- for the sake of a dropdown.
create or replace function public.my_teammates()
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.id, coalesce(p.full_name, 'Telecaller') as full_name
    from public.profiles p
   where p.company_id = public.current_company_id()
     and p.company_id is not null
     and p.role = 'salesperson'
     and p.id <> auth.uid()
   order by 2;
$function$;

revoke all on function public.my_teammates() from public;
grant execute on function public.my_teammates() to authenticated;
