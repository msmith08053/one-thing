-- ============================================================
-- One Thing — database setup
-- Paste this whole file into Supabase → SQL Editor → Run.
-- Safe to re-run: it only creates things that don't exist yet
-- and replaces functions with the latest version.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tables ----------------------------------------------------------

-- One row: the household. Passcode is stored hashed, never in plain text.
create table if not exists public.settings (
  id            int primary key default 1 check (id = 1),
  passcode_hash text not null,
  name_p1       text not null default 'Person 1',
  name_p2       text not null default 'Person 2',
  tz            text not null default 'America/New_York',
  add_pref_p1   text not null default 'all' check (add_pref_p1 in ('all','high','off')),
  add_pref_p2   text not null default 'all' check (add_pref_p2 in ('all','high','off')),
  fail_count    int  not null default 0,
  fail_window   timestamptz not null default now()
);

-- Each signed-in device and who it belongs to ('shared' = wall display).
create table if not exists public.members (
  uid       uuid primary key,
  person    text not null check (person in ('p1','p2','shared')),
  joined_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) > 0),
  notes       text,
  owner       text not null check (owner in ('p1','p2','both')),
  priority    smallint not null default 1 check (priority between 0 and 2), -- 0 low, 1 normal, 2 high
  due_date    date,
  not_before  date,
  parent_id   uuid references public.tasks(id) on delete set null,          -- set when a task was split
  created_by  text check (created_by in ('p1','p2')),
  created_at  timestamptz not null default now(),
  done_at     timestamptz,
  done_by     text,
  skip_day    date                                                           -- swapped away for this day
);
create index if not exists tasks_open_idx on public.tasks (owner) where done_at is null;

-- Each person's current "one thing" (the non-urgent pick).
create table if not exists public.picks (
  person  text primary key check (person in ('p1','p2')),
  task_id uuid references public.tasks(id) on delete set null,
  since   date
);
insert into public.picks (person) values ('p1'), ('p2') on conflict do nothing;

-- One swap per person per day.
create table if not exists public.swaps (
  person text not null,
  day    date not null,
  primary key (person, day)
);

-- Phone notification subscriptions.
create table if not exists public.push_subs (
  endpoint   text primary key,
  person     text not null check (person in ('p1','p2','shared')),
  p256dh     text not null,
  auth       text not null,
  uid        uuid,
  created_at timestamptz not null default now()
);

-- ---------- Helpers ---------------------------------------------------------

create or replace function public.tz() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select tz from settings where id = 1), 'America/New_York')
$$;

-- The household "day" starts at 4 a.m. local time.
create or replace function public.hday(ts timestamptz) returns date
language sql stable set search_path = public as $$
  select ((ts at time zone public.tz()) - interval '4 hours')::date
$$;

create or replace function public.household_day() returns date
language sql stable set search_path = public as $$
  select public.hday(now())
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where uid = auth.uid())
$$;

create or replace function public.my_person() returns text
language sql stable security definer set search_path = public as $$
  select person from members where uid = auth.uid()
$$;

-- Urgent = High priority, overdue, or due within 2 days.
create or replace function public.is_urgent(x public.tasks, d date) returns boolean
language sql immutable as $$
  select x.priority = 2 or (x.due_date is not null and x.due_date <= d + 2)
$$;

-- Can this task show up today?
create or replace function public.eligible(x public.tasks, d date) returns boolean
language sql stable set search_path = public as $$
  select x.done_at is null
     and (x.not_before is null or x.not_before <= d)
     and (x.skip_day  is null or x.skip_day <> d)
     and not exists (select 1 from tasks c where c.parent_id = x.id and c.done_at is null)
$$;

-- Next non-urgent task for a person: Normal before Low, soonest due, then random.
create or replace function public.pick_candidate(p text, d date) returns uuid
language sql volatile set search_path = public as $$
  select x.id from tasks x
   where x.owner in (p, 'both')
     and public.eligible(x, d)
     and not public.is_urgent(x, d)
     and not exists (select 1 from picks o where o.person <> p and o.task_id = x.id)
   order by x.priority desc, x.due_date asc nulls last, random()
   limit 1
$$;

-- ---------- Today's board (core logic) -------------------------------------

