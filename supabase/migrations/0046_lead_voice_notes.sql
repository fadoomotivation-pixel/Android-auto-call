-- ============================================================
-- Lead voice notes
-- After a call the telecaller records, in their own voice, how the
-- call went. Playable in the app AND in the admin dashboard, with the
-- Groq AI twist: auto transcript + summary + suggested stage.
-- Audio lives in the private 'voice-notes' storage bucket at
--   <company_id>/<contact_id>/<uuid>.m4a
-- ============================================================

create table if not exists public.lead_voice_notes (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references public.companies(id) on delete cascade,
  contact_id            uuid not null references public.contacts(id)  on delete cascade,
  actor_id              uuid references public.profiles(id) on delete set null,
  actor_name            text,
  audio_path            text not null,
  duration_seconds      int not null default 0,
  transcript            text,
  summary               text,
  suggested_disposition text,
  ai_status             text not null default 'pending'
                          check (ai_status in ('pending','processing','ready','failed')),
  created_at            timestamptz not null default now()
);
create index if not exists idx_voice_notes_contact on public.lead_voice_notes(contact_id, created_at desc);
create index if not exists idx_voice_notes_company on public.lead_voice_notes(company_id);

alter table public.lead_voice_notes enable row level security;

drop policy if exists voice_notes_select on public.lead_voice_notes;
create policy voice_notes_select on public.lead_voice_notes for select to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.is_admin()
      or actor_id = auth.uid()
      or exists (select 1 from public.contacts c where c.id = contact_id and c.salesperson_id = auth.uid())
    )
  );

drop policy if exists voice_notes_insert on public.lead_voice_notes;
create policy voice_notes_insert on public.lead_voice_notes for insert to authenticated
  with check (company_id = public.current_company_id() and actor_id = auth.uid());

drop policy if exists voice_notes_delete on public.lead_voice_notes;
create policy voice_notes_delete on public.lead_voice_notes for delete to authenticated
  using (company_id = public.current_company_id() and (public.is_admin() or actor_id = auth.uid()));

-- ---------- storage bucket + policies ----------
insert into storage.buckets (id, name, public)
  values ('voice-notes', 'voice-notes', false)
  on conflict (id) do nothing;

-- Company-scoped access: the first folder of the object path is the company id.
drop policy if exists voice_notes_storage_insert on storage.objects;
create policy voice_notes_storage_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

drop policy if exists voice_notes_storage_select on storage.objects;
create policy voice_notes_storage_select on storage.objects for select to authenticated
  using (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );

drop policy if exists voice_notes_storage_delete on storage.objects;
create policy voice_notes_storage_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'voice-notes'
    and (storage.foldername(name))[1] = public.current_company_id()::text
  );
