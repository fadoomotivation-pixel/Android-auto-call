-- Count what the privacy gate dropped, so "0" stops being a mystery.
--
-- A rep shows Connected, the worker is delivering batches every few seconds,
-- and the card reads 0 / 0 / 0 / 0. Two completely different situations produce
-- that, and nothing on screen could tell them apart:
--
--   the rep barely uses WhatsApp                    → 0 is the honest answer
--   the rep is on WhatsApp all day with non-leads   → 0 is hiding a real finding
--
-- The second one matters commercially: a telecaller having 400 conversations a
-- day, none of them with a number in the CRM, is either working off the books or
-- the CRM's phone numbers are wrong. Either way the founder needs to know, and
-- until now the product could not say it.
--
-- WHAT THIS DELIBERATELY DOES NOT STORE
--
-- No numbers, no names, no text — a COUNT and nothing else. Storing who a rep
-- talks to outside the lead list would be exactly the surveillance this feature
-- has promised reps it does not do, and the promise is printed on the admin
-- card. A count answers "is the watcher working, and is this rep using
-- WhatsApp?" without answering "who does she talk to", which is none of the
-- company's business.
--
-- Distinct peers are deliberately NOT counted either: that would need per-peer
-- identity kept somewhere, and a hash of a ten-digit number is not anonymous.

create table if not exists public.wa_rep_activity_daily (
  company_id      uuid not null references public.companies(id) on delete cascade,
  salesperson_id  uuid not null references public.profiles(id) on delete cascade,
  day_ist         date not null,
  -- Seen by the watcher and dropped because the other party is not a lead of
  -- this company.
  unmatched       bigint not null default 0,
  -- Seen and kept. Mirrors what v_rep_whatsapp_daily counts, so the two can be
  -- compared without joining across a view.
  matched         bigint not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (company_id, salesperson_id, day_ist)
);

alter table public.wa_rep_activity_daily enable row level security;

drop policy if exists wa_activity_select on public.wa_rep_activity_daily;
create policy wa_activity_select on public.wa_rep_activity_daily
  for select using (
    public.is_super_admin()
    or (company_id = public.current_company_id()
        and (public.is_admin() or salesperson_id = auth.uid()))
  );

-- Written only by the ingest, on the service role. Called with the counts from
-- one batch; batches are frequent, so this adds rather than replaces.
create or replace function public.wa_bump_activity(
  p_company uuid,
  p_salesperson uuid,
  p_matched int,
  p_unmatched int
)
returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.wa_rep_activity_daily
    (company_id, salesperson_id, day_ist, matched, unmatched, updated_at)
  values (
    p_company, p_salesperson,
    (now() at time zone 'Asia/Kolkata')::date,
    greatest(p_matched, 0), greatest(p_unmatched, 0), now()
  )
  on conflict (company_id, salesperson_id, day_ist) do update
    set matched   = public.wa_rep_activity_daily.matched   + greatest(excluded.matched, 0),
        unmatched = public.wa_rep_activity_daily.unmatched + greatest(excluded.unmatched, 0),
        updated_at = now();
$$;

revoke execute on function public.wa_bump_activity(uuid, uuid, int, int) from public, anon, authenticated;

comment on table public.wa_rep_activity_daily is
  'How much WhatsApp the watcher saw, split by whether the other party was a '
  'lead. Counts only — never who, never what. Turns an unexplained 0 on the '
  'dashboard into either "this rep barely uses WhatsApp" or "this rep is very '
  'active with numbers that are not in your CRM".';
