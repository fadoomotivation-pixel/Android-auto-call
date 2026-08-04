-- Who has already been poked about what, and when.
--
-- The Remind button on /dashboard/today used to remember only for the life of
-- the page. Refresh, or open the dashboard on a phone instead of a laptop, and
-- every row looked untouched again — so the natural thing to do is press it a
-- second time. A rep who receives four pushes about one lead stops reading any
-- of them, which costs more than the missing reminder ever did.
--
-- notify-rep does not log its sends (it is fire-and-forget to FCM), so the
-- record has to live here. Deliberately a log rather than a flag on contacts:
-- "reminded twice this week" is a different conversation from "reminded once",
-- and a boolean cannot tell them apart.
create table if not exists public.rep_reminders (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  contact_id     uuid references public.contacts(id) on delete cascade,
  salesperson_id uuid references public.profiles(id) on delete set null,
  kind           text not null check (kind in ('escalation', 'site_visit', 'follow_up')),
  sent_by        uuid references auth.users(id) on delete set null,
  sent_at        timestamptz not null default now()
);

create index if not exists rep_reminders_contact on public.rep_reminders(contact_id, sent_at desc);
create index if not exists rep_reminders_company on public.rep_reminders(company_id, sent_at desc);

alter table public.rep_reminders enable row level security;

-- Managers only. A telecaller has no reason to read the log of who chased them,
-- and every reason to feel watched by it.
drop policy if exists rep_reminders_rw on public.rep_reminders;
create policy rep_reminders_rw on public.rep_reminders for all
  using ((company_id = public.current_company_id() and public.is_admin()) or public.is_super_admin())
  with check ((company_id = public.current_company_id() and public.is_admin()) or public.is_super_admin());
