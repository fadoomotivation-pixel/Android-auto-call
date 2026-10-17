-- A builder can start from Google, and can start with something to call.
--
-- Sign-up on callproai.in now offers "Continue with Google" next to email +
-- password. An email sign-up already creates the company inside
-- handle_new_user() from the metadata the form sends (role + company_name).
-- A Google sign-up cannot send that metadata, so the user arrives with a
-- profile and no company. They then type the company name on
-- /signup/company, which calls create_my_company() below.
--
-- The sign-up form also has an optional "Load demo leads" switch. Ten
-- made-up leads are added to the new company, assigned to the builder, so
-- the app has something to show on the first day.
--
-- SAFETY
--   · create_my_company only acts when the caller has NO company yet. Someone
--     already in a company (telecaller or admin) gets an error, so it can never
--     move a person between companies or promote a telecaller inside one.
--   · load_demo_leads only writes to the caller's own company, only for an
--     admin, and only once (it checks extra->>'demo_seed').
--   · Demo numbers are +91 555xxxxxxx, not a mobile series, so a tap on Call
--     can never ring a real person (same rule as the demo company in 0222).
--   · Nothing here touches handle_new_user() or any existing trigger.
--
-- Apply by hand in the Supabase SQL editor. Idempotent.

create or replace function public.load_demo_leads()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  my_company uuid;
  my_role public.user_role;
  added integer := 0;
begin
  if me is null then
    raise exception 'Please sign in first.' using errcode = '42501';
  end if;

  select company_id, role into my_company, my_role from public.profiles where id = me;
  if my_company is null or my_role <> 'admin' then
    raise exception 'Only a company admin can load demo leads.' using errcode = '42501';
  end if;

  if exists (select 1 from public.contacts
              where company_id = my_company and extra->>'demo_seed' = 'true') then
    return 0;
  end if;

  insert into public.contacts (company_id, salesperson_id, name, phone, notes, lead_source, extra)
  select my_company, me, d.name, d.phone,
         'Demo lead. Safe to delete. This number cannot ring a real phone.',
         'demo', jsonb_build_object('demo_seed', 'true')
    from (values
      ('Rakesh Sharma (demo)', '+915550000101'),
      ('Priya Verma (demo)',   '+915550000102'),
      ('Amit Gupta (demo)',    '+915550000103'),
      ('Sunita Yadav (demo)',  '+915550000104'),
      ('Manoj Singh (demo)',   '+915550000105'),
      ('Neha Agarwal (demo)',  '+915550000106'),
      ('Vikas Chauhan (demo)', '+915550000107'),
      ('Pooja Mishra (demo)',  '+915550000108'),
      ('Deepak Jain (demo)',   '+915550000109'),
      ('Kavita Rawat (demo)',  '+915550000110')
    ) as d(name, phone);

  get diagnostics added = row_count;
  return added;
end $$;

revoke all on function public.load_demo_leads() from public;
grant execute on function public.load_demo_leads() to authenticated;

create or replace function public.create_my_company(
  p_company_name text,
  p_full_name text default null,
  p_load_demo boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  me uuid := auth.uid();
  existing uuid;
  new_company uuid;
begin
  if me is null then
    raise exception 'Please sign in first.' using errcode = '42501';
  end if;
  if coalesce(trim(p_company_name), '') = '' then
    raise exception 'Please enter your company name.';
  end if;

  select company_id into existing from public.profiles where id = me;
  if existing is not null then
    raise exception 'You are already in a company.' using errcode = '42501';
  end if;

  insert into public.companies (name, owner_id)
  values (trim(p_company_name), me)
  returning id into new_company;

  insert into public.profiles (id, full_name, role, company_id)
  values (me, coalesce(nullif(trim(p_full_name), ''), ''), 'admin', new_company)
  on conflict (id) do update
     set company_id = excluded.company_id,
         role = 'admin',
         full_name = case when coalesce(public.profiles.full_name, '') = ''
                          then excluded.full_name else public.profiles.full_name end
   where public.profiles.company_id is null;

  if p_load_demo then
    perform public.load_demo_leads();
  end if;

  return new_company;
end $$;

revoke all on function public.create_my_company(text, text, boolean) from public;
grant execute on function public.create_my_company(text, text, boolean) to authenticated;
