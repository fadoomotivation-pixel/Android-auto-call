-- Morning Brief: move the daily "Aaj ka plan" push from 10:00 IST to 9:30 IST
-- so it lands before the calling day starts. (04:00 UTC = 09:30 IST.)
do $$ begin perform cron.unschedule('rep-agenda-daily'); exception when others then null; end $$;
select cron.schedule('rep-agenda-daily', '0 4 * * *', $$select public.call_rep_assistant('agenda')$$); -- 09:30 IST
