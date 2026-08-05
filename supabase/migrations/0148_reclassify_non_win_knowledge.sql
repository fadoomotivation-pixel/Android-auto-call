-- Relabel the "win" lessons that were never wins.
--
-- win-harvest defined a win as reaching site_visit, so every chunk filed under
-- source_kind='win' came from a lead that had not closed - 28 of them, against
-- zero contacts that have ever been booked or token-paid. Each lesson was
-- distilled from real calls and is genuinely useful; what was wrong is the
-- label, and the label is what the coach quotes back to a rep.
--
-- So: relabel, never delete. Content and embedding are untouched, so retrieval
-- is unaffected and nothing needs re-embedding. Only the kind and the
-- human-facing title change, and only where the lead is not actually won.
update public.knowledge_chunks k
set source_kind = 'progress',
    title = case when k.title like 'Win: %' then 'Progress: ' || substring(k.title from 6) else k.title end
from public.contacts c
where k.source_kind = 'win'
  and k.source_id = 'win:' || c.id::text
  and not public.stage_is_won(c.stage);

-- Chunks whose lead has since been deleted cannot be verified as wins, and an
-- unverifiable "this is how you close" is exactly the claim to stop making.
update public.knowledge_chunks k
set source_kind = 'progress',
    title = case when k.title like 'Win: %' then 'Progress: ' || substring(k.title from 6) else k.title end
where k.source_kind = 'win'
  and k.source_id like 'win:%'
  and not exists (select 1 from public.contacts c where k.source_id = 'win:' || c.id::text);
