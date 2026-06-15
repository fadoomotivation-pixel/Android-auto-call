-- Rep who receives inbound WhatsApp from numbers not matched to any lead.
alter table public.whatsapp_integrations
  add column if not exists default_salesperson_id uuid references public.profiles(id) on delete set null;
