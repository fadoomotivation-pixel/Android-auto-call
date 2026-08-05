-- Correcting a fact the AI has learned — safely.
--
-- Trained knowledge could be deleted but never fixed, so a wrong price meant
-- deleting the whole source and re-uploading it. The obvious feature is an edit
-- box. The obvious implementation is `update knowledge_chunks set content = ...`
-- and it is WRONG in a way nothing on screen would show.
--
-- Every chunk carries an `embedding` — a 384-dimension vector of its wording,
-- and the only thing match_knowledge() actually searches. Change `content`
-- without recomputing that vector and retrieval still matches the OLD text:
-- the coach keeps quoting the price you just corrected, the list shows the new
-- one, and both are "working". That is the same silent wrongness as a report
-- inventing a payment, and it has no error message either.
--
-- So the database refuses to let the two drift.
--
--   · updated_at / updated_by record the correction, which is what the page
--     needs to show "last updated" and who by.
--   · A trigger CLEARS the embedding whenever content changes without a new
--     embedding arriving in the same statement. A null embedding is skipped by
--     match_knowledge's vector search, so the worst case becomes "this fact is
--     temporarily not retrievable" instead of "this fact is retrievable under
--     its old wording". Silent staleness is traded for loud absence.
--
-- The edit path in knowledge-ingest always sends content and embedding
-- together, so in normal use the trigger never fires. It exists for the
-- hand-written UPDATE somebody runs at 2am, and for the next developer who
-- adds a second write path without reading this comment.

alter table public.knowledge_chunks
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null;

-- Existing rows were last touched when they were created. Leaving these null
-- would make every historic fact read "never updated", which is true but
-- useless; created_at is the honest answer.
update public.knowledge_chunks set updated_at = created_at where updated_at is null;

alter table public.knowledge_chunks alter column updated_at set default now();

comment on column public.knowledge_chunks.updated_at is
  'When this fact was last corrected. Seeded from created_at for rows that predate editing.';

create or replace function public.knowledge_chunk_guard()
returns trigger
language plpgsql
as $$
begin
  -- Only on a real content change, and only when the caller did not supply a
  -- fresh vector alongside it.
  if new.content is distinct from old.content
     and new.embedding is not distinct from old.embedding then
    new.embedding := null;
  end if;
  if new.content is distinct from old.content
     or new.title is distinct from old.title then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_knowledge_chunk_guard on public.knowledge_chunks;
create trigger trg_knowledge_chunk_guard
  before update on public.knowledge_chunks
  for each row execute function public.knowledge_chunk_guard();

comment on function public.knowledge_chunk_guard() is
  'Stops content and embedding drifting apart. An UPDATE that changes the text without supplying a '
  'new vector has its embedding nulled, so the fact drops out of retrieval rather than being '
  'retrievable under its old wording.';

-- ---------- who may correct what ----------
--
-- Reading is already governed. Writing was not, because nothing wrote: the
-- table was insert-and-delete only. A company admin corrects their own
-- company's facts; global knowledge — shared into every company's brain — is
-- the platform owner's alone, exactly as deletion already is in the UI.
drop policy if exists knowledge_chunks_update on public.knowledge_chunks;
create policy knowledge_chunks_update on public.knowledge_chunks
  for update
  using (
    is_super_admin()
    or (company_id is not null and company_id = current_company_id() and is_admin())
  )
  with check (
    is_super_admin()
    or (company_id is not null and company_id = current_company_id() and is_admin())
  );
