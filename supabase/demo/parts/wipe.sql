-- ── 2. Start clean: delete any earlier copy of the demo company's rows ──
do $$
declare
  v_demo constant uuid := 'de000000-0000-4000-8000-000000000001';
  r record;
  v_blocked int;
  v_pass int := 0;
begin
  if exists (select 1 from public.companies where id = v_demo and not is_demo) then
    raise exception 'Company % exists and is not a demo company. Nothing was changed.', v_demo;
  end if;
  -- A phone signed in as a demo telecaller would otherwise get a push for
  -- every "hot" demo lead written below. The app registers again on launch.
  if to_regclass('public.device_tokens') is not null then
    execute 'delete from public.device_tokens where user_id = any($1)'
      using array['de000000-0000-4000-8000-0000000000a1', 'de000000-0000-4000-8000-0000000000a2',
                  'de000000-0000-4000-8000-0000000000a3']::uuid[];
  end if;
  loop
    v_pass := v_pass + 1;
    v_blocked := 0;
    for r in
      select c.table_name
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema and t.table_name = c.table_name
       where c.table_schema = 'public' and c.column_name = 'company_id'
         and t.table_type = 'BASE TABLE'
         and c.table_name not in ('companies', 'profiles')
    loop
      begin
        execute format('delete from public.%I where company_id = $1', r.table_name) using v_demo;
      exception when foreign_key_violation then
        v_blocked := v_blocked + 1;
      end;
    end loop;
    exit when v_blocked = 0;
    if v_pass >= 6 then
      raise exception 'Could not clear the old demo rows; % table(s) still blocked.', v_blocked;
    end if;
  end loop;
end $$;

