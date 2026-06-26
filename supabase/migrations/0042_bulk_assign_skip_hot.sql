-- ============================================================
-- Bulk-assignment push: don't double-notify hot leads
--   A hot lead already triggers its own "🔥 new hot lead" push
--   (migration 0040). Without this, a freshly-assigned hot lead also
--   counted toward the "N new leads assigned" push — so the rep got two
--   notifications for the same lead. Exclude hot leads from the bulk-
--   assignment count; the hot-lead trigger covers them.
-- ============================================================

create or replace function public.notify_bulk_assign_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.send_assignment_push(salesperson_id, count(*)::int)
  from new_rows
  where salesperson_id is not null
    and coalesce(temperature, '') <> 'hot'
  group by salesperson_id;
  return null;
end $$;

create or replace function public.notify_bulk_assign_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.send_assignment_push(n.salesperson_id, count(*)::int)
  from new_rows n
  join old_rows o on o.id = n.id
  where n.salesperson_id is not null
    and coalesce(n.temperature, '') <> 'hot'
    and o.salesperson_id is distinct from n.salesperson_id
  group by n.salesperson_id;
  return null;
end $$;
