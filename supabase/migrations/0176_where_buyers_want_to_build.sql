-- Location demand: which city a buyer actually asked for, mined from what they
-- already said — on a call (transcript/summary already exist for thousands of
-- calls) and on WhatsApp (already stored since 0173). When a new site launches
-- in Gurgaon, this is the list of every lead across every company who ever
-- said "Gurgaon", "Noida" or "Dehradun" out loud, with the actual line they
-- said it in — ready to re-pitch instead of buried in a transcript nobody
-- re-reads. Same rules-now philosophy as the WhatsApp signal engine (0175):
-- plain keyword match, no AI call, extendable to more cities in one place.
--
-- NOT the same thing as contacts.territory. territory is where the LEAD lives
-- (imported from lead-source data, e.g. "Kanpur", "Agra"); this is where the
-- lead wants to BUY — a Kanpur lead can want a flat in Gurgaon, and the two
-- must never be conflated.

-- One list, so a new city is a one-line edit here and nowhere else. Word-
-- boundaried (\y, Postgres's word-boundary anchor) so "Bangalore" does not
-- also fire on a name that happens to contain the substring.
create or replace function public.location_city_patterns()
returns table(city_name text, pattern text)
language sql
immutable
as $function$
  select * from (values
    ('Delhi',      '\ydelhi\y'),
    ('Noida',      '\ynoida\y'),
    ('Gurgaon',    '\y(?:gurgaon|gurugram)\y'),
    ('Dehradun',   '\ydehradun\y'),
    ('Faridabad',  '\yfaridabad\y'),
    ('Ghaziabad',  '\yghaziabad\y'),
    ('Sonipat',    '\ysonipat\y'),
    ('Panipat',    '\ypanipat\y'),
    ('Meerut',     '\ymeerut\y'),
    ('Chandigarh', '\ychandigarh\y'),
    ('Mohali',     '\ymohali\y'),
    ('Panchkula',  '\ypanchkula\y'),
    ('Lucknow',    '\ylucknow\y'),
    ('Jaipur',     '\yjaipur\y'),
    ('Agra',       '\yagra\y'),
    ('Dholera',    '\ydholera\y'),
    ('Ahmedabad',  '\yahmedabad\y'),
    ('Mumbai',     '\y(?:mumbai|bombay)\y'),
    ('Pune',       '\ypune\y'),
    ('Bangalore',  '\y(?:bangalore|bengaluru)\y'),
    ('Hyderabad',  '\yhyderabad\y'),
    ('Chennai',    '\ychennai\y'),
    ('Goa',        '\ygoa\y'),
    ('Rishikesh',  '\yrishikesh\y'),
    ('Haridwar',   '\yharidwar\y'),
    ('Mussoorie',  '\ymussoorie\y')
  ) as t(city_name, pattern);
$function$;

-- The line, not the whole call. A ten-minute transcript is not something a
-- rep re-reads before a pitch; sixty characters either side of "Gurgaon" is.
-- Uses regexp_matches rather than substring(... from pattern) because Postgres
-- special-cases substring-with-pattern to return the first PARENTHESIZED
-- group rather than the whole match the moment the pattern contains any
-- parens — which every multi-city pattern above does. Every group in the
-- patterns above is non-capturing (?:...) for exactly this reason, so
-- regexp_matches has nothing to capture and its single array element is the
-- whole windowed match.
create or replace function public.city_snippet(p_text text, p_pattern text)
returns text
language sql
immutable
as $function$
  select regexp_replace(
    (regexp_matches(p_text, '.{0,60}(?:' || p_pattern || ').{0,60}', 'i'))[1],
    '\s+', ' ', 'g'
  );
$function$;

create table if not exists public.lead_location_interest (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  city text not null,
  source text not null check (source in ('call', 'whatsapp')),
  evidence text,
  detected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (contact_id, city, source)
);

create index if not exists lead_location_interest_city_idx
  on public.lead_location_interest (city, detected_at desc);
create index if not exists lead_location_interest_company_idx
  on public.lead_location_interest (company_id);

alter table public.lead_location_interest enable row level security;
-- No policies, deliberately — same lockdown as wa_observed_messages and
-- wa_rep_activity_daily. Read only through the security-definer RPC below,
-- written only by the triggers (which run as table owner and bypass RLS).
revoke all on public.lead_location_interest from public, anon, authenticated;

-- CALLS: transcript or summary changing is the only time a new city could
-- appear, so the trigger fires on exactly those columns rather than every
-- call_logs update (which happens often, for outcome/notes/etc).
create or replace function public.call_logs_location_interest()
returns trigger
language plpgsql
as $function$
declare
  txt text := btrim(coalesce(new.summary, '') || ' ' || coalesce(new.transcript, ''));
  c record;
begin
  if new.contact_id is null or txt = '' then
    return new;
  end if;
  for c in select * from public.location_city_patterns() loop
    if txt ~* c.pattern then
      insert into public.lead_location_interest (company_id, contact_id, city, source, evidence, detected_at)
      values (new.company_id, new.contact_id, c.city_name, 'call',
              public.city_snippet(txt, c.pattern), coalesce(new.ended_at, new.started_at, now()))
      on conflict (contact_id, city, source) do update
        set evidence = excluded.evidence, detected_at = excluded.detected_at, company_id = excluded.company_id;
    end if;
  end loop;
  return new;
end
$function$;

drop trigger if exists call_logs_location_interest_trg on public.call_logs;
create trigger call_logs_location_interest_trg
  after insert or update of transcript, summary on public.call_logs
  for each row execute function public.call_logs_location_interest();

-- WHATSAPP: only what the BUYER wrote (direction = 'in') — a rep saying
-- "we also have a project in Gurgaon" is not the buyer asking for Gurgaon.
create or replace function public.wa_observed_messages_location_interest()
returns trigger
language plpgsql
as $function$
declare c record;
begin
  if new.direction <> 'in' or new.contact_id is null or coalesce(btrim(new.body), '') = '' then
    return new;
  end if;
  for c in select * from public.location_city_patterns() loop
    if new.body ~* c.pattern then
      insert into public.lead_location_interest (company_id, contact_id, city, source, evidence, detected_at)
      values (new.company_id, new.contact_id, c.city_name, 'whatsapp',
              public.city_snippet(new.body, c.pattern), new.sent_at)
      on conflict (contact_id, city, source) do update
        set evidence = excluded.evidence, detected_at = excluded.detected_at, company_id = excluded.company_id;
    end if;
  end loop;
  return new;
end
$function$;

drop trigger if exists wa_observed_messages_location_interest_trg on public.wa_observed_messages;
create trigger wa_observed_messages_location_interest_trg
  after insert or update of body, direction on public.wa_observed_messages
  for each row execute function public.wa_observed_messages_location_interest();

-- BACKFILL: every call and WhatsApp message already sitting in the tables
-- gets read once. This is a pure read of text already stored, not a new
-- import — the same move the WhatsApp signal engine's backfill made.
do $$
declare r record; c record; txt text;
begin
  for r in
    select id, company_id, contact_id, transcript, summary, ended_at, started_at
    from public.call_logs
    where contact_id is not null
      and (coalesce(transcript, '') <> '' or coalesce(summary, '') <> '')
  loop
    txt := btrim(coalesce(r.summary, '') || ' ' || coalesce(r.transcript, ''));
    for c in select * from public.location_city_patterns() loop
      if txt ~* c.pattern then
        insert into public.lead_location_interest (company_id, contact_id, city, source, evidence, detected_at)
        values (r.company_id, r.contact_id, c.city_name, 'call',
                public.city_snippet(txt, c.pattern), coalesce(r.ended_at, r.started_at, now()))
        on conflict (contact_id, city, source) do update
          set evidence = excluded.evidence, detected_at = excluded.detected_at;
      end if;
    end loop;
  end loop;

  for r in
    select id, company_id, contact_id, body, sent_at
    from public.wa_observed_messages
    where direction = 'in' and contact_id is not null and coalesce(body, '') <> ''
  loop
    for c in select * from public.location_city_patterns() loop
      if r.body ~* c.pattern then
        insert into public.lead_location_interest (company_id, contact_id, city, source, evidence, detected_at)
        values (r.company_id, r.contact_id, c.city_name, 'whatsapp',
                public.city_snippet(r.body, c.pattern), r.sent_at)
        on conflict (contact_id, city, source) do update
          set evidence = excluded.evidence, detected_at = excluded.detected_at;
      end if;
    end loop;
  end loop;
end
$$;

-- Which cities have demand at all, for the dashboard's chip row. Distinct
-- LEADS, not distinct rows — a lead who said "Gurgaon" three times is one
-- lead wanting Gurgaon, not three.
create or replace function public.super_location_interest_cities()
returns table (city text, leads int, last_mentioned timestamptz)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select l.city, count(distinct l.contact_id)::int, max(l.detected_at)
  from public.lead_location_interest l
  group by l.city
  order by 2 desc, 1;
end
$function$;

revoke all on function public.super_location_interest_cities() from public, anon;
grant execute on function public.super_location_interest_cities() to authenticated;

-- The pitch list itself: every lead, any company, who asked for one city.
create or replace function public.super_location_interest(p_city text default null, p_days int default null)
returns table (
  company_id uuid, company_name text, contact_id uuid, lead_name text, lead_phone text,
  stage text, rep_name text, city text, source text, evidence text, detected_at timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not public.is_super_admin() then raise exception 'super admin only'; end if;
  return query
  select l.company_id, co.name, l.contact_id, c.name, c.phone, c.stage, p.full_name,
         l.city, l.source, l.evidence, l.detected_at
  from public.lead_location_interest l
  join public.companies co on co.id = l.company_id
  join public.contacts c on c.id = l.contact_id
  left join public.profiles p on p.id = c.salesperson_id
  where (p_city is null or l.city = p_city)
    and (p_days is null or l.detected_at >= now() - make_interval(days => greatest(p_days, 1)))
  order by l.detected_at desc
  limit 2000;
end
$function$;

revoke all on function public.super_location_interest(text, int) from public, anon;
grant execute on function public.super_location_interest(text, int) to authenticated;
