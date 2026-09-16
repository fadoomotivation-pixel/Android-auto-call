-- "Jo number phone me save hai usi naam se hona chahiye, or jo group ka naam
--  hai usi naam se."
--
-- Right, and neither was arriving. Ten groups, none named. Nineteen
-- conversations, two named. The rep's own handset shows a name for every one.
--
-- WHY THE NAMES NEVER CAME
--
-- Both the address book and the group list DO arrive on their own — but only
-- on a FRESH LINK, in the initial app-state sync. Baileys runs that sync only
-- while syncState is Syncing (Socket/chats.js), so a worker reconnecting on
-- existing credentials skips it entirely. Four worker uploads in a row
-- therefore reconnected, worked perfectly, and knew nobody's name.
--
-- The worker now asks, once per connection: groupFetchAllParticipating() for
-- every group's subject in a single query, and resyncAppState() to have the
-- address book redelivered as contacts.upsert.
--
-- WHY A TABLE AND NOT A COLUMN
--
-- peer_name lives on wa_observed_messages, which has one row per MESSAGE. So
-- the conversation list had to collapse them with max(peer_name), and the name
-- a buyer appeared under changed depending on which of their messages sorted
-- highest. Worse, there was no way to say that one name was better than
-- another — which is how a display name lifted off an outbound message (the
-- REP's own name) outranked the buyer's real one.
--
-- One row per number per rep, with its source. "book" — the name saved in the
-- rep's phone, or a group's real subject — always wins over "push", whatever
-- the sender happened to call themselves. The message rows keep their pushName
-- as a last resort for anyone not in the address book.
--
-- AND: WHAT HAPPENED TO EACH ATTACHMENT
--
-- The panel decided between "Downloading…" and "not saved" from the clock: ten
-- minutes old or less meant coming, older meant gone. Wrong in both
-- directions. A photo still in the queue after twenty minutes read as lost,
-- and 347 attachments that were never queued at all sat on "Downloading…"
-- forever with nothing behind them. media_status is what actually happened,
-- reported by the worker, and media_error carries WhatsApp's own reason.
--
-- APPLIED TO PRODUCTION BY HAND on 2026-09-16.

create table if not exists public.wa_peer_names (
  salesperson_id uuid not null references public.profiles(id) on delete cascade,
  peer_phone text not null,
  name text not null,
  source text not null default 'book' check (source in ('book','push')),
  updated_at timestamptz not null default now(),
  primary key (salesperson_id, peer_phone)
);

comment on table public.wa_peer_names is
  'One name per number (or group) per rep, with where it came from. "book" is the rep''s own address book or a group''s real subject and always wins; "push" is whatever a sender called themselves on a message.';

alter table public.wa_peer_names enable row level security;

drop policy if exists wa_peer_names_select on public.wa_peer_names;
create policy wa_peer_names_select on public.wa_peer_names
  for select using (
    is_super_admin()
    or (salesperson_id = auth.uid())
    or exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role = 'admin'
                  and p.company_id = (select company_id from public.profiles q where q.id = wa_peer_names.salesperson_id))
  );

create or replace function public.wa_note_peer_name(
  p_rep uuid, p_peer text, p_name text, p_source text default 'book'
) returns void
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if coalesce(p_peer,'') = '' or coalesce(trim(p_name),'') = '' then return; end if;
  insert into public.wa_peer_names (salesperson_id, peer_phone, name, source, updated_at)
  values (p_rep, p_peer, left(trim(p_name), 120),
          case when p_source = 'push' then 'push' else 'book' end, now())
  on conflict (salesperson_id, peer_phone) do update
    set name = excluded.name, source = excluded.source, updated_at = now()
    where wa_peer_names.source <> 'book' or excluded.source = 'book';
end
$function$;

alter table public.wa_observed_messages
  add column if not exists media_status text,
  add column if not exists media_error text;

comment on column public.wa_observed_messages.media_status is
  'queued = handed to the download queue and still coming. stored = the file is in wa-media. failed = it will not arrive, and media_error says why. skipped = never queued (too big, or the backlog was full). null = predates this column.';

update public.wa_observed_messages
   set media_status = 'stored'
 where media_path is not null and media_status is null;

update public.wa_observed_messages
   set media_status = 'failed',
       media_error = 'Captured before this CRM downloaded attachments. WhatsApp keeps a file for about a month, so it is no longer fetchable.'
 where has_media and media_path is null and media_status is null
   and sent_at < now() - interval '1 hour';
