-- Off-CRM capture must be ON for a new company, not off.
--
-- This column defaulted to false, so every company created on the platform
-- started with the phone's call-log capture switched off. Nothing told anyone.
-- The company simply never saw the calls its reps dialled from the phone's own
-- dialer — only the ones placed inside the app — and it looked like the app was
-- losing calls.
--
-- It has now caused the same support complaint twice: Fanbe (Ankita's 56 calls
-- appeared the moment it was flipped) and capital brix (Vishesh's phone-dialled
-- calls never arrived at all; only his 3 app-dialled ones did). Both times the
-- data was never lost — it was never asked for.
--
-- A CRM that quietly drops half the calls on the day a customer signs up is not
-- a setting problem, it is a wrong default. Capture everything; a company that
-- genuinely wants it off can still turn it off.
--
-- There is no per-telecaller equivalent to change: capture is a company-level
-- setting, so a newly added rep inherits it automatically.
alter table public.companies
  alter column record_all_calls set default true;

-- Anyone still sitting on the old default gets it too.
update public.companies
   set record_all_calls = true
 where record_all_calls = false;
