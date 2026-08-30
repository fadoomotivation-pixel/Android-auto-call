-- The evidence line on Location demand was picking whichever text came first
-- in "summary + transcript" concatenated together, which meant a call with no
-- summary yet fell back to the RAW transcript — Whisper-grade Hindi/Hinglish
-- ASR, unpunctuated, sometimes visibly garbled ("Sanctus Sector Sanctus" for
-- what a human would read as something else entirely). The AI-written summary
-- is already clean English; the fix is to prefer it whenever it actually
-- mentions the city, and only fall back to the transcript when the summary
-- doesn't — not to try to auto-fix ASR noise, which risks mangling text worse
-- than it started (tested and rejected: a word-de-duplication regex looked
-- promising on repeated English filler but silently corrupted real words on
-- this dataset's mixed Hindi/English text — \w does not recognise Devanagari
-- under this database's locale, so "Noida and Jewar" came back "Noidand
-- Jewar". Shipping that would have been worse than the problem).

-- The 2-arg version becomes ambiguous the moment a 3-arg overload with a
-- default exists (Postgres cannot tell which call the 2-arg call site means),
-- so the old signature has to go rather than be left to CREATE OR REPLACE.
drop function if exists public.city_snippet(text, text);

create or replace function public.city_snippet(p_text text, p_pattern text, p_window int default 45)
returns text
language sql
immutable
as $function$
  select regexp_replace(
    (regexp_matches(p_text, '.{0,' || greatest(p_window, 0) || '}(?:' || p_pattern || ').{0,' || greatest(p_window, 0) || '}', 'i'))[1],
    '\s+', ' ', 'g'
  );
$function$;

-- Tries the clean source first, falls back to the raw one only when the city
-- was never actually said in the summary.
create or replace function public.city_evidence(p_summary text, p_transcript text, p_pattern text)
returns text
language sql
immutable
as $function$
  select coalesce(
    case when p_summary is not null and p_summary ~* p_pattern
      then public.city_snippet(p_summary, p_pattern) end,
    case when p_transcript is not null and p_transcript ~* p_pattern
      then public.city_snippet(p_transcript, p_pattern) end
  );
$function$;

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
              public.city_evidence(new.summary, new.transcript, c.pattern),
              coalesce(new.ended_at, new.started_at, now()))
      on conflict (contact_id, city, source) do update
        set evidence = excluded.evidence, detected_at = excluded.detected_at, company_id = excluded.company_id;
    end if;
  end loop;
  return new;
end
$function$;

-- Re-derive evidence for everything already mined — this is a pure re-read of
-- text already stored, same as the original backfill, just with the better
-- source-preference logic now in place.
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
                public.city_evidence(r.summary, r.transcript, c.pattern),
                coalesce(r.ended_at, r.started_at, now()))
        on conflict (contact_id, city, source) do update
          set evidence = excluded.evidence, detected_at = excluded.detected_at;
      end if;
    end loop;
  end loop;
end
$$;
