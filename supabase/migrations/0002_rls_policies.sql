-- ============================================================
-- Helper functions (SECURITY DEFINER to avoid RLS recursion)
-- ============================================================
create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ============================================================
-- New-user trigger: create a profile row on signup.
-- role + full_name + phone come from auth metadata if provided.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'salesperson')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Enable RLS
-- ============================================================
alter table public.companies      enable row level security;
alter table public.profiles       enable row level security;
alter table public.import_batches enable row level security;
alter table public.contacts       enable row level security;
alter table public.call_logs      enable row level security;

-- ---------- companies ----------
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (id = public.current_company_id() or owner_id = auth.uid());

drop policy if exists companies_insert on public.companies;
create policy companies_insert on public.companies for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists companies_update on public.companies;
create policy companies_update on public.companies for update to authenticated
  using (id = public.current_company_id() and public.is_admin())
  with check (id = public.current_company_id() and public.is_admin());

-- ---------- profiles ----------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (company_id = public.current_company_id() and public.is_admin())
  );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or (company_id = public.current_company_id() and public.is_admin()))
  with check (id = auth.uid() or (company_id = public.current_company_id() and public.is_admin()));

-- ---------- import_batches ----------
drop policy if exists batches_select on public.import_batches;
create policy batches_select on public.import_batches for select to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()));

drop policy if exists batches_insert on public.import_batches;
create policy batches_insert on public.import_batches for insert to authenticated
  with check (company_id = public.current_company_id());

drop policy if exists batches_update on public.import_batches;
create policy batches_update on public.import_batches for update to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()));

-- ---------- contacts ----------
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts for select to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()));

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts for insert to authenticated
  with check (company_id = public.current_company_id());

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts for update to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()))
  with check (company_id = public.current_company_id());

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts for delete to authenticated
  using (company_id = public.current_company_id() and public.is_admin());

-- ---------- call_logs ----------
drop policy if exists calllogs_select on public.call_logs;
create policy calllogs_select on public.call_logs for select to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()));

drop policy if exists calllogs_insert on public.call_logs;
create policy calllogs_insert on public.call_logs for insert to authenticated
  with check (company_id = public.current_company_id() and salesperson_id = auth.uid());

drop policy if exists calllogs_update on public.call_logs;
create policy calllogs_update on public.call_logs for update to authenticated
  using (company_id = public.current_company_id()
         and (public.is_admin() or salesperson_id = auth.uid()));
