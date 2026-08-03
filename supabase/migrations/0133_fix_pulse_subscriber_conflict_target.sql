-- The recipient form could not save: "no unique or exclusion constraint
-- matching the ON CONFLICT specification".
--
-- 0130 built the scope index over an EXPRESSION —
--   (company_id, phone, coalesce(salesperson_id, '000…'::uuid))
-- — to make two founder rows collide, since Postgres treats NULLs as distinct
-- by default and would otherwise allow the same founder number twice.
--
-- It works as a constraint and is useless as a conflict target: PostgREST
-- sends on_conflict=company_id,phone,salesperson_id, and Postgres will only
-- match that against an index on those columns literally. An expression index
-- is not the same thing, so every save failed.
--
-- Postgres 15 added UNIQUE NULLS NOT DISTINCT, which is the original intent
-- written properly: real columns, so the upsert can name them, and NULLs
-- compared as equal, so the founder row still cannot be added twice. This
-- database is on 17.
drop index if exists public.pulse_subscribers_company_phone_scope;

create unique index pulse_subscribers_company_phone_scope
  on public.pulse_subscribers (company_id, phone, salesperson_id)
  nulls not distinct;
