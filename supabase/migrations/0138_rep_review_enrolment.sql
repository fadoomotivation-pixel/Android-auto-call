-- Who receives the daily review — decided by the org chart, not by a list.
--
-- The Daily Pulse works off pulse_subscribers: somebody types a label and a
-- phone number, and that person gets a report. It is the right model for a
-- founder, who is one person per company and may not even have a login. It is
-- the wrong model for telecallers, and the numbers say so — nine telecallers
-- across six companies, and exactly TWO subscriber rows. The other seven get
-- nothing, not because anyone decided that, but because nobody remembered to
-- add them. A feature that requires an admin to remember is a feature most
-- companies never switch on.
--
-- So enrolment here is derived: every active telecaller with a phone number is
-- in, automatically, in every company, the moment they are created. Nothing to
-- add, nothing to forget, and a new hire is covered on their first day.
--
-- Two switches guard it, and they answer two different questions.
--
--   platform_automation.rep_review_on — "is this product feature live?"
--     One row, super admin only. Off by default, deliberately: this ships into
--     six live companies whose reps have never received a message from us, and
--     the first one must be sent on purpose rather than by deploying.
--
--   companies.rep_review_off — "does THIS company want it?"
--     Per company, so a client whose manager runs their floor differently can
--     silence it without the platform turning it off for everyone else. The
--     platform sends to their staff; they get a veto over that.

-- ---------- the platform switch ----------
create table if not exists public.platform_automation (
  -- One row, forever. The check is the cheapest way to say that in SQL.
  id             boolean primary key default true check (id),
  rep_review_on  boolean not null default false,
  rep_weekly_on  boolean not null default false,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles(id) on delete set null
);

insert into public.platform_automation (id) values (true) on conflict do nothing;

alter table public.platform_automation enable row level security;

-- Readable by any admin, because the Automation Center shows the switch to
-- whoever opens it. Writable only by the platform owner: a company admin
-- silencing themselves uses companies.rep_review_off, not this.
drop policy if exists platform_automation_read on public.platform_automation;
create policy platform_automation_read on public.platform_automation
  for select using (is_admin() or is_super_admin());

drop policy if exists platform_automation_write on public.platform_automation;
create policy platform_automation_write on public.platform_automation
  for update using (is_super_admin()) with check (is_super_admin());

-- ---------- the per-company veto and the hour ----------
alter table public.companies
  add column if not exists rep_review_off boolean not null default false,
  -- 7pm IST. Late enough that the day is done, early enough that it is not
  -- read at bedtime and forgotten by morning.
  add column if not exists rep_review_hour_ist int not null default 19
    check (rep_review_hour_ist between 0 and 23);

comment on column public.companies.rep_review_off is
  'Set by the company''s own admin to stop the platform sending daily reviews to their telecallers.';

-- ---------- a phone number is the whole prerequisite ----------
comment on column public.profiles.phone is
  'The telecaller''s WhatsApp number. Without it they cannot be enrolled in the daily review — '
  'which is why the Salespeople page asks for it when a telecaller is created.';

-- ---------- who is in, right now ----------
create or replace view public.v_rep_review_recipients as
  select
    p.id            as salesperson_id,
    p.company_id,
    p.full_name,
    p.phone,
    c.name          as company_name,
    c.rep_review_hour_ist,
    -- Every reason a rep might not be receiving it, as data rather than as an
    -- absent row. The Automation Center shows "7 telecallers, 1 enrolled, 6
    -- missing a phone number" — which is a fixable sentence. A view that
    -- silently returned one row would just look like the feature working.
    (coalesce(p.phone, '') <> '')                                as has_phone,
    (not c.rep_review_off)                                       as company_on,
    (select a.rep_review_on from public.platform_automation a)   as platform_on,
    (
      coalesce(p.phone, '') <> ''
      and not c.rep_review_off
      and (select a.rep_review_on from public.platform_automation a)
    )                                                            as enrolled
  from public.profiles p
  join public.companies c on c.id = p.company_id
  where p.role = 'salesperson'
    and coalesce(p.is_active, true);

alter view public.v_rep_review_recipients set (security_invoker = on);

comment on view public.v_rep_review_recipients is
  'Every telecaller and whether the daily review reaches them, with the reason when it does not. '
  'Derived from the org chart — there is no subscriber list to maintain.';
