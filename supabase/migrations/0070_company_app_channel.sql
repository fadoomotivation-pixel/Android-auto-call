-- Which branded APK build a company uses. Maps to a GitHub release channel:
--   NULL / 'android-latest' → Call Pro AI (standard)
--   'android-sndeveloper'   → SN Developer flavor
--   'android-manasproperty' → Manas Property flavor
-- The super-admin sets this in the web dashboard, which then shows the exact
-- APK download link to hand to that company.
alter table public.companies
  add column if not exists app_channel text;
