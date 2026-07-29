-- Ready-made messages were written as if every telecaller were a man:
-- "main ... baat kar raha hoon", "details bataunga". Most of the reps on this
-- platform are women, so the very first line the buyer reads is wrong about the
-- person writing it.
--
-- Hindi conjugates the FIRST person, so this is about the rep, not the lead. The
-- rep says which form is theirs — it is never guessed from a name, because a
-- guess gets it wrong for real people. Unset stays neutral: the plural form
-- ("kar rahe hain", "batayenge") is ordinary polite business Hindi and reads
-- correctly for everyone, so nobody is misgendered by a default.
alter table public.profiles
  add column if not exists speaks_as text;

alter table public.profiles
  drop constraint if exists profiles_speaks_as_check;
alter table public.profiles
  add constraint profiles_speaks_as_check
  check (speaks_as is null or speaks_as in ('f', 'm', 'neutral'));

comment on column public.profiles.speaks_as is
  'How this rep refers to themselves in generated Hindi/Hinglish messages: '
  'f = kar rahi hoon, m = kar raha hoon, neutral/null = kar rahe hain.';
