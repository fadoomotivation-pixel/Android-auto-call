-- ============================================================
-- AI harmony: the voice-note AI and the call-recording AI must
-- never fight over the same lead.
--
-- Conflict found: the recording AI respects a follow-up "set after the call
-- started" by checking follow_ups.created_at — but when the voice-note AI (or
-- the rep) MOVES an existing follow-up, created_at stays old, so the recording
-- AI would silently overwrite the newer spoken plan. follow_ups now carries
-- updated_at (touch trigger) and the recording AI checks the latest touch.
--
-- Also: both AIs append fact-lines to contacts.notes with read-modify-write,
-- which can drop one writer's line under concurrency. append_contact_note()
-- makes the append atomic and dedup-safe; both AIs now use it.
-- ============================================================

alter table public.follow_ups
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_follow_ups()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_follow_ups_touch on public.follow_ups;
create trigger trg_follow_ups_touch
  before update on public.follow_ups
  for each row execute function public.touch_follow_ups();

-- Atomic, dedup-safe append of one line to a lead's notes. No-op when the
-- exact line is already present, so AI re-runs never stack duplicates.
create or replace function public.append_contact_note(p_contact uuid, p_line text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_contact is null or p_line is null or length(trim(p_line)) < 2 then
    return;
  end if;
  update public.contacts
  set notes = case when coalesce(notes, '') = '' then p_line
                   else notes || E'\n' || p_line end
  where id = p_contact
    and (notes is null or position(p_line in notes) = 0);
end $$;

revoke all on function public.append_contact_note(uuid, text) from public, anon, authenticated;
grant execute on function public.append_contact_note(uuid, text) to service_role;
