-- Confirms schema.sql did what it should. Read-only — safe to run any time.
-- Paste into the Supabase SQL editor and Run.

select 'tables'    as check,
       count(*)::text || ' of 4' as result,
       string_agg(table_name, ', ' order by table_name) as detail
  from information_schema.tables
 where table_schema='public' and table_name in ('profiles','periods','submissions','sale_rows')
union all
select 'summary view',
       case when count(*)=1 then 'present' else 'MISSING' end,
       coalesce(string_agg(table_name,''),'-')
  from information_schema.views where table_schema='public' and table_name='commission_summary'
union all
select 'row level security',
       count(*)::text || ' of 4 tables protected',
       coalesce(string_agg(relname, ', ' order by relname),'-')
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relrowsecurity
   and relname in ('profiles','periods','submissions','sale_rows')
union all
select 'access policies', count(*)::text || ' active', ''
  from pg_policies where schemaname in ('public','storage')
union all
select 'storage bucket',
       case when count(*)=1 then 'present and private' else 'MISSING' end, ''
  from storage.buckets where id='submissions' and public=false
union all
select 'signup trigger',
       case when count(*)=1 then 'armed' else 'MISSING' end, ''
  from pg_trigger where tgname='on_auth_user_created' and not tgisinternal
union all
select 'periods seeded', count(*)::text || ' months', 
       coalesce((select 'open: '||label from public.periods where is_open),'none open')
  from public.periods
union all
select 'people so far', count(*)::text || ' profiles',
       coalesce(string_agg(full_name||' ('||role||')', ', '),'none yet — add your first user')
  from public.profiles;
