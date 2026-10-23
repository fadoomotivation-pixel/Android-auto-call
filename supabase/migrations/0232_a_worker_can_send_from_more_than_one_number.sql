-- A worker can send from more than one number.
--
-- One Baileys worker (pink-worm-375262.hostingersite.com) held one sending
-- login: +91 70489 17300, Capital Brix's attendance phone. Because it was the
-- only sender, it ended up carrying every company's Daily Pulse and alerts too.
-- The worker now holds extra sending numbers as paths, /p/<name>/..., each with
-- its own saved login (services/baileys, "EXTRA SENDING NUMBERS").
--
-- sender_session says which one a company sends from:
--   null        the worker's main login, exactly as before
--   'platform'  Call Pro AI's own number, linked by QR from the WhatsApp page
--               (Platform-wide card). When it connects, the platform sender
--               company is switched to it, and every company that borrows the
--               platform number follows.
--
-- Telecaller watchers (/s/<rep>) are not affected: they never read this column.

alter table public.whatsapp_baileys
  add column if not exists sender_session text
  check (sender_session is null or sender_session ~ '^[a-z][a-z0-9-]{1,30}$');

comment on column public.whatsapp_baileys.sender_session is
  'Which sending login on the worker this company uses: null = the worker''s main login, otherwise the /p/<name> sender (e.g. ''platform'' = Call Pro AI''s own number).';
