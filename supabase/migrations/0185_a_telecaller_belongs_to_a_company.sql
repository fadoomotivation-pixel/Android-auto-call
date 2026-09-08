-- Only people who actually work for one of our companies are telecallers.
--
-- WHAT WENT WRONG
--
-- This Supabase project is shared with another product (capitalbrix.co.in).
-- Every signup anywhere on the project runs the same handle_new_user trigger,
-- which writes a profiles row with role 'salesperson' and company_id null. So
-- that site's staff signing up became, as far as Call Pro AI could tell,
-- telecallers.
--
-- By the time it was noticed there were 37 of them against 13 real telecallers:
-- the "Telecallers (all companies)" page was three-quarters strangers, and they
-- were reaching the lead-assignment dropdown too.
--
-- WHY THE FIX IS A WHERE CLAUSE AND NOT A DELETE
--
-- Those auth users belong to the other product and are legitimately its. Call
-- Pro AI has no business deleting them; it simply must not claim them. A
-- profile with no company is a member of no company, and company isolation
-- already says such a row can never be assigned work — a lead owned by one
-- company and worked by someone outside every company is exactly the state the
-- rule exists to prevent. So the view stops emitting them, and the admin pages
-- that build rep lists filter the same way.
--
-- This also silently fixes the reverse hazard: a real telecaller whose company
-- link is broken disappears from pickers rather than being assignable into
-- limbo, which is the safe direction to fail in.
--
-- LONGER TERM: the two products should not share a Postgres. This makes the
-- symptom go away, not the cause.

create or replace view public.v_telecaller_overview as
  select p.id as salesperson_id,
         p.full_name,
         p.is_active,
         c.id as company_id,
         c.name as company_name,
         (select count(*) from public.campaigns ca where ca.salesperson_id = p.id) as campaigns,
         (select count(*) from public.call_logs cl where cl.salesperson_id = p.id) as calls,
         (select count(*) from public.call_logs cl
           where cl.salesperson_id = p.id and cl.outcome = 'connected'::call_outcome) as connected,
         (select max(cl.created_at) from public.call_logs cl where cl.salesperson_id = p.id) as last_call_at,
         (select ca.name from public.campaigns ca
           where ca.salesperson_id = p.id order by ca.created_at desc limit 1) as latest_campaign
    from public.profiles p
    -- INNER, not LEFT. The join is now what enforces the rule: no company row,
    -- no telecaller. Left as a LEFT JOIN this view would keep emitting the
    -- orphans with a null company name, which is how they got here.
    join public.companies c on c.id = p.company_id
   where p.role = 'salesperson'::user_role;
