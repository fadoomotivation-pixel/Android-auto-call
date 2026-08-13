-- 0161 — A company HAS projects, and the AI must pick one
--
-- Fanbe sells two projects. The AI has written FORTY-EIGHT names for them onto
-- the leads:
--
--   Brij Vatika → Bridge Vatika, Bridgewater, Bridge Vatica, Bridgevatica,
--                 Bridgwater, Bridgewatika, Bridgewartika, Bridge Watika,
--                 Bridgewarty Suri Kujhari, Bridgewater and Kunjwihari …
--   Shree Kunj Bihari Enclave → Kunj Vihari, Kunji Bihari, Puzh Vihari,
--                 Kunsh Vihari, Kuj Vihari, Conju Bihari, Kuzh Vihare,
--                 Kanj Vihari, Kunj Vyari, Khuzwihari, Country Bihari,
--                 Kunch Bihari, Khuj Vihar, Kunjwe, Vihar, Vihari …
--   plus outright noise: Dali, Agraam, Marban City, Khartu Shiam Ji.
--
-- Nobody can count how many leads want Brij Vatika. Every project-level number
-- in this CRM is currently meaningless.
--
-- The cause is not a bad transcriber. voice-note-ai asks the model for a
-- free-text `project` off a Hindi voice note and writes the answer straight to
-- contacts.company_name. In spoken Hindi "Brij Vatika" IS "Bridge Vatika" — no
-- transcriber will ever fix that. The fix is to stop asking the model to WRITE
-- a name and make it PICK one.
--
-- Which means a company has to have a list, and until now none existed
-- anywhere: project_sites (the geofencing pins) is completely empty, and the
-- real names sit only inside the uploaded price sheet in knowledge_chunks.
--
-- So: company_projects is that list, seeded from the brain the founder already
-- uploaded (see the projects-sync function), and snap_project() is the safety
-- net for when a model still answers off-list.

create extension if not exists pg_trgm with schema extensions;

create table if not exists public.company_projects (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  name        text not null,
  /**
   * Spellings that mean this project. Every one the founder confirms gets
   * stored here, so a mis-hearing is corrected ONCE and is exact and instant
   * from then on — the fuzzy match below is only ever for names nobody has
   * seen yet.
   */
  aliases     text[] not null default '{}',
  /** Where the row came from: 'brain' (read out of the company's own guide /
   *  price sheet) or 'admin' (typed by a human, who always wins). */
  source      text not null default 'brain',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists company_projects_unique_name
  on public.company_projects (company_id, lower(name));
create index if not exists company_projects_company_idx
  on public.company_projects (company_id);
-- Trigram index over the canonical name, so snapping stays cheap as the list grows.
create index if not exists company_projects_name_trgm
  on public.company_projects using gin (name extensions.gin_trgm_ops);

alter table public.company_projects enable row level security;

-- Readable by the company (a rep's phone needs the list to show and to pick
-- from), writable by its admins, and the super admin sees every company.
drop policy if exists company_projects_select on public.company_projects;
create policy company_projects_select on public.company_projects
  for select using (company_id = public.current_company_id() or public.is_super_admin());

drop policy if exists company_projects_write on public.company_projects;
create policy company_projects_write on public.company_projects
  for all
  using ((company_id = public.current_company_id() and public.is_admin()) or public.is_super_admin())
  with check ((company_id = public.current_company_id() and public.is_admin()) or public.is_super_admin());

drop trigger if exists trg_company_projects_updated on public.company_projects;
create trigger trg_company_projects_updated before update on public.company_projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- snap_project(company, guess) → the canonical name, or null
-- ---------------------------------------------------------------------------
-- Order matters, and it is cheapest-and-surest first:
--
--   1. exact (case-insensitive) name
--   2. a confirmed alias — the founder already ruled on this spelling
--   3. word_similarity, NOT similarity. plain similarity('kunj bihari',
--      'shree kunj bihari enclave') is low because the target is three times
--      longer; word_similarity asks "does the guess match some run of words
--      inside the name", which is exactly the question. 0.55 keeps
--      "Kunji Bihari" and drops "Marban City".
--
-- Returns NULL rather than a wrong guess. A blank project field is a gap
-- somebody can fill; a confidently wrong one is a number nobody can trust.
create or replace function public.snap_project(p_company uuid, p_guess text)
returns text
language sql
stable
security definer
set search_path to 'public', 'extensions'
as $function$
  with g as (
    select btrim(regexp_replace(coalesce(p_guess, ''), '\s+', ' ', 'g')) as q
  )
  select p.name
  from public.company_projects p, g
  where p.company_id = p_company
    and g.q <> ''
    and (
      lower(p.name) = lower(g.q)
      or exists (select 1 from unnest(p.aliases) a where lower(a) = lower(g.q))
      or extensions.word_similarity(lower(g.q), lower(p.name)) >= 0.55
    )
  order by
    (lower(p.name) = lower(g.q)) desc,
    (exists (select 1 from unnest(p.aliases) a where lower(a) = lower(g.q))) desc,
    extensions.word_similarity(lower(g.q), lower(p.name)) desc
  limit 1;
$function$;

revoke all on function public.snap_project(uuid, text) from public;
grant execute on function public.snap_project(uuid, text) to authenticated, service_role;
