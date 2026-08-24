-- =====================================================================
--  Commission portal — database schema
--
--  Paste this whole file into the Supabase SQL editor and press Run.
--  It is safe to run more than once.
--
--  What it creates:
--    profiles            one row per person, created automatically on signup
--    periods             the months you collect files for
--    submissions         one file per person per period
--    sale_rows           the individual sales read out of each file
--    commission_summary  the read-only view the dashboards are built on
--    a private storage bucket for the original files
--
--  The rules below are enforced by the database, not by the browser. A rep
--  who edits the page in dev tools still gets back only their own rows.
-- =====================================================================


-- ---------------------------------------------------------------------
--  1. TABLES
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text        not null default 'New user',
  job_title       text        not null default 'Sales',
  commission_rate numeric(6,4) not null default 0.0500 check (commission_rate >= 0 and commission_rate <= 1),
  role            text        not null default 'rep' check (role in ('owner', 'rep')),
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now()
);

comment on column public.profiles.commission_rate is
  'Stored as a fraction: 0.05 = 5%. The settings screen shows it as a percentage.';

create table if not exists public.periods (
  id         text        primary key,              -- '2026-08'
  label      text        not null,                 -- 'August 2026'
  due_at     timestamptz not null,
  is_open    boolean     not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  period_id    text        not null references public.periods (id) on delete restrict,
  file_name    text        not null,
  file_path    text        not null,
  file_size    bigint      not null default 0,
  row_count    integer     not null default 0,
  sales_total  numeric(14,2) not null default 0,
  status       text        not null default 'read' check (status in ('read', 'needs_review')),
  submitted_at timestamptz not null default now(),
  is_late      boolean     not null default false,
  days_late    integer     not null default 0
  -- deliberately no unique constraint: a person may send several files for
  -- one period, and every one of them counts towards their total
);

create table if not exists public.sale_rows (
  id            bigint generated always as identity primary key,
  submission_id uuid   not null references public.submissions (id) on delete cascade,
  user_id       uuid   not null references public.profiles (id) on delete cascade,
  period_id     text   not null references public.periods (id) on delete restrict,
  sale_date     date,
  customer      text,
  amount        numeric(14,2) not null default 0,
  rate          numeric(6,4)                       -- null = use the person's rate
);

create index if not exists sale_rows_submission_idx on public.sale_rows (submission_id);
create index if not exists sale_rows_user_period_idx on public.sale_rows (user_id, period_id);
create index if not exists submissions_user_period_idx on public.submissions (user_id, period_id);


-- Earlier versions of this file allowed only one file per person per period.
-- Dropping that constraint here so a database built then picks up the change
-- on a re-run.
do $$
declare
  r record;
begin
  for r in
    select con.conname
      from pg_constraint con
     where con.conrelid = 'public.submissions'::regclass
       and con.contype = 'u'
       and (select array_agg(a.attname::text order by a.attname)
              from pg_attribute a
             where a.attrelid = con.conrelid and a.attnum = any (con.conkey))
           = array['period_id', 'user_id']
  loop
    execute format('alter table public.submissions drop constraint %I', r.conname);
    raise notice 'Removed the one-file-per-period limit (%).', r.conname;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
--  2. WHO AM I
--
--  A policy on `profiles` that reads `profiles` would recurse forever.
--  This function is SECURITY DEFINER, so it reads the table without
--  re-entering the policies — the standard way around that trap.
-- ---------------------------------------------------------------------

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner' and is_active
  );
$$;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;


-- ---------------------------------------------------------------------
--  3. A PROFILE FOR EVERY NEW ACCOUNT
--
--  Invite people from Authentication -> Users. The very first account to
--  be created becomes the owner, so there is somebody to let the rest in.
-- ---------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    case
      when exists (select 1 from public.profiles where role = 'owner') then 'rep'
      else 'owner'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------------------
--  4. THE SERVER DECIDES WHO, WHEN, AND LATE
--
--  The browser sends a user_id and the app trusts the timestamp it gets
--  back. Neither is taken on faith here: both are overwritten, and a
--  closed period refuses the row outright.
-- ---------------------------------------------------------------------

create or replace function public.stamp_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due  timestamptz;
  v_open boolean;