create or replace function public._today(p text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  d        date := household_day();
  other    text := case when p = 'p1' then 'p2' else 'p1' end;
  pk       picks%rowtype;
  t        tasks%rowtype;
  n_urgent int;
  items    jsonb := '[]'::jsonb;
  pick_open boolean := false;
  can_another boolean;
begin
  if p not in ('p1','p2') then raise exception 'unknown person %', p; end if;

  select * into pk from picks where person = p for update;

  -- Is the current pick still valid?
  if pk.task_id is not null then
    select * into t from tasks where id = pk.task_id;
    if not found
       or t.owner not in (p, 'both')
       or (t.done_at is not null and hday(t.done_at) < d)
       or (t.done_at is null and (not eligible(t, d) or is_urgent(t, d))) then
      update picks set task_id = null, since = null where person = p;
      pk.task_id := null;
    end if;
  end if;

  select count(*) into n_urgent from tasks x
   where x.owner in (p, 'both') and eligible(x, d) and is_urgent(x, d);

  -- No urgent tasks and no pick yet today → choose one.
  if pk.task_id is null and n_urgent = 0 then
    pk.task_id := pick_candidate(p, d);
    if pk.task_id is not null then
      update picks set task_id = pk.task_id, since = d where person = p;
      pk.since := d;
    end if;
  end if;

  -- 1) All urgent tasks
  items := items || coalesce((
    select jsonb_agg(to_jsonb(x) || jsonb_build_object('kind','urgent','days', d - hday(x.created_at))
                     order by x.priority desc, x.due_date asc nulls last, x.created_at)
      from tasks x
     where x.owner in (p, 'both') and eligible(x, d) and is_urgent(x, d)), '[]'::jsonb);

  -- 2) The one normal/low pick (only when nothing is urgent)
  if pk.task_id is not null then
    select * into t from tasks where id = pk.task_id;
    if t.done_at is null then
      pick_open := true;
      if n_urgent = 0 then
        items := items || jsonb_build_array(to_jsonb(t) || jsonb_build_object('kind','pick','days', d - pk.since));
      end if;
    end if;
  end if;

  -- 3) A "both of us" task the partner picked shows on this card too
  select x.* into t from picks o join tasks x on x.id = o.task_id
   where o.person = other and x.owner = 'both' and x.done_at is null;
  if found and not items @> jsonb_build_array(jsonb_build_object('id', t.id)) then
    items := items || jsonb_build_array(to_jsonb(t) || jsonb_build_object('kind','shared','days', 0));
  end if;

  -- 4) Finished today (shown with a check mark)
  items := items || coalesce((
    select jsonb_agg(to_jsonb(x) || jsonb_build_object('kind','done','days',0) order by x.done_at)
      from tasks x
     where x.owner in (p, 'both') and x.done_at is not null and hday(x.done_at) = d), '[]'::jsonb);

  can_another := n_urgent = 0 and not pick_open and pick_candidate(p, d) is not null;

  return jsonb_build_object(
    'day', d,
    'person', p,
    'items', items,
    'swap_used', exists (select 1 from swaps where person = p and day = d),
    'can_another', can_another,
    'open_count', (select count(*) from tasks x where x.owner in (p,'both') and x.done_at is null)
  );
end $$;

-- Everything the app needs for the Today screen in one call.
create or replace function public.get_board() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := household_day(); s settings%rowtype;
begin
  if not is_member() then raise exception 'not a member of this household'; end if;
  select * into s from settings where id = 1;
  return jsonb_build_object(
    'day', d,
    'p1', _today('p1'),
    'p2', _today('p2'),
    'names', jsonb_build_object('p1', s.name_p1, 'p2', s.name_p2),
    'week_done', (select count(*) from tasks
                   where done_at is not null
                     and hday(done_at) >= date_trunc('week', d)::date)
  );
end $$;

-- ---------- Actions ---------------------------------------------------------

