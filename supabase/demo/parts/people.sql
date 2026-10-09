-- ── 3. The company, its projects and its three telecallers ──
insert into public.companies (id, name, is_demo, recording_enabled, record_all_calls, rep_review_off)
values ('de000000-0000-4000-8000-000000000001', 'Sunrise Infra (Demo data)', true, false, false, true)
on conflict (id) do update
  set name = excluded.name, is_demo = true, recording_enabled = false,
      record_all_calls = false, rep_review_off = true;

-- Neha signs in on the phone. Rahul and Pooja exist so the team, the
-- leaderboard and Pulse look like a team; their password is a random string
-- nobody kept, so nobody can sign in as them.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated',
   '@EMAIL@', '@PW_HASH@', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Neha Sharma (Demo)","role":"salesperson"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-0000000000a2', 'authenticated', 'authenticated',
   'demo.rahul@callproai.in', '@JUNK_HASH@', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Rahul Verma (Demo)","role":"salesperson"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'de000000-0000-4000-8000-0000000000a3', 'authenticated', 'authenticated',
   'demo.pooja@callproai.in', '@JUNK_HASH@', now(),
   '{"provider":"email","providers":["email"]}', '{"full_name":"Pooja Singh (Demo)","role":"salesperson"}',
   now(), now(), '', '', '', '')
on conflict (id) do update
  set encrypted_password = excluded.encrypted_password,
      email_confirmed_at = coalesce(auth.users.email_confirmed_at, now()),
      updated_at = now();

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  from auth.users u
 where u.id in ('de000000-0000-4000-8000-0000000000a1', 'de000000-0000-4000-8000-0000000000a2',
                'de000000-0000-4000-8000-0000000000a3')
   and not exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email');

insert into public.profiles (id, company_id, full_name, phone, role, is_active, speaks_as)
values
  ('de000000-0000-4000-8000-0000000000a1', 'de000000-0000-4000-8000-000000000001', 'Neha Sharma (Demo)', null, 'salesperson', true, 'f'),
  ('de000000-0000-4000-8000-0000000000a2', 'de000000-0000-4000-8000-000000000001', 'Rahul Verma (Demo)', null, 'salesperson', true, 'm'),
  ('de000000-0000-4000-8000-0000000000a3', 'de000000-0000-4000-8000-000000000001', 'Pooja Singh (Demo)', null, 'salesperson', true, 'f')
on conflict (id) do update
  set company_id = excluded.company_id, full_name = excluded.full_name, phone = null,
      role = excluded.role, is_active = true, speaks_as = excluded.speaks_as;

insert into public.company_projects (company_id, name, aliases, source) values
  ('de000000-0000-4000-8000-000000000001', 'Sunrise Greens', array['sunrise green', 'greens plots'], 'admin'),
  ('de000000-0000-4000-8000-000000000001', 'Sunrise Heights', array['sunrise height', 'heights flats'], 'admin'),
  ('de000000-0000-4000-8000-000000000001', 'Sunrise Farm Villas', array['farm villa', 'farmhouse'], 'admin');