begin
  select due_at, is_open into v_due, v_open
  from public.periods where id = new.period_id;

  if v_due is null then
    raise exception 'No such period: %', new.period_id;
  end if;

  if not v_open and not public.is_owner() then
    raise exception 'Period % is closed and is not accepting files.', new.period_id;
  end if;

  new.user_id      := coalesce(auth.uid(), new.user_id);   -- never the browser's word
  new.submitted_at := now();
  new.is_late      := new.submitted_at > v_due;
  new.days_late    := greatest(
    0,
    ceil(extract(epoch from (new.submitted_at - v_due)) / 86400.0)
  )::integer;

  return new;
end;
$$;

drop trigger if exists stamp_submission_before_insert on public.submissions;
create trigger stamp_submission_before_insert
  before insert on public.submissions
  for each row execute function public.stamp_submission();


-- A sale row's owner and period are taken from the file it hangs off, never
-- from the browser. Without this, a rep could post rows tagged with a
-- colleague's id: they would surface in that colleague's data and move the
-- commission total on a file that is not theirs.
create or replace function public.stamp_sale_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid;
  v_period text;
begin
  select user_id, period_id into v_user, v_period
  from public.submissions where id = new.submission_id;

  if v_user is null then
    raise exception 'No such submission: %', new.submission_id;
  end if;

  new.user_id   := v_user;
  new.period_id := v_period;
  return new;
end;
$$;

drop trigger if exists stamp_sale_row_before_insert on public.sale_rows;
create trigger stamp_sale_row_before_insert
  before insert on public.sale_rows
  for each row execute function public.stamp_sale_row();


-- ---------------------------------------------------------------------
--  5. THE SUMMARY VIEW
--
--  security_invoker makes the view obey the caller's row-level policies.
--  Without it a view runs as its creator and would hand every rep the
--  whole company's numbers.
--
--  Commission uses the rate on the sale row when the file supplied one,
--  and the person's own rate otherwise.
-- ---------------------------------------------------------------------

-- Dropped rather than replaced: CREATE OR REPLACE VIEW cannot remove or rename
-- a column, so replacing an older summary view of a different shape fails with
-- "cannot drop columns from view". A view holds no data, so this costs nothing.
drop view if exists public.commission_summary cascade;

create view public.commission_summary
with (security_invoker = true) as
select
  s.id           as submission_id,
  s.user_id,
  p.full_name,
  p.job_title,
  s.period_id,
  s.file_name,
  s.file_path,
  s.file_size,
  s.row_count,
  s.sales_total,
  s.status,
  s.submitted_at,
  s.is_late,
  s.days_late,
  round(coalesce(c.commission, 0), 2) as commission
from public.submissions s
join public.profiles p on p.id = s.user_id
left join lateral (
  select sum(r.amount * coalesce(r.rate, p.commission_rate)) as commission
  from public.sale_rows r
  where r.submission_id = s.id
) c on true;


-- ---------------------------------------------------------------------
--  6. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------

alter table public.profiles    enable row level security;
alter table public.periods     enable row level security;
alter table public.submissions enable row level security;
alter table public.sale_rows   enable row level security;

-- profiles ------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_owner());

-- Only the owner may edit anybody, including rates and roles. A rep has
-- no write path to this table at all, so a rep cannot promote themselves.
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- periods -------------------------------------------------------------
drop policy if exists periods_select on public.periods;
create policy periods_select on public.periods
  for select to authenticated
  using (true);

drop policy if exists periods_write on public.periods;
create policy periods_write on public.periods
  for all to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- submissions ---------------------------------------------------------
drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions
  for select to authenticated
  using (user_id = auth.uid() or public.is_owner());

drop policy if exists submissions_insert on public.submissions;
create policy submissions_insert on public.submissions
  for insert to authenticated
  with check (user_id = auth.uid());

-- a rep may withdraw their own file (this is how "replace" works)
drop policy if exists submissions_delete on public.submissions;
create policy submissions_delete on public.submissions
  for delete to authenticated
  using (user_id = auth.uid() or public.is_owner());

drop policy if exists submissions_update on public.submissions;
create policy submissions_update on public.submissions
  for update to authenticated
  using (public.is_owner())
  with check (public.is_owner());

