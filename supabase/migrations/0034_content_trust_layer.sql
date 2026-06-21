-- Content & reviews trust layer
--
-- "Trust is built through content, reviews & AI engagement." Reps share
-- brochures / videos / reviews / testimonials with a buyer over a TRACKED link.
-- When the buyer opens it, that open is logged AND the lead is reactivated
-- (migration 0032) — so the content layer and the predictive-reactivation loop
-- become one system: send content → buyer opens → lead goes hot again.

-- ---------- the shared content library ----------
create table if not exists public.content_assets (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,
  kind        text not null default 'link'
                check (kind in ('brochure','image','video','review','testimonial','link','other')),
  title       text not null,
  url         text not null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists idx_content_assets_company on public.content_assets(company_id, active);

alter table public.content_assets enable row level security;

-- Whole company can browse the library; only admins curate it.
drop policy if exists content_assets_select on public.content_assets;
create policy content_assets_select on public.content_assets for select to authenticated
  using (company_id = public.current_company_id());

drop policy if exists content_assets_write on public.content_assets;
create policy content_assets_write on public.content_assets for all to authenticated
  using (company_id = public.current_company_id() and public.is_admin())
  with check (company_id = public.current_company_id() and public.is_admin());

-- ---------- per-send tracking ----------
create table if not exists public.content_shares (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies(id) on delete cascade,
  asset_id       uuid not null references public.content_assets(id) on delete cascade,
  contact_id     uuid references public.contacts(id) on delete set null,
  salesperson_id uuid references public.profiles(id) on delete set null,
  token          text not null unique,
  channel        text not null default 'whatsapp',
  sent_at        timestamptz not null default now(),
  opened_at      timestamptz,
  open_count     integer not null default 0
);
create index if not exists idx_content_shares_company on public.content_shares(company_id, sent_at desc);
create index if not exists idx_content_shares_contact on public.content_shares(contact_id);

alter table public.content_shares enable row level security;

-- A rep sees their own shares; admin sees all in the company. Inserts happen via
-- create_content_share() (below), not direct DML — so there is no insert policy.
drop policy if exists content_shares_select on public.content_shares;
create policy content_shares_select on public.content_shares for select to authenticated
  using (
    company_id = public.current_company_id()
    and (public.is_admin() or salesperson_id = auth.uid())
  );

-- ---------- create a tracked share, return its token ----------
-- SECURITY DEFINER: validates the asset + contact belong to the caller's company
-- and stamps the calling rep. The client builds the tracked URL as
--   <functions_url>/content-open?t=<token>
create or replace function public.create_content_share(
  p_asset_id uuid, p_contact_id uuid default null, p_channel text default 'whatsapp'
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_company uuid := public.current_company_id();
  v_token   text := replace(gen_random_uuid()::text, '-', '');
begin
  if v_company is null then raise exception 'no company'; end if;
  if not exists (select 1 from public.content_assets a where a.id = p_asset_id and a.company_id = v_company) then
    raise exception 'asset not found';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.contacts c where c.id = p_contact_id and c.company_id = v_company
  ) then
    raise exception 'contact not found';
  end if;

  insert into public.content_shares (company_id, asset_id, contact_id, salesperson_id, token, channel)
  values (v_company, p_asset_id, p_contact_id, auth.uid(), v_token, coalesce(p_channel, 'whatsapp'));
  return v_token;
end;
$$;
revoke execute on function public.create_content_share(uuid, uuid, text) from public, anon;
grant  execute on function public.create_content_share(uuid, uuid, text) to authenticated;

-- ---------- register an open (called by the public content-open function) ----------
-- Logs the open, reactivates the lead, returns the asset URL to redirect to.
create or replace function public.register_content_open(p_token text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_share public.content_shares;
  v_url   text;
begin
  select * into v_share from public.content_shares where token = p_token;
  if not found then return null; end if;

  update public.content_shares
     set opened_at = coalesce(opened_at, now()), open_count = open_count + 1
   where id = v_share.id;

  select url into v_url from public.content_assets where id = v_share.asset_id;

  -- Buyer engaging with our content is a re-engagement → wake the lead.
  if v_share.contact_id is not null then
    perform public.reactivate_lead(v_share.contact_id, 'content');
  end if;

  return v_url;
end;
$$;
-- Only the service role (the content-open edge function) calls this.
revoke execute on function public.register_content_open(text) from public, anon, authenticated;
