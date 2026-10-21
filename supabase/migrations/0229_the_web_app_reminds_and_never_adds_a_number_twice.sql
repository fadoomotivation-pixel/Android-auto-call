-- The /app web app reminds a rep when a callback is due, and Scan never adds a
-- number the company already has.
--
-- 1. SCAN: WHO ALREADY HAS THIS NUMBER
--
-- Scan used to check a photographed list only against the rep's own leads.
-- trg_dedup_contact_by_phone then dropped every number already anywhere in the
-- company — silently — so the review screen showed 10 ticked rows, the rep
-- pressed "Add 10", and 7 arrived. scan_known_phones answers before the review
-- screen is drawn, per number: 'mine', 'team' (another rep in this company has
-- it) or 'dnc' (someone asked us not to call). Company-scoped by
-- current_company_id(); it says nothing about other companies and never names
-- the other rep.
--
-- 2. FOLLOW-UP REMINDERS FOR A BROWSER
--
-- The Android app rings an AlarmManager alarm at a callback's due time
-- (notify/FollowUpReminder.kt). A web page cannot set an alarm; the only thing
-- that reaches a phone with the tab closed is Web Push. So:
--   web_push_subscriptions  one row per browser, owned by whoever is signed in
--                           on it now. The endpoint is the key, so a shared
--                           phone's reminders follow the rep holding it, not
--                           the one who subscribed first.
--   web_push_sent           (follow_up_id, due_at) already pushed. Keyed on
--                           due_at too, so a callback moved to 5 PM rings again
--                           at 5 PM.
--   web_push_vapid*         the VAPID key lives in Vault, created by the edge
--                           function on first use — it never passes through a
--                           file, a commit or a chat.
--   web_push_claim_due()    marks and returns what is due, at most once.
--   cron web-push-due-1min  calls the web-push function ONLY when something is
--                           due for a rep who turned reminders on; an idle
--                           minute costs one EXISTS and no HTTP call.
--
-- Same rule as the Android alarm: one reminder, at the time the rep booked. A
-- lead that has moved to another rep, or a follow-up already done, is skipped.
--
-- NOT YET APPLIED TO PRODUCTION (2026-10-21): applying it needs a human's
-- approval. Until it is applied the web app still works — Scan falls back to
-- the rep's own leads (the dedup trigger still blocks team duplicates), and
-- "Turn on reminders" says they aren't ready yet. scan_known_phones was tried
-- in a rolled-back transaction as a Fanbe rep: 2 own numbers → mine, 2 of a
-- teammate's → team, 2 from another company → nothing returned.
--
-- Every function here is safe without its REVOKE: the service-only ones check
-- auth.role() in the body, scan_known_phones returns nothing without a
-- company, and web_push_subscribe refuses an anonymous caller.

-- ── 1. Scan ───────────────────────────────────────────────────────────────────

create or replace function public.scan_known_phones(p_phones text[])
returns table(phone text, state text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with q as (
    select distinct right(regexp_replace(p, '\D', '', 'g'), 10) as tail
      from unnest(p_phones[1:500]) as p
  ), c as (
    select right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10) as tail,
           c.salesperson_id, c.status
      from public.contacts c
     where c.company_id = public.current_company_id()
  )
  select q.tail,
         case when bool_or(c.status = 'dnc') then 'dnc'
              when bool_or(c.salesperson_id = auth.uid()) then 'mine'
              else 'team' end
    from q
    join c on c.tail = q.tail
   where length(q.tail) = 10
     and public.current_company_id() is not null
   group by q.tail;
$function$;

comment on function public.scan_known_phones(text[]) is
  'Scan review: which of these numbers the caller''s company already has — mine, team or dnc. Same last-10-digit key as trg_dedup_contact_by_phone.';

revoke all on function public.scan_known_phones(text[]) from public, anon;
grant execute on function public.scan_known_phones(text[]) to authenticated;

-- ── 2. Reminders ──────────────────────────────────────────────────────────────