-- sale_rows -----------------------------------------------------------
drop policy if exists sale_rows_select on public.sale_rows;
create policy sale_rows_select on public.sale_rows
  for select to authenticated
  using (user_id = auth.uid() or public.is_owner());

-- rows may only be attached to a submission you own
drop policy if exists sale_rows_insert on public.sale_rows;
create policy sale_rows_insert on public.sale_rows
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.submissions s
      where s.id = submission_id and s.user_id = auth.uid()
    )
  );

drop policy if exists sale_rows_delete on public.sale_rows;
create policy sale_rows_delete on public.sale_rows
  for delete to authenticated
  using (user_id = auth.uid() or public.is_owner());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.periods,
  public.submissions, public.sale_rows to authenticated;
grant select on public.commission_summary to authenticated;


-- ---------------------------------------------------------------------
--  7. FILE STORAGE
--
--  The original upload is kept so any number can be checked back to the
--  file it came from. The bucket is private; the app hands out short
--  signed links instead of public URLs.
--
--  Paths look like  <user-id>/<period-id>/<timestamp>-<filename>,
--  and the first folder is what these policies check.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('submissions', 'submissions', false)
on conflict (id) do nothing;

drop policy if exists submissions_files_insert on storage.objects;
create policy submissions_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists submissions_files_select on storage.objects;
create policy submissions_files_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'submissions'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_owner())
  );

drop policy if exists submissions_files_delete on storage.objects;
create policy submissions_files_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'submissions'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_owner())
  );


-- ---------------------------------------------------------------------
--  8. PERIODS TO COLLECT
--
--  The app can open, close and re-date periods, but it has no screen for
--  creating them — so here are two years of months, from a year back.
--  The current month is the open one. Deadline: the 5th of the month
--  after, at 17:00 UTC.
--
--  To add more later, run this block again with a wider range.
-- ---------------------------------------------------------------------

insert into public.periods (id, label, due_at, is_open)
select
  to_char(m, 'YYYY-MM'),
  to_char(m, 'FMMonth YYYY'),
  (m + interval '1 month' + interval '4 days' + interval '17 hours'),
  to_char(m, 'YYYY-MM') = to_char(date_trunc('month', now()), 'YYYY-MM')
from generate_series(
  date_trunc('month', now()) - interval '12 months',
  date_trunc('month', now()) + interval '11 months',
  interval '1 month'
) as m
on conflict (id) do nothing;


-- ---------------------------------------------------------------------
--  9. CHECK WHAT WE ENDED UP WITH
--
--  `create table if not exists` says nothing when a table is already
--  there under the same name with different columns — the app would then
--  fail later with a confusing error from whichever screen touched the
--  missing field first. This turns that into one clear message now.
-- ---------------------------------------------------------------------

do $$
declare
  r       record;
  missing text := '';
begin
  for r in
    select * from (values
      ('profiles','id'),            ('profiles','full_name'),      ('profiles','job_title'),
      ('profiles','commission_rate'),('profiles','role'),          ('profiles','is_active'),
      ('periods','id'),             ('periods','label'),           ('periods','due_at'),
      ('periods','is_open'),
      ('submissions','id'),         ('submissions','user_id'),     ('submissions','period_id'),
      ('submissions','file_name'),  ('submissions','file_path'),   ('submissions','file_size'),
      ('submissions','row_count'),  ('submissions','sales_total'), ('submissions','status'),
      ('submissions','submitted_at'),('submissions','is_late'),    ('submissions','days_late'),
      ('sale_rows','submission_id'),('sale_rows','user_id'),       ('sale_rows','period_id'),
      ('sale_rows','sale_date'),    ('sale_rows','customer'),      ('sale_rows','amount'),
      ('sale_rows','rate')
    ) as t(tbl, col)
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) then
      missing := missing || E'\n  - ' || r.tbl || '.' || r.col;
    end if;
  end loop;

  if missing <> '' then
    raise exception E'This database already holds tables from an earlier setup that do not match this schema.\n\nMissing columns:%\n\nEither add those columns, or rename the old tables out of the way\n(alter table public.<name> rename to <name>_old;) and run this file again.',
      missing;
  end if;

  raise notice 'Schema check passed — every column the app reads is present.';
end;
$$;
