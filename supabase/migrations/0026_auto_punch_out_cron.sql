-- ============================================================
-- Auto-close shifts at midnight IST (18:30 UTC)
-- ============================================================

-- Ensure the pg_cron extension is enabled
create extension if not exists pg_cron with schema extensions;

-- Schedule the job
select cron.schedule(
  'auto-punch-out-midnight-ist',
  '30 18 * * *', -- 18:30 UTC = 00:00 IST
  $$
    update public.attendance
    set punch_out_at = (work_date || ' 23:59:59+05:30')::timestamptz
    where punch_out_at is null
      and work_date <= (now() at time zone 'Asia/Kolkata')::date::text;
  $$
);