create or replace function public.complete_task(p_task uuid, p_by text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update tasks set done_at = now(), done_by = p_by where id = p_task and done_at is null;
  return get_board();
end $$;

create or replace function public.uncomplete_task(p_task uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update tasks set done_at = null, done_by = null where id = p_task;
  return get_board();
end $$;

-- ✗ = "not today". One per person per day.
create or replace function public.swap_task(p text, p_task uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := household_day(); t tasks%rowtype; other_name text;
begin
  if not is_member() then raise exception 'not a member'; end if;
  if exists (select 1 from swaps where person = p and day = d) then
    return jsonb_build_object('error', 'Today''s swap is already used.');
  end if;
  select * into t from tasks where id = p_task;
  if not found or t.done_at is not null or t.owner not in (p, 'both') then
    return jsonb_build_object('error', 'That task can''t be swapped.');
  end if;
  if exists (select 1 from picks where person <> p and task_id = t.id) then
    select case when p = 'p1' then name_p2 else name_p1 end into other_name from settings;
    return jsonb_build_object('error', 'That one is on ' || other_name || '''s card.');
  end if;
  update tasks set skip_day = d where id = t.id;
  update picks set task_id = null, since = null where person = p and task_id = t.id;
  insert into swaps (person, day) values (p, d);
  return get_board();
end $$;

-- "Give me another" after finishing today's task.
create or replace function public.next_task(p text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := household_day(); cur uuid; cand uuid;
begin
  if not is_member() then raise exception 'not a member'; end if;
  perform _today(p);  -- make sure state is current
  select task_id into cur from picks where person = p;
  if cur is not null and exists (select 1 from tasks where id = cur and done_at is null) then
    return get_board();  -- still have an open one
  end if;
  cand := pick_candidate(p, d);
  if cand is not null then
    update picks set task_id = cand, since = d where person = p;
  end if;
  return get_board();
end $$;

-- Stuck-task nudge: replace a big task with a smaller first step.
create or replace function public.split_task(p text, p_task uuid, p_title text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := household_day(); t tasks%rowtype; child uuid;
begin
  if not is_member() then raise exception 'not a member'; end if;
  select * into t from tasks where id = p_task;
  if not found then return jsonb_build_object('error','Task not found.'); end if;
  insert into tasks (title, owner, priority, due_date, parent_id, created_by)
  values (btrim(p_title), t.owner, t.priority, t.due_date, t.id,
          case when p in ('p1','p2') then p end)
  returning id into child;
  update picks set task_id = child, since = d where person = p and task_id = t.id;
  return get_board();
end $$;

-- ---------- Household setup & membership -----------------------------------

create or replace function public.household_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'setup',  exists (select 1 from settings),
    'member', is_member(),
    'person', my_person(),
    'names',  case when is_member() then
                (select jsonb_build_object('p1', name_p1, 'p2', name_p2) from settings) end,
    'add_pref', case when is_member() then
                (select jsonb_build_object('p1', add_pref_p1, 'p2', add_pref_p2) from settings) end
  )
$$;

create or replace function public.setup_household(p_passcode text, p_name1 text, p_name2 text, p_me text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from settings) then
    return jsonb_build_object('error', 'This household is already set up. Use Join instead.');
  end if;
  if length(coalesce(p_passcode,'')) < 6 then
    return jsonb_build_object('error', 'Passcode needs at least 6 characters.');
  end if;
  insert into settings (id, passcode_hash, name_p1, name_p2)
  values (1, crypt(p_passcode, gen_salt('bf')),
          coalesce(nullif(btrim(p_name1),''),'Person 1'),
          coalesce(nullif(btrim(p_name2),''),'Person 2'));
  insert into members (uid, person) values (auth.uid(), p_me)
  on conflict (uid) do update set person = excluded.person;
  return household_status();
end $$;

create or replace function public.join_household(p_passcode text, p_person text)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare s settings%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into s from settings where id = 1 for update;
  if not found then return jsonb_build_object('error', 'No household yet. Use Set up instead.'); end if;
  if s.fail_window > now() - interval '1 hour' and s.fail_count >= 20 then
    return jsonb_build_object('error', 'Too many wrong tries. Wait an hour and try again.');
  end if;
  if s.passcode_hash <> crypt(coalesce(p_passcode,''), s.passcode_hash) then
    update settings set
      fail_count  = case when fail_window > now() - interval '1 hour' then fail_count + 1 else 1 end,
      fail_window = case when fail_window > now() - interval '1 hour' then fail_window else now() end
    where id = 1;
    return jsonb_build_object('error', 'Wrong passcode.');
  end if;
  insert into members (uid, person) values (auth.uid(), p_person)
  on conflict (uid) do update set person = excluded.person;
  return household_status();
end $$;

create or replace function public.set_person(p_person text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update members set person = p_person where uid = auth.uid();
  update push_subs set person = p_person where uid = auth.uid();
  return household_status();
end $$;

create or replace function public.update_names(p_name1 text, p_name2 text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update settings set
    name_p1 = coalesce(nullif(btrim(p_name1),''), name_p1),
    name_p2 = coalesce(nullif(btrim(p_name2),''), name_p2)
  where id = 1;
  return household_status();
end $$;

create or replace function public.set_add_pref(p_pref text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare me text := my_person();
begin
  if not is_member() then raise exception 'not a member'; end if;
  if me = 'p1' then update settings set add_pref_p1 = p_pref where id = 1;
  elsif me = 'p2' then update settings set add_pref_p2 = p_pref where id = 1;
  end if;
  return household_status();
end $$;

create or replace function public.change_passcode(p_old text, p_new text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare s settings%rowtype;
begin
  if not is_member() then raise exception 'not a member'; end if;
  select * into s from settings where id = 1;
  if s.passcode_hash <> crypt(coalesce(p_old,''), s.passcode_hash) then
    return jsonb_build_object('error','Current passcode is wrong.');
  end if;
  if length(coalesce(p_new,'')) < 6 then
    return jsonb_build_object('error','New passcode needs at least 6 characters.');
  end if;
  update settings set passcode_hash = crypt(p_new, gen_salt('bf')) where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Security (Row Level Security) ----------------------------------

alter table public.settings  enable row level security;   -- no direct access; functions only
alter table public.members   enable row level security;   -- no direct access; functions only
alter table public.swaps     enable row level security;   -- no direct access; functions only
alter table public.tasks     enable row level security;
alter table public.picks     enable row level security;
alter table public.push_subs enable row level security;

drop policy if exists tasks_members on public.tasks;
create policy tasks_members on public.tasks for all to authenticated
  using (public.is_member()) with check (public.is_member());

drop policy if exists picks_read on public.picks;
create policy picks_read on public.picks for select to authenticated
  using (public.is_member());

drop policy if exists subs_members on public.push_subs;
create policy subs_members on public.push_subs for all to authenticated
  using (public.is_member()) with check (public.is_member());

-- Internal function: only the notification sender (service role) may call it directly.
revoke all on function public._today(text) from public, anon, authenticated;
grant execute on function public._today(text) to service_role;

-- ---------- Live sync -------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.tasks;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.picks;
exception when duplicate_object then null; end $$;
