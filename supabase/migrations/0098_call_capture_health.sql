-- Phone Health: is each telecaller's phone actually feeding the CRM?
--
-- The app logs an OUTGOING call the moment it dials — that row is inserted by the
-- dialer itself and needs no phone permission. Everything else — INCOMING calls,
-- MISSED calls and OFF-CRM calls — can only reach the CRM through the 15-minute
-- call-log sync, which silently returns without doing anything when Android's
-- "Call logs" permission is denied or has been auto-revoked.
--
-- The result is a CRM that looks fine (outgoing keeps flowing) while inbound
-- disappears entirely, with nothing on the server to explain why. This function
-- reconstructs that missing signal from rows the app already writes, so a manager
-- can see WHICH phone stopped feeding the CRM and fix it in phone settings —
-- no app update involved.
--
-- The tell: a row backfilled by the sync lands minutes-to-days after the call
-- happened (created_at >> started_at), whereas a live dialer row lands within
-- seconds. No such rows + no inbound + no off-CRM, on a company that records all
-- calls, means the sync isn't running on that phone.
--
-- Isolation: security definer, but it re-checks the caller — a platform super
-- admin sees every company, a company admin only their own, anyone else nothing.
create or replace function public.call_capture_health(p_days int default 14)
returns table (
  company_id uuid,
  company_name text,
  record_all_calls boolean,
  salesperson_id uuid,
  rep_name text,
  app_last_seen timestamptz,
  calls int,
  outgoing int,
  incoming int,
  missed int,
  off_crm int,
  connected int,
  recordings_ready int,
  sync_rows int,
  last_sync_row_at timestamptz,
  last_call_at timestamptz,
  state text
)
language sql
stable
security definer
set search_path = public
as $$
  with scope as (
    select public.is_super_admin() as is_super,
           public.is_admin()       as is_adm,
           public.current_company_id() as cid
  ),
  win as (select now() - make_interval(days => greatest(p_days, 1)) as since),
  reps as (
    select p.id, p.full_name::text as name, p.company_id
    from public.profiles p
    cross join scope s
    where p.role = 'salesperson'
      and p.company_id is not null
      and (s.is_super or (s.is_adm and p.company_id = s.cid))
  ),
  agg as (
    select
      r.id as rep_id,
      count(cl.id)::int as calls,
      count(cl.id) filter (where cl.direction = 'outgoing')::int as outgoing,
      -- SIM inbound only: cloud/SIP legs are logged by a different path and would
      -- mask a dead call-log sync.
      count(cl.id) filter (
        where cl.direction = 'incoming' and coalesce(cl.recording_source, '') <> 'sip'
      )::int as incoming,
      count(cl.id) filter (where cl.outcome::text = 'missed')::int as missed,
      count(cl.id) filter (where coalesce(cl.off_crm, false))::int as off_crm,
      count(cl.id) filter (where coalesce(cl.duration_seconds, 0) > 0)::int as connected,
      count(cl.id) filter (where cl.recording_status = 'ready')::int as recordings_ready,
      -- Landed long after the call itself = written by the call-log sync.
      count(cl.id) filter (
        where cl.created_at - cl.started_at > interval '5 minutes'
      )::int as sync_rows,
      max(cl.started_at) filter (
        where cl.created_at - cl.started_at > interval '5 minutes'
      ) as last_sync_row_at,
      max(cl.started_at) as last_call_at
    from reps r
    left join public.call_logs cl
      on cl.salesperson_id = r.id
     and cl.started_at >= (select since from win)
    group by r.id
  ),
  seen as (
    select dt.user_id, max(dt.updated_at) as app_last_seen
    from public.device_tokens dt
    group by dt.user_id
  )
  select
    r.company_id,
    co.name::text,
    coalesce(co.record_all_calls, false),
    r.id,
    r.name,
    s.app_last_seen,
    a.calls, a.outgoing, a.incoming, a.missed, a.off_crm,
    a.connected, a.recordings_ready, a.sync_rows,
    a.last_sync_row_at, a.last_call_at,
    case
      -- Nothing dialled at all: a staffing question, not a phone fault.
      when a.calls = 0 then 'idle'
      -- Outgoing flows but NOTHING that needs the call-log permission ever
      -- arrived, on a company that syncs every call. That is the permission.
      when coalesce(co.record_all_calls, false)
       and a.calls >= 5
       and a.sync_rows = 0 and a.incoming = 0 and a.off_crm = 0
        then 'no_calllog_permission'
      -- It used to work and has gone quiet while the rep kept calling.
      when a.sync_rows > 0
       and a.last_sync_row_at < now() - interval '3 days'
       and a.last_call_at   >= now() - interval '2 days'
        then 'sync_stale'
      -- Off-CRM capture is switched off, so inbound-from-strangers and personal
      -- calls can't appear and the check above can't even run.
      when not coalesce(co.record_all_calls, false) then 'offcrm_disabled'
      -- Calls connect but the audio isn't reaching us.
      when a.connected >= 3 and a.recordings_ready::numeric / a.connected < 0.4
        then 'no_recordings'
      else 'ok'
    end::text
  from reps r
  join agg a on a.rep_id = r.id
  left join public.companies co on co.id = r.company_id
  left join seen s on s.user_id = r.id
$$;

grant execute on function public.call_capture_health(int) to authenticated;
