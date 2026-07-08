-- Sales X-Ray — AI pattern analysis across ALL call conversations at once.
-- A human can listen to one voice note; nobody can hold 100 in their head.
-- The X-Ray reads every conversation from the last 30 days and tells the owner:
--   • deal-killer objections, ranked, with real quotes and a counter for each
--   • what buyers are actually asking for (demand map: BHK / location / budget)
--   • what the winning calls had in common
--   • which "dead" leads are actually recoverable — with an opening line each
-- Reports are stored so the dashboard opens instantly; a weekly cron refreshes
-- them every Monday morning, and admins can regenerate on demand.

create table if not exists public.sales_xray (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  days        int  not null default 30,
  report      jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_sales_xray_company on public.sales_xray(company_id, created_at desc);

alter table public.sales_xray enable row level security;

-- Company admins read their own company's reports; platform admins read all.
create policy "sales_xray_select" on public.sales_xray
  for select to authenticated
  using (
    (company_id = public.current_company_id() and public.is_admin())
    or exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid())
  );

-- Weekly refresh: Monday 09:00 IST (03:30 UTC) for every company with activity.
create or replace function public.call_sales_xray()
returns void language plpgsql security definer set search_path = public, vault, net as $$
begin
  perform net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/sales-xray',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce((select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'), '')
    ),
    body := jsonb_build_object('all_companies', true)
  );
end $$;

do $$ begin perform cron.unschedule('sales-xray-weekly'); exception when others then null; end $$;
select cron.schedule('sales-xray-weekly', '30 3 * * 1', $$select public.call_sales_xray()$$);
