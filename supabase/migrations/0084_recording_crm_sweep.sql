-- Twice-daily server safety-net for recordings (commission depends on every
-- recording landing on the CRM under the right lead). A server job CANNOT pull a
-- file that still lives only on the telecaller's phone — that upload is driven by
-- the app's RecordingSyncWorker (hourly + on open + after each call). What the
-- server CAN guarantee, morning and evening, is that anything already uploaded is
-- correctly attributed and that half-stuck uploads get released so the phone
-- re-attempts them on its next sync.
create or replace function public.recording_crm_sweep()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_relabeled int; v_released int;
begin
  -- 1) Any call tied to a real lead is a CRM call, never off-CRM. (Belt-and-
  --    suspenders alongside the link trigger, in case a row slipped through.)
  update public.call_logs
  set off_crm = false
  where off_crm = true and contact_id is not null;
  get diagnostics v_relabeled = row_count;

  -- 2) Release uploads that stalled mid-flight (>6h in 'uploading'/'recording').
  --    Flipping them to 'failed' makes the app's next sync re-attempt the upload
  --    from the phone (syncRecordings retries every non-'ready' call).
  update public.call_logs
  set recording_status = 'failed'
  where recording_status in ('uploading', 'recording')
    and coalesce(started_at, created_at) < now() - interval '6 hours';
  get diagnostics v_released = row_count;

  return jsonb_build_object('relabeled', v_relabeled, 'released', v_released, 'at', now());
end $$;

-- Morning (04:40 IST = 23:10 UTC prev day) and evening (15:40 IST = 10:10 UTC).
select cron.unschedule('recording-crm-sweep-morning') where exists (select 1 from cron.job where jobname = 'recording-crm-sweep-morning');
select cron.unschedule('recording-crm-sweep-evening') where exists (select 1 from cron.job where jobname = 'recording-crm-sweep-evening');
select cron.schedule('recording-crm-sweep-morning', '10 23 * * *', 'select public.recording_crm_sweep()');
select cron.schedule('recording-crm-sweep-evening', '10 10 * * *', 'select public.recording_crm_sweep()');
