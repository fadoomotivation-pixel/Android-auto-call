-- Read twelve recordings an hour, and check the ledger every fifteen minutes.
--
-- 325 recorded conversations are waiting to be read. At twelve an hour the
-- backlog clears in about a day, and after that the job costs one query on
-- most runs because promise_scans means a call is never read twice.
--
-- Twelve and not forty: each is a model call over up to 6,000 characters of
-- Devanagari transcript. win-harvest takes forty because it reads short
-- summaries; this reads the actual conversation, and the edge CPU budget is
-- what returns HTTP 546 when a batch gets greedy — the same wall
-- knowledge-ingest hit with a whole book.
--
-- :47 because :23 already belongs to lead-memory, which reads the same
-- transcripts. Two Groq-heavy jobs firing in the same minute is how one of
-- them starts timing out at 3am with nobody watching.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-20.

select cron.unschedule('promise-watch-hourly')
 where exists (select 1 from cron.job where jobname = 'promise-watch-hourly');

select cron.schedule('promise-watch-hourly', '47 * * * *', $$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/promise-watch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('mode', 'scan', 'limit', 12)
  );
$$);

-- SETTLING IS SQL, SO IT RUNS FOUR TIMES AN HOUR AND COSTS NOTHING.
--
-- The scan settles too, but waiting an hour for it is wrong in the one
-- direction that matters: a rep who has just sent the floor plan must stop
-- being chased for it quickly. Being slow to say "done" is how an app teaches
-- someone to ignore it.
--
-- No HTTP, no model, no edge function — four indexed updates on a small table.

select cron.unschedule('promise-settle-15m')
 where exists (select 1 from cron.job where jobname = 'promise-settle-15m');

select cron.schedule('promise-settle-15m', '*/15 * * * *', $$
  select public.settle_promises();
$$);
