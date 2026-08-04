-- Which automation sent this message.
--
-- notify.ts has always taken a `kind` on every request — 'pulse', 'alert' —
-- and has never written it down. So whatsapp_messages could answer "what did
-- we send this number" but not "did the booking alert go out", and every
-- question of the form "why didn't the founder receive it?" ended in reading
-- edge function source and guessing from the body text.
--
-- One nullable column closes that. Existing rows stay null and are simply
-- unattributed; everything sent from here on names its own automation.
alter table public.whatsapp_messages add column if not exists kind text;

comment on column public.whatsapp_messages.kind is
  'Which automation produced this message (pulse, alert, …). Set by _shared/notify.ts.';

create index if not exists whatsapp_messages_kind_recent
  on public.whatsapp_messages(company_id, kind, created_at desc)
  where kind is not null;
