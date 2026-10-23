-- A founder picks whose day is in their Daily Pulse.
--
-- A founder row (salesperson_id null) got the whole team, always. Two founders
-- of one company often split the team — one runs the Noida floor, one runs the
-- field reps — and each wants only their own people at 7 PM, with totals that
-- add up to the people they are actually reading about.
--
-- include_reps: null = everyone (as before). A list = only those telecallers;
-- pulse-broadcast filters the reps and re-adds the totals from them, so "Calls
-- 40" means the 40 calls of the people listed, not the whole company's.
-- Company-wide sections (objections, promises) stay company-wide.
--
-- Only meaningful on a founder row. A telecaller row always gets that one
-- person's own day and ignores this.

alter table public.pulse_subscribers
  add column if not exists include_reps uuid[];

comment on column public.pulse_subscribers.include_reps is
  'Founder rows only: which telecallers (profile ids) this recipient''s Daily Pulse covers. Null = the whole team.';
