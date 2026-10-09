-- ── Finish ──
delete from public.lead_location_interest where company_id = 'de000000-0000-4000-8000-000000000001';

insert into public.demo_state (company_id, anchor_day)
values ('de000000-0000-4000-8000-000000000001', (now() at time zone 'Asia/Kolkata')::date)
on conflict (company_id) do update set anchor_day = excluded.anchor_day, seeded_at = now();

-- Stop here if the story did not come out as written (for example, a trigger
-- skipped leads as duplicates). Nothing is kept unless every number is right.
do $$
declare
  v_demo constant uuid := 'de000000-0000-4000-8000-000000000001';
  n_leads int; n_visits int; n_booked int; n_spend numeric; n_saved int; n_due int; n_over int;
begin
  select count(*) into n_leads from public.contacts where company_id = v_demo;
  select count(*) into n_visits from public.contacts where company_id = v_demo and site_visit_arrived_at is not null;
  select count(*) into n_booked from public.contacts where company_id = v_demo and stage in ('token_paid', 'won');
  select count(*) into n_saved from public.contacts where company_id = v_demo and extra ? 'demo_saved';
  select coalesce(sum(spend), 0) into n_spend from public.demo_ad_spend where company_id = v_demo;
  select count(*) into n_due from public.follow_ups where company_id = v_demo and status = 'pending'
     and (due_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date;
  select count(*) into n_over from public.follow_ups where company_id = v_demo and status = 'pending'
     and (due_at at time zone 'Asia/Kolkata')::date < (now() at time zone 'Asia/Kolkata')::date;
  if n_leads <> 600 or n_visits <> 45 or n_booked <> 5 or n_spend <> 100000 or n_saved <> 9
     or n_due < 10 or n_over < 3 then
    raise exception 'Demo seed check failed: leads %, visits %, bookings %, spend %, saved %, due today %, overdue %',
      n_leads, n_visits, n_booked, n_spend, n_saved, n_due, n_over;
  end if;
  raise notice 'Demo ready: % leads, % visits, % bookings, ₹% spend, % saved, % due today, % overdue',
    n_leads, n_visits, n_booked, n_spend, n_saved, n_due, n_over;
end $$;

