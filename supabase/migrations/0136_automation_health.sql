-- Automation Health, as far as the database can see it.
--
-- "Why didn't I receive the booking message?" has about six possible answers
-- and five of them are knowable from SQL: the cron did not run, the function
-- answered with an error, nothing was queued, the queue is stuck, or nobody is
-- subscribed. Only the sixth — the WhatsApp pipe is down — needs a live probe,
-- and that lives in the notify-provider edge function because it needs the
-- worker secret.
--
-- SECURITY DEFINER because cron.job, cron.job_run_details and net._http_response
-- are not reachable by an ordinary role and never should be. The guard at the
-- top is the whole safety story: an admin sees their own company, a platform
-- admin sees any of them, everyone else gets an exception rather than a null,
-- because a health screen that quietly returns "all clear" to someone it would
-- not answer for is worse than one that refuses.
--
-- Deliberately NOT a view: it takes a company, and the cron half has no
-- company_id to join on.

create or replace function public.automation_health(p_company uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, cron, net, extensions
as $$
declare
  v_super boolean := is_super_admin();
  v_admin boolean := is_admin();
  v_mine uuid := current_company_id();
  v_scope uuid;
  v_crons jsonb;
  v_http jsonb;
  v_queue jsonb;
  v_recipients jsonb;
  v_last jsonb;
begin
  if not (v_super or v_admin) then
    raise exception 'Not allowed';
  end if;

  -- A company admin is pinned to their own company whatever they ask for. The
  -- super admin may ask for one company or, with null, for the platform.
  if v_super then
    v_scope := p_company;
  else
    v_scope := v_mine;
  end if;

  -- ── Crons ────────────────────────────────────────────────────────────────
  -- Only the three that carry a message. The other sixteen jobs are real work
  -- but not automations anyone is asking about, and listing them turns a
  -- health check into a server dashboard.
  select jsonb_agg(x order by x->>'job')
    into v_crons
  from (
    select jsonb_build_object(
             'job', j.jobname,
             'schedule', j.schedule,
             'active', j.active,
             'last_run', r.start_time,
             'last_status', r.status,
             'last_message', left(coalesce(r.return_message, ''), 200),
             'minutes_since', case when r.start_time is null then null
                              else floor(extract(epoch from (now() - r.start_time)) / 60)::int end,
             -- How long is too long, per job. A 15-minute job silent for an
             -- hour is broken; an hourly job silent for 70 minutes is not.
             'stale_after_minutes', v.stale_after
           ) as x
    from cron.job j
    join (values
            ('founder-alerts-15min',      45),
            ('pulse-broadcast-hourly',    75),
            ('notification-outbox-drain', 20)
         ) as v(name, stale_after) on v.name = j.jobname
    left join lateral (
      select d.start_time, d.status, d.return_message
      from cron.job_run_details d
      where d.jobid = j.jobid
      order by d.start_time desc
      limit 1
    ) r on true
  ) s;

  -- ── Edge functions, as seen from the caller's side ───────────────────────
  -- pg_net keeps the status code and the body of every cron → function call,
  -- and throws the URL away, so this cannot name the function that failed. It
  -- can still answer the question that matters: is anything the crons call
  -- refusing them? A 401 here is the signature of a deploy that flipped
  -- verify_jwt back on, which is otherwise completely silent.
  --
  -- Timeouts are counted SEPARATELY and are not a failure. pg_net gives up
  -- listening after five seconds; the edge function carries on and almost
  -- always finishes. Nineteen percent of calls on this platform time out that
  -- way, so folding them in with real errors would paint the panel permanently
  -- red and teach everyone to ignore it — which is the only way a health check
  -- can actually do harm.
  select jsonb_build_object(
           'window_hours', 6,
           'calls', count(*),
           'errors', count(*) filter (where status_code >= 400),
           'timeouts', count(*) filter (where timed_out or status_code is null),
           'last_error_at', max(created) filter (where status_code >= 400),
           'last_error_code', (array_agg(status_code order by created desc)
                               filter (where status_code >= 400))[1],
           'last_error_body', left((array_agg(coalesce(content, error_msg) order by created desc)
                               filter (where status_code >= 400))[1], 300)
         )
    into v_http
  from net._http_response
  where created > now() - interval '6 hours';

  -- ── The outbox ───────────────────────────────────────────────────────────
  select jsonb_build_object(
           'queued', count(*) filter (where status = 'queued'),
           'oldest_queued_at', min(created_at) filter (where status = 'queued'),
           'failed_24h', count(*) filter (where status = 'failed' and created_at > now() - interval '24 hours'),
           'last_error', (array_agg(last_error order by created_at desc)
                          filter (where last_error is not null))[1]
         )
    into v_queue
  from notification_outbox
  where (v_scope is null or company_id = v_scope);

  -- ── Who would actually receive anything ──────────────────────────────────
  select jsonb_build_object(
           'founder_pulse', count(*) filter (where active and salesperson_id is null),
           'founder_alerts', count(*) filter (where active and alerts_on and salesperson_id is null),
           'rep_pulse', count(*) filter (where active and salesperson_id is not null),
           'inactive', count(*) filter (where not active),
           'failing', count(*) filter (where active and last_status = 'failed')
         )
    into v_recipients
  from pulse_subscribers
  where (v_scope is null or company_id = v_scope);

  -- ── Last send per automation kind ────────────────────────────────────────
  select coalesce(jsonb_object_agg(kind, info), '{}'::jsonb)
    into v_last
  from (
    select m.kind,
           jsonb_build_object(
             'last_sent_at', max(m.created_at) filter (where m.error is null),
             'last_failed_at', max(m.created_at) filter (where m.error is not null),
             'sent_24h', count(*) filter (where m.created_at > now() - interval '24 hours')
           ) as info
    from whatsapp_messages m
    where m.direction = 'out' and m.kind is not null
      and (v_scope is null or m.company_id = v_scope)
    group by m.kind
  ) k;

  return jsonb_build_object(
    'scope', v_scope,
    'checked_at', now(),
    'crons', coalesce(v_crons, '[]'::jsonb),
    'http', v_http,
    'queue', v_queue,
    'recipients', v_recipients,
    'last_send', v_last
  );
end;
$$;

revoke all on function public.automation_health(uuid) from public;
grant execute on function public.automation_health(uuid) to authenticated;

comment on function public.automation_health(uuid) is
  'Everything the database knows about whether the automations are working: cron freshness, '
  'pg_net response codes from cron → edge function calls, outbox depth, recipient counts and '
  'the last send per message kind. The live WhatsApp probe is in notify-provider.';