create table if not exists public.web_push_subscriptions (
  endpoint     text primary key check (endpoint like 'https://%' and length(endpoint) < 1024),
  user_id      uuid not null references auth.users(id) on delete cascade,
  company_id   uuid references public.companies(id) on delete cascade,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists web_push_subscriptions_user_idx on public.web_push_subscriptions(user_id);
alter table public.web_push_subscriptions enable row level security;
drop policy if exists web_push_subscriptions_own on public.web_push_subscriptions;
create policy web_push_subscriptions_own on public.web_push_subscriptions
  for select to authenticated using (user_id = auth.uid());

create table if not exists public.web_push_sent (
  follow_up_id uuid not null,
  due_at       timestamptz not null,
  sent_at      timestamptz not null default now(),
  primary key (follow_up_id, due_at)
);
alter table public.web_push_sent enable row level security;

-- Whoever is signed in on a browser owns its endpoint. Five browsers per rep at
-- most; the oldest goes.
create or replace function public.web_push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;
  insert into public.web_push_subscriptions (endpoint, user_id, company_id, p256dh, auth, user_agent)
  values (p_endpoint, auth.uid(), public.current_company_id(), p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
     set user_id = excluded.user_id, company_id = excluded.company_id, p256dh = excluded.p256dh,
         auth = excluded.auth, user_agent = excluded.user_agent, created_at = now();
  delete from public.web_push_subscriptions s
   where s.user_id = auth.uid()
     and s.endpoint not in (select endpoint from public.web_push_subscriptions
                             where user_id = auth.uid() order by created_at desc limit 5);
end;
$function$;

create or replace function public.web_push_unsubscribe(p_endpoint text)
returns void
language sql
security definer
set search_path to 'public'
as $function$
  delete from public.web_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$function$;

revoke all on function public.web_push_subscribe(text, text, text, text) from public, anon;
revoke all on function public.web_push_unsubscribe(text) from public, anon;
grant execute on function public.web_push_subscribe(text, text, text, text) to authenticated;
grant execute on function public.web_push_unsubscribe(text) to authenticated;

-- The three service-only functions also check the caller's role in the body,
-- so they stay closed even where an EXECUTE grant is wider than intended.
create or replace function public.web_push_vapid()
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service only';
  end if;
  return (select decrypted_secret from vault.decrypted_secrets where name = 'web_push_vapid_jwk' limit 1);
end;
$function$;

create or replace function public.web_push_vapid_store(p_jwk text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service only';
  end if;
  perform pg_advisory_xact_lock(hashtext('web_push_vapid_jwk'));
  select decrypted_secret into v from vault.decrypted_secrets where name = 'web_push_vapid_jwk' limit 1;
  if v is not null then
    return v;  -- someone else made it first; everyone uses that one
  end if;
  perform vault.create_secret(p_jwk, 'web_push_vapid_jwk', 'VAPID private key (JWK) for /app follow-up reminders');
  return p_jwk;
end;
$function$;

create or replace function public.web_push_claim_due()
returns table(fu_id uuid, rep_id uuid, lead_id uuid, lead_name text, lead_phone text, fu_note text, fu_due timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service only';
  end if;
  return query
  with due as (
    select f.id, f.salesperson_id, f.contact_id, coalesce(nullif(c.name, ''), f.name) as name,
           f.phone, f.note, f.due_at
      from public.follow_ups f
      left join public.contacts c on c.id = f.contact_id
     where f.status = 'pending'
       and f.completed_at is null
       and f.due_at <= now()
       and f.due_at > now() - interval '15 minutes'
       and (c.id is null or c.salesperson_id = f.salesperson_id)
       and exists (select 1 from public.web_push_subscriptions s where s.user_id = f.salesperson_id)
  ), claimed as (
    insert into public.web_push_sent as w (follow_up_id, due_at)
    select d.id, d.due_at from due d
    on conflict do nothing
    returning w.follow_up_id, w.due_at
  )
  select d.id, d.salesperson_id, d.contact_id, d.name, d.phone, d.note, d.due_at
    from due d
    join claimed k on k.follow_up_id = d.id and k.due_at = d.due_at;
end;
$function$;

revoke all on function public.web_push_vapid() from public, anon, authenticated;
revoke all on function public.web_push_vapid_store(text) from public, anon, authenticated;
revoke all on function public.web_push_claim_due() from public, anon, authenticated;

select cron.schedule(
  'web-push-due-1min',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://rqgkzamuohdvttnkluzn.supabase.co/functions/v1/web-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('action', 'send-due')
  )
  where exists (
    select 1
      from public.follow_ups f
      join public.web_push_subscriptions s on s.user_id = f.salesperson_id
     where f.status = 'pending'
       and f.completed_at is null
       and f.due_at <= now()
       and f.due_at > now() - interval '15 minutes'
       and not exists (select 1 from public.web_push_sent w where w.follow_up_id = f.id and w.due_at = f.due_at)
  );
  $$
);
