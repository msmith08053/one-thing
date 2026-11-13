-- ============================================================
-- One Thing — upgrade 004: launch-ready foundation
--  · Many private households in one database, each with its own join code
--  · Your existing household is moved over automatically (nothing is lost)
--  · Pins (up to 3 per person) replace "show every urgent task"
--  · Fixes: no negative Stars, no double grocery reward, per-person swaps on
--    shared tasks, wall adds count toward the list owner's cap
--  · Exactly-once 7 a.m. / 7 p.m. sends and a "time's up" push for the timer
--
-- Run AFTER 003. Supabase → SQL Editor → Run. Safe to re-run.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Households --------------------------------------------------------
create table if not exists public.households (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  name_p1      text not null default 'Person 1',
  name_p2      text not null default 'Person 2',
  tz           text not null default 'America/New_York',
  add_pref_p1  text not null default 'all' check (add_pref_p1 in ('all','high','off')),
  add_pref_p2  text not null default 'all' check (add_pref_p2 in ('all','high','off')),
  last_morning date,
  last_evening date,
  created_at   timestamptz not null default now()
);

create table if not exists public.join_fails (
  uid   uuid primary key,
  n     int not null default 0,
  since timestamptz not null default now()
);

-- Join codes: 8 characters, no look-alikes (no 0/O, 1/I/L), shown as ABCD-EF23.
create or replace function public.new_code() returns text
language plpgsql volatile set search_path = public, extensions as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(8); c text := ''; i int;
begin
  for i in 0..7 loop
    c := c || substr(a, 1 + (get_byte(b, i) % length(a)), 1);
    if i = 3 then c := c || '-'; end if;
  end loop;
  return c;
end $$;

-- ---------- New columns ----------------------------------------------------------
alter table public.members add column if not exists household_id uuid references public.households(id) on delete cascade;
do $$ declare t text; begin
  foreach t in array array['tasks','picks','swaps','push_subs','ledger','owned','together','shop_items','shop_usual','trips'] loop
    execute format('alter table public.%I add column if not exists household_id uuid references public.households(id) on delete cascade', t);
  end loop;
end $$;
alter table public.tasks add column if not exists pinned_by text;
alter table public.tasks add column if not exists pinned_at timestamptz;
alter table public.tasks add column if not exists return_pin_for text;   -- High task paused → re-pinned for this person on its day
alter table public.tasks add column if not exists skip_by text;          -- swapped by this person only (shared tasks)
alter table public.tasks add column if not exists trip_settled boolean not null default false;
alter table public.together add column if not exists end_notified boolean not null default false;

-- ---------- Move the existing household over -----------------------------------
do $$
declare h uuid; s record; t text;
begin
  if to_regclass('public.settings') is not null
     and exists (select 1 from public.settings)
     and not exists (select 1 from public.households) then
    select * into s from public.settings where id = 1;
    insert into public.households (code, name_p1, name_p2, tz, add_pref_p1, add_pref_p2)
    values (public.new_code(), s.name_p1, s.name_p2, s.tz, s.add_pref_p1, s.add_pref_p2)
    returning id into h;
    update public.members set household_id = h where household_id is null;
    foreach t in array array['tasks','picks','swaps','push_subs','ledger','owned','together','shop_items','shop_usual','trips'] loop
      execute format('update public.%I set household_id = $1 where household_id is null', t) using h;
    end loop;
  end if;
end $$;

-- Rows with no household are leftovers from a fresh install (e.g. the default pick rows): remove.
do $$ declare t text; begin
  foreach t in array array['tasks','picks','swaps','push_subs','ledger','owned','together','shop_items','shop_usual','trips'] loop
    execute format('delete from public.%I where household_id is null', t);
    execute format('alter table public.%I alter column household_id set not null', t);
  end loop;
end $$;

-- Keys are now per household.
alter table public.picks      drop constraint if exists picks_pkey;
alter table public.picks      add  constraint picks_pkey primary key (household_id, person);
alter table public.swaps      drop constraint if exists swaps_pkey;
alter table public.swaps      add  constraint swaps_pkey primary key (household_id, person, day);
alter table public.owned      drop constraint if exists owned_item_id_key;
alter table public.owned      drop constraint if exists owned_spot_key;
alter table public.owned      drop constraint if exists owned_hh_item_key;
alter table public.owned      drop constraint if exists owned_hh_spot_key;
alter table public.owned      add  constraint owned_hh_item_key unique (household_id, item_id);
alter table public.owned      add  constraint owned_hh_spot_key unique (household_id, spot);
alter table public.together   drop constraint if exists together_id_check;
alter table public.together   drop constraint if exists together_pkey;
alter table public.together   add  constraint together_pkey primary key (household_id);
alter table public.shop_usual drop constraint if exists shop_usual_pkey;
alter table public.shop_usual add  constraint shop_usual_pkey primary key (household_id, list, key);
alter table public.ledger     drop constraint if exists ledger_kind_check;
alter table public.ledger     add  constraint ledger_kind_check check (kind in ('add','done','buy','trip','note','bonus','adjust'));
create index if not exists tasks_hh_open_idx on public.tasks (household_id) where done_at is null;
create index if not exists ledger_hh_idx on public.ledger (household_id);

-- ---------- Whose household is this? ---------------------------------------------
create or replace function public.my_hh() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from members where uid = auth.uid()
$$;

-- The household in scope: the signed-in member's, or (for the notification
-- sender only, which has no user) the one it set for this transaction.
create or replace function public.current_hh() returns uuid
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then nullif(current_setting('app.hh', true), '')::uuid
              else (select household_id from members where uid = auth.uid()) end
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where uid = auth.uid() and household_id is not null)
$$;

create or replace function public.my_person() returns text
language sql stable security definer set search_path = public as $$
  select person from members where uid = auth.uid()
$$;

create or replace function public.tz() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select tz from households where id = public.current_hh()), 'America/New_York')
$$;

-- New rows land in the right household automatically.
do $$ declare t text; begin
  foreach t in array array['tasks','push_subs','ledger','owned','shop_items','shop_usual','trips','swaps'] loop
    execute format('alter table public.%I alter column household_id set default public.current_hh()', t);
  end loop;
end $$;

-- ---------- Join / create / settings ---------------------------------------------
drop function if exists public.setup_household(text, text, text, text);
drop function if exists public.change_passcode(text, text);

create or replace function public.household_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'member', h.id is not null,
    'person', m.person,
    'household', h.id,
    'code', h.code,
    'names', case when h.id is not null then jsonb_build_object('p1', h.name_p1, 'p2', h.name_p2) end,
    'add_pref', case when h.id is not null then jsonb_build_object('p1', h.add_pref_p1, 'p2', h.add_pref_p2) end)
  from (select 1) x
  left join members m on m.uid = auth.uid()
  left join households h on h.id = m.household_id
$$;

create or replace function public.create_household(p_name1 text, p_name2 text, p_me text, p_tz text default null)
returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare h uuid; c text; tries int := 0;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if is_member() then return jsonb_build_object('error', 'This device is already in a household.'); end if;
  loop
    c := new_code(); tries := tries + 1;
    exit when not exists (select 1 from households where code = c) or tries > 20;
  end loop;
  insert into households (code, name_p1, name_p2, tz)
  values (c, coalesce(nullif(btrim(p_name1), ''), 'Person 1'), coalesce(nullif(btrim(p_name2), ''), 'Person 2'),
          coalesce(nullif(btrim(p_tz), ''), 'America/New_York'))
  returning id into h;
  insert into picks (household_id, person) values (h, 'p1'), (h, 'p2');
  insert into together (household_id, id) values (h, 1);
  insert into members (uid, person, household_id) values (auth.uid(), coalesce(p_me, 'p1'), h)
  on conflict (uid) do update set person = excluded.person, household_id = excluded.household_id;
  return household_status();
end $$;

create or replace function public.join_household(p_passcode text, p_person text)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare want text; h uuid; f join_fails%rowtype;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into f from join_fails where uid = auth.uid();
  if found and f.since > now() - interval '1 hour' and f.n >= 10 then
    return jsonb_build_object('error', 'Too many tries. Wait an hour and try again.');
  end if;
  want := upper(regexp_replace(coalesce(p_passcode, ''), '[^A-Za-z0-9]', '', 'g'));
  if length(want) = 8 then want := substr(want, 1, 4) || '-' || substr(want, 5, 4); end if;
  select id into h from households where households.code = want;
  if h is null then
    insert into join_fails (uid, n, since) values (auth.uid(), 1, now())
    on conflict (uid) do update set
      n = case when join_fails.since > now() - interval '1 hour' then join_fails.n + 1 else 1 end,
      since = case when join_fails.since > now() - interval '1 hour' then join_fails.since else now() end;
    return jsonb_build_object('error', 'That code didn''t work. Check it and try again.');
  end if;
  insert into members (uid, person, household_id) values (auth.uid(), coalesce(p_person, 'shared'), h)
  on conflict (uid) do update set person = excluded.person, household_id = excluded.household_id;
  delete from join_fails where uid = auth.uid();
  return household_status();
end $$;

create or replace function public.regenerate_code() returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare c text;
begin
  if not is_member() then raise exception 'not a member'; end if;
  loop c := new_code(); exit when not exists (select 1 from households where code = c); end loop;
  update households set code = c where id = my_hh();
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
  update households set
    name_p1 = coalesce(nullif(btrim(p_name1), ''), name_p1),
    name_p2 = coalesce(nullif(btrim(p_name2), ''), name_p2)
  where id = my_hh();
  return household_status();
end $$;

create or replace function public.set_add_pref(p_pref text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare me text := my_person();
begin
  if not is_member() then raise exception 'not a member'; end if;
  if me = 'p1' then update households set add_pref_p1 = p_pref where id = my_hh();
  elsif me = 'p2' then update households set add_pref_p2 = p_pref where id = my_hh(); end if;
  return household_status();
end $$;

-- ---------- Task selection helpers -------------------------------------------------
create or replace function public.eligible(x public.tasks, d date) returns boolean
language sql stable set search_path = public as $$
  select x.done_at is null
     and (x.not_before is null or x.not_before <= d)
     and not exists (select 1 from tasks c where c.parent_id = x.id and c.done_at is null)
$$;

create or replace function public.skipped(x public.tasks, d date, p text) returns boolean
language sql immutable as $$
  select x.skip_day is not null and x.skip_day = d and (x.skip_by is null or x.skip_by = p)
$$;

-- Urgent tasks go to the front of the line; then Normal before Low, soonest due, random.
create or replace function public.pick_candidate(p text, d date) returns uuid
language sql volatile set search_path = public as $$
  select x.id from tasks x
   where x.household_id = public.current_hh()
     and x.owner in (p, 'both')
     and public.eligible(x, d)
     and not public.skipped(x, d, p)
     and x.pinned_by is null
     and not exists (select 1 from picks o where o.household_id = x.household_id and o.person <> p and o.task_id = x.id)
   order by public.is_urgent(x, d) desc, x.priority desc, x.due_date asc nulls last, random()
   limit 1
$$;

-- ---------- Today's board: pins + one thing ---------------------------------------
create or replace function public._today(p text) returns jsonb
language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  hh uuid := current_hh();
  d  date := household_day();
  other text := case when p = 'p1' then 'p2' else 'p1' end;
  pk picks%rowtype;
  t  tasks%rowtype;
  items jsonb := '[]'::jsonb;
  pick_open boolean := false;
  pins int;
begin
  if p not in ('p1','p2') then raise exception 'unknown person %', p; end if;
  if hh is null then raise exception 'no household'; end if;

  -- High tasks that were paused come back pinned on their day.
  update tasks set pinned_by = p, pinned_at = now(), return_pin_for = null
   where household_id = hh and return_pin_for = p and done_at is null
     and (not_before is null or not_before <= d);

  select * into pk from picks where household_id = hh and person = p for update;
  if not found then
    insert into picks (household_id, person) values (hh, p);
    select * into pk from picks where household_id = hh and person = p;
  end if;

  if pk.task_id is not null then
    select * into t from tasks where id = pk.task_id and household_id = hh;
    if not found
       or t.owner not in (p, 'both')
       or (t.done_at is not null and hday(t.done_at) < d)
       or (t.done_at is null and (not eligible(t, d) or skipped(t, d, p) or t.pinned_by is not null)) then
      update picks set task_id = null, since = null where household_id = hh and person = p;
      pk.task_id := null;
    end if;
  end if;

  if pk.task_id is null and pk.rest_day is distinct from d then
    pk.task_id := pick_candidate(p, d);
    if pk.task_id is not null then
      update picks set task_id = pk.task_id, since = d where household_id = hh and person = p;
      pk.since := d;
    end if;
  end if;

  -- 1) Pinned by me
  items := items || coalesce((
    select jsonb_agg(to_jsonb(x) || jsonb_build_object('kind', 'pinned', 'days', d - hday(x.created_at)) order by x.pinned_at)
      from tasks x
     where x.household_id = hh and x.pinned_by = p and eligible(x, d)), '[]'::jsonb);

  -- 2) My one thing
  if pk.task_id is not null then
    select * into t from tasks where id = pk.task_id;
    if t.done_at is null then
      pick_open := true;
      items := items || jsonb_build_array(to_jsonb(t) || jsonb_build_object('kind', 'pick', 'days', d - pk.since));
    end if;
  end if;

  -- 3) "Both of us" tasks on my partner's card (their pick or their pin)
  items := items || coalesce((
    select jsonb_agg(to_jsonb(x) || jsonb_build_object('kind', 'shared', 'days', 0))
      from tasks x
     where x.household_id = hh and x.owner = 'both' and x.done_at is null and eligible(x, d)
       and (x.pinned_by = other
            or exists (select 1 from picks o where o.household_id = hh and o.person = other and o.task_id = x.id))), '[]'::jsonb);

  -- 4) Due today / overdue and not on a card: offered as "pin it?"
  items := items || coalesce((
    select jsonb_agg(to_jsonb(x) || jsonb_build_object('kind', 'due', 'days', 0) order by x.due_date, x.priority desc)
      from tasks x
     where x.household_id = hh and x.owner in (p, 'both') and eligible(x, d)
       and x.due_date is not null and x.due_date <= d and x.pinned_by is null
       and not exists (select 1 from picks o where o.household_id = hh and o.task_id = x.id)), '[]'::jsonb);

  -- 5) Paused today, back later
  items := items || coalesce((
    select jsonb_agg(to_jsonb(x) || jsonb_build_object('kind', 'paused', 'days', 0) order by x.not_before)
      from tasks x
     where x.household_id = hh and x.owner in (p, 'both') and x.done_at is null and x.paused_day = d
       and x.not_before is not null and x.not_before > d), '[]'::jsonb);

  -- 6) Done today
  items := items || coalesce((
    select jsonb_agg(to_jsonb(x) || jsonb_build_object('kind', 'done', 'days', 0) order by x.done_at)
      from tasks x
     where x.household_id = hh and x.owner in (p, 'both') and x.done_at is not null and hday(x.done_at) = d), '[]'::jsonb);

  select count(*) into pins from tasks where household_id = hh and pinned_by = p and done_at is null;

  return jsonb_build_object(
    'day', d, 'person', p, 'items', items,
    'swap_used', exists (select 1 from swaps where household_id = hh and person = p and day = d),
    'can_another', not pick_open and pick_candidate(p, d) is not null,
    'pin_count', pins, 'pin_limit', 3,
    'open_count', (select count(*) from tasks x where x.household_id = hh and x.owner in (p, 'both') and x.done_at is null));
end $$;

-- For the notification sender (no signed-in user): set the household, then build the card.
create or replace function public._today_for(p_hh uuid, p text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  perform set_config('app.hh', p_hh::text, true);
  return _today(p);
end $$;

create or replace function public.together_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object(
    'status', case
      when t.status = 'invited' and t.invited_at < now() - interval '30 minutes' then 'none'
      when t.status = 'running' and now() > t.ends_at then 'none'
      when t.status in ('invited','running') then t.status
      else 'none' end,
    'started_by', t.started_by, 'ends_at', t.ends_at, 'joined_at', t.joined_at,
    'bonus_paid', t.bonus_paid, 'now', now())
  from together t where t.household_id = public.current_hh()), jsonb_build_object('status', 'none', 'now', now()))
$$;

create or replace function public.get_board() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); h households%rowtype;
begin
  if not is_member() then raise exception 'not a member of this household'; end if;
  select * into h from households where id = hh;
  insert into together (household_id, id) values (hh, 1) on conflict do nothing;
  return jsonb_build_object(
    'day', d,
    'p1', _today('p1'),
    'p2', _today('p2'),
    'names', jsonb_build_object('p1', h.name_p1, 'p2', h.name_p2),
    'week_done', (select count(*) from tasks where household_id = hh and done_at is not null and hday(done_at) >= date_trunc('week', d)::date),
    'together', together_state(),
    'now', now());
end $$;

-- ---------- Actions ---------------------------------------------------------------
create or replace function public.pin_task(p text, p_task uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); t tasks%rowtype;
begin
  if not is_member() then raise exception 'not a member'; end if;
  select * into t from tasks where id = p_task and household_id = hh;
  if not found or t.done_at is not null then return jsonb_build_object('error', 'That task can''t be pinned.'); end if;
  if t.owner not in (p, 'both') then return jsonb_build_object('error', 'You can pin your own or shared tasks.'); end if;
  if t.pinned_by = p then return get_board(); end if;
  if (select count(*) from tasks where household_id = hh and pinned_by = p and done_at is null) >= 3 then
    return jsonb_build_object('error', 'You can pin 3 at a time. Unpin one first.');
  end if;
  update tasks set pinned_by = p, pinned_at = now(), return_pin_for = null,
         not_before = case when not_before > d then null else not_before end,
         paused_day = case when not_before > d then null else paused_day end
   where id = t.id;
  -- If it was my one thing, it's pinned now; don't pile a new task on today.
  update picks set task_id = null, since = null, rest_day = d where household_id = hh and person = p and task_id = t.id;
  update picks set task_id = null, since = null where household_id = hh and person <> p and task_id = t.id;
  return get_board();
end $$;

create or replace function public.unpin_task(p text, p_task uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update tasks set pinned_by = null, pinned_at = null where id = p_task and household_id = current_hh();
  return get_board();
end $$;

create or replace function public.swap_task(p text, p_task uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); t tasks%rowtype; other_name text;
begin
  if not is_member() then raise exception 'not a member'; end if;
  if exists (select 1 from swaps where household_id = hh and person = p and day = d) then
    return jsonb_build_object('error', 'Today''s swap is already used.');
  end if;
  select * into t from tasks where id = p_task and household_id = hh;
  if not found or t.done_at is not null or t.owner not in (p, 'both') then
    return jsonb_build_object('error', 'That task can''t be swapped.');
  end if;
  if t.pinned_by is not null then return jsonb_build_object('error', 'Pinned tasks stay put. Unpin it instead.'); end if;
  if exists (select 1 from picks where household_id = hh and person <> p and task_id = t.id) then
    select case when p = 'p1' then name_p2 else name_p1 end into other_name from households where id = hh;
    return jsonb_build_object('error', 'That one is on ' || other_name || '''s card.');
  end if;
  update tasks set skip_day = d, skip_by = case when owner = 'both' then p end where id = t.id;
  update picks set task_id = null, since = null where household_id = hh and person = p and task_id = t.id;
  insert into swaps (household_id, person, day) values (hh, p, d);
  return get_board();
end $$;

create or replace function public.next_task(p text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); cur uuid; cand uuid;
begin
  if not is_member() then raise exception 'not a member'; end if;
  perform _today(p);
  select task_id into cur from picks where household_id = hh and person = p;
  if cur is not null and exists (select 1 from tasks where id = cur and done_at is null) then return get_board(); end if;
  cand := pick_candidate(p, d);
  if cand is not null then
    update picks set task_id = cand, since = d, rest_day = null where household_id = hh and person = p;
  end if;
  return get_board();
end $$;

create or replace function public.split_task(p text, p_task uuid, p_title text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); t tasks%rowtype; child uuid;
begin
  if not is_member() then raise exception 'not a member'; end if;
  select * into t from tasks where id = p_task and household_id = hh;
  if not found then return jsonb_build_object('error', 'Task not found.'); end if;
  insert into tasks (household_id, title, owner, priority, due_date, parent_id, created_by, pinned_by, pinned_at)
  values (hh, btrim(p_title), t.owner, t.priority, t.due_date, t.id, case when p in ('p1','p2') then p end,
          t.pinned_by, case when t.pinned_by is not null then now() end)
  returning id into child;
  update tasks set pinned_by = null, pinned_at = null where id = t.id;
  update picks set task_id = child, since = d where household_id = hh and person = p and task_id = t.id;
  return get_board();
end $$;

-- ---------- Levels & the home (household-scoped) -----------------------------------
create or replace function public.hh_totals(out xp int, out stars int)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(l.xp), 0)::int, coalesce(sum(l.stars), 0)::int from ledger l where l.household_id = public.current_hh()
$$;

create or replace function public.sync_levels() returns void
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); lv int; it record;
begin
  lv := level_for((hh_totals()).xp);
  for it in select * from items i
             where i.kind = 'level' and i.level <= lv
               and not exists (select 1 from owned o where o.household_id = hh and o.item_id = i.id)
             order by i.level loop
    insert into owned (household_id, item_id, via, spot)
    values (hh, it.id, 'level',
            case when exists (select 1 from owned o where o.household_id = hh and o.spot = it.spot) then null else it.spot end);
  end loop;
end $$;

create or replace function public.stock_ids(lv int, wk date) returns setof text
language sql stable set search_path = public as $$
  (select i.id from items i
    where i.kind = 'store' and i.season is null and i.min_level <= lv + 1
      and (not exists (select 1 from owned o where o.household_id = public.current_hh() and o.item_id = i.id)
           or exists (select 1 from owned o where o.household_id = public.current_hh() and o.item_id = i.id and hday(o.got_at) >= wk))
    order by md5(i.id || wk::text)
    limit 8)
  union all
  (select i.id from items i where i.kind = 'store' and public.in_season(i, household_day()))
$$;

create or replace function public.get_home() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); wk date := date_trunc('week', household_day())::date;
        tot record; lv int;
begin
  if not is_member() then raise exception 'not a member'; end if;
  perform sync_levels();
  select * into tot from hh_totals();
  lv := level_for(tot.xp);
  return jsonb_build_object(
    'level', lv, 'max_level', array_length(level_thresholds(), 1),
    'xp', tot.xp, 'stars', greatest(tot.stars, 0),
    'level_floor', level_at(lv), 'next_at', level_at(lv + 1),
    'next_reward', (select jsonb_build_object('id', id, 'name', name, 'spot', spot) from items where kind = 'level' and level = lv + 1),
    'owned', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', o.id, 'item_id', o.item_id, 'name', i.name, 'item_spot', i.spot,
                 'spot', o.spot, 'via', o.via, 'bought_by', o.bought_by, 'level', i.level) order by o.got_at)
               from owned o join items i on i.id = o.item_id where o.household_id = hh), '[]'::jsonb),
    'stock', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', i.id, 'name', i.name, 'spot', i.spot, 'category', i.category,
                 'price', i.price, 'min_level', i.min_level, 'season', i.season,
                 'owned', exists (select 1 from owned o where o.household_id = hh and o.item_id = i.id))
                 order by (i.season is null), i.price desc, i.id)
               from items i where i.id in (select stock_ids(lv, wk))), '[]'::jsonb),
    'restock_in', (wk + 7) - d);
end $$;

create or replace function public.buy_item(p_item text, p_by text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); wk date := date_trunc('week', household_day())::date;
        it items%rowtype; tot record; lv int;
begin
  if not is_member() then raise exception 'not a member'; end if;
  perform pg_advisory_xact_lock(hashtext('buy' || hh::text));
  perform sync_levels();
  select * into tot from hh_totals();
  lv := level_for(tot.xp);
  select * into it from items where id = p_item and kind = 'store';
  if not found then return jsonb_build_object('error', 'That item isn''t for sale.'); end if;
  if exists (select 1 from owned where household_id = hh and item_id = it.id) then return jsonb_build_object('error', 'You already own that one.'); end if;
  if p_item not in (select stock_ids(lv, wk)) then return jsonb_build_object('error', 'That item isn''t in this week''s Store.'); end if;
  if it.min_level > lv then return jsonb_build_object('error', 'Unlocks at level ' || it.min_level || '.'); end if;
  if tot.stars < it.price then return jsonb_build_object('error', 'You need ' || (it.price - greatest(tot.stars, 0)) || ' more Stars.'); end if;
  insert into ledger (household_id, day, person, kind, item_id, stars, xp) values (hh, d, p_by, 'buy', it.id, -it.price, 0);
  update owned set spot = null where household_id = hh and spot = it.spot;
  insert into owned (household_id, item_id, bought_by, via, spot) values (hh, it.id, p_by, 'store', it.spot);
  return get_home();
end $$;

create or replace function public.place_item(p_owned uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); s text;
begin
  if not is_member() then raise exception 'not a member'; end if;
  perform pg_advisory_xact_lock(hashtext('buy' || hh::text));
  select i.spot into s from owned o join items i on i.id = o.item_id where o.id = p_owned and o.household_id = hh;
  if s is null then return jsonb_build_object('error', 'Item not found.'); end if;
  update owned set spot = null where household_id = hh and spot = s and id <> p_owned;
  update owned set spot = s where id = p_owned and household_id = hh;
  return get_home();
end $$;

create or replace function public.store_item(p_owned uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update owned set spot = null where id = p_owned and household_id = current_hh();
  return get_home();
end $$;

-- +1 for adding a task, 5 a day per person. Wall adds count toward the list owner.
create or replace function public.award_add() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date; who text;
begin
  if new.system is not null then return new; end if;
  perform set_config('app.hh', new.household_id::text, true);
  d := household_day();
  who := coalesce(new.created_by, nullif(new.owner, 'both'), 'p1');
  if (select count(*) from ledger where household_id = new.household_id and kind = 'add' and day = d and person = who) < 5 then
    insert into ledger (household_id, day, person, kind, task_id, stars, xp) values (new.household_id, d, who, 'add', new.id, 1, 1);
  end if;
  return new;
end $$;

create or replace function public.complete_task(p_task uuid, p_by text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); t tasks%rowtype; award int := 0;
        before_lv int; after_lv int; tg together%rowtype; bonus boolean := false;
begin
  if not is_member() then raise exception 'not a member'; end if;
  before_lv := level_for((hh_totals()).xp);
  update tasks set done_at = now(), done_by = p_by, paused_day = null
   where id = p_task and household_id = hh and done_at is null
   returning * into t;
  if found then
    award := (case when t.priority = 2 then 15 else 10 end) + least(5, greatest(0, d - hday(t.created_at)));
    insert into ledger (household_id, day, person, kind, task_id, stars, xp) values (hh, d, p_by, 'done', t.id, award, award);
    select * into tg from together where household_id = hh for update;
    if found and tg.status = 'running' and now() <= tg.ends_at and not tg.bonus_paid
       and exists (select 1 from ledger where household_id = hh and kind = 'done' and person = 'p1' and at >= tg.joined_at)
       and exists (select 1 from ledger where household_id = hh and kind = 'done' and person = 'p2' and at >= tg.joined_at) then
      insert into ledger (household_id, day, person, kind, stars, xp) values (hh, d, 'p1', 'bonus', 5, 5), (hh, d, 'p2', 'bonus', 5, 5);
      update together set bonus_paid = true where household_id = hh;
      bonus := true;
    end if;
    perform sync_levels();
  end if;
  after_lv := level_for((hh_totals()).xp);
  return get_board() || jsonb_build_object('award', award, 'together_bonus', bonus, 'level_up', after_lv > before_lv, 'level', after_lv);
end $$;

-- Undo takes the Stars back, but never below zero.
create or replace function public.uncomplete_task(p_task uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); bal int;
begin
  if not is_member() then raise exception 'not a member'; end if;
  delete from ledger where household_id = hh and kind = 'done' and task_id = p_task;
  update tasks set done_at = null, done_by = null where id = p_task and household_id = hh;
  bal := (hh_totals()).stars;
  if bal < 0 then
    insert into ledger (household_id, day, person, kind, stars, xp) values (hh, household_day(), my_person(), 'adjust', -bal, 0);
  end if;
  return get_board();
end $$;

-- ---------- Pause / resume ---------------------------------------------------------
create or replace function public.pause_task(p text, p_task uuid, p_note text, p_until date, p_replace boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); t tasks%rowtype;
        note text := nullif(btrim(coalesce(p_note, '')), '');
        back date := greatest(coalesce(p_until, household_day() + 1), household_day() + 1); award int := 0;
begin
  if not is_member() then raise exception 'not a member'; end if;
  select * into t from tasks where id = p_task and household_id = hh;
  if not found or t.done_at is not null then return jsonb_build_object('error', 'That task can''t be paused.'); end if;
  update tasks set
    paused_day = d, not_before = back,
    pinned_by = null, pinned_at = null,
    return_pin_for = case when t.priority = 2 then p end,      -- High comes back pinned; others rejoin the shuffle
    progress_notes = progress_notes || case when note is null then '[]'::jsonb
                     else jsonb_build_array(jsonb_build_object('day', d, 'by', p, 'note', note, 'back', back)) end
  where id = p_task;
  if note is not null and not exists (select 1 from ledger where household_id = hh and kind = 'note' and task_id = p_task and day = d) then
    award := 3;
    insert into ledger (household_id, day, person, kind, task_id, stars, xp) values (hh, d, p, 'note', p_task, 3, 3);
    perform sync_levels();
  end if;
  update picks set task_id = null, since = null,
         rest_day = case when person = p and not coalesce(p_replace, true) then d else rest_day end
   where household_id = hh and task_id = p_task;
  return get_board() || jsonb_build_object('award', award, 'back', back);
end $$;

create or replace function public.resume_task(p text, p_task uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); t tasks%rowtype;
begin
  if not is_member() then raise exception 'not a member'; end if;
  select * into t from tasks where id = p_task and household_id = hh;
  if not found then return get_board(); end if;
  update tasks set not_before = null, paused_day = null,
         pinned_by = coalesce(return_pin_for, pinned_by), pinned_at = case when return_pin_for is not null then now() else pinned_at end,
         return_pin_for = null
   where id = p_task and done_at is null;
  if t.return_pin_for is null then
    update picks set task_id = p_task, since = d, rest_day = null
     where household_id = hh and person = p
       and (task_id is null or not exists (select 1 from tasks where id = picks.task_id and done_at is null));
  end if;
  return get_board();
end $$;

-- ---------- Together (per household) -----------------------------------------------
create or replace function public.start_together(p text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh();
begin
  if not is_member() then raise exception 'not a member'; end if;
  insert into together (household_id, id) values (hh, 1) on conflict do nothing;
  if (together_state()->>'status') = 'running' then return jsonb_build_object('error', 'A timer is already running.'); end if;
  update together set status = 'invited', started_by = p, invited_at = now(), joined_at = null, ends_at = null,
         bonus_paid = false, end_notified = false where household_id = hh;
  return get_board();
end $$;

create or replace function public.join_together(p text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s jsonb := together_state();
begin
  if not is_member() then raise exception 'not a member'; end if;
  if s->>'status' <> 'invited' then return jsonb_build_object('error', 'That invite has expired.'); end if;
  if s->>'started_by' = p then return jsonb_build_object('error', 'Waiting for your partner to join.'); end if;
  update together set status = 'running', joined_at = now(), ends_at = now() + interval '25 minutes', end_notified = false
   where household_id = current_hh();
  return get_board();
end $$;

create or replace function public.end_together() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update together set status = 'ended', end_notified = true where household_id = current_hh();
  return get_board();
end $$;

-- ---------- Shopping lists (per household) -----------------------------------------
create or replace function public.maybe_order_task() returns void
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh();
begin
  if (select count(*) from shop_items where household_id = hh and list = 'groceries' and trip_id is null and checked_at is null) >= 8
     and not exists (select 1 from tasks where household_id = hh and system = 'grocery_run' and done_at is null) then
    insert into tasks (household_id, title, owner, priority, system, notes)
    values (hh, 'Order groceries', 'both', 1, 'grocery_run', 'The grocery list has 8+ items. Tick them off in Lists as you add them to the order.');
  end if;
end $$;

create or replace function public.get_lists() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); res jsonb := '{}'::jsonb; l text;
begin
  if not is_member() then raise exception 'not a member'; end if;
  foreach l in array array['groceries','household'] loop
    res := res || jsonb_build_object(l, jsonb_build_object(
      'items', coalesce((select jsonb_agg(to_jsonb(s) order by (s.checked_at is not null), s.checked_at, s.added_at)
                          from shop_items s where s.household_id = hh and s.list = l and s.trip_id is null), '[]'::jsonb),
      'usual', coalesce((select jsonb_agg(jsonb_build_object('key', u.key, 'name', u.name) order by u.uses desc, u.last_at desc)
                          from (select * from shop_usual u
                                 where u.household_id = hh and u.list = l and not u.hidden
                                   and u.key not in (select shop_key(name) from shop_items where household_id = hh and list = l and trip_id is null)
                                 order by u.uses desc, u.last_at desc limit 30) u), '[]'::jsonb)));
  end loop;
  return jsonb_build_object(
    'lists', res,
    'trips_today', (select count(*) from ledger where household_id = hh and kind = 'trip' and day = d),
    'order_task_open', exists (select 1 from tasks where household_id = hh and system = 'grocery_run' and done_at is null));
end $$;

create or replace function public.add_shop_items(p_list text, p_text text, p_by text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); part text; nm text; q text; m text[]; added int := 0;
begin
  if not is_member() then raise exception 'not a member'; end if;
  for part in select btrim(x) from regexp_split_to_table(coalesce(p_text, ''), '\s*[,;\n]\s*') x loop
    continue when part = '';
    q := null; nm := part;
    m := regexp_match(part, '^(\d+)\s*x?\s+(.+)$');
    if m is not null then q := m[1]; nm := m[2];
    else m := regexp_match(part, '^(.+?)\s*x\s*(\d+)$'); if m is not null then nm := m[1]; q := m[2]; end if; end if;
    nm := btrim(nm);
    continue when nm = '';
    continue when exists (select 1 from shop_items where household_id = hh and list = p_list and trip_id is null and checked_at is null and shop_key(name) = shop_key(nm));
    insert into shop_items (household_id, list, name, qty, added_by) values (hh, p_list, nm, q, p_by);
    insert into shop_usual (household_id, list, key, name, uses, last_at) values (hh, p_list, shop_key(nm), nm, 1, now())
    on conflict (household_id, list, key) do update set uses = shop_usual.uses + 1, name = excluded.name, last_at = now(), hidden = false;
    added := added + 1;
  end loop;
  perform maybe_order_task();
  return get_lists() || jsonb_build_object('added', added);
end $$;

create or replace function public.toggle_shop_item(p_id uuid, p_by text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update shop_items set
    checked_at = case when checked_at is null then now() else null end,
    checked_by = case when checked_at is null then p_by else null end
  where id = p_id and household_id = current_hh() and trip_id is null;
  return get_lists();
end $$;

create or replace function public.hide_usual(p_list text, p_key text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update shop_usual set hidden = true where household_id = current_hh() and list = p_list and key = p_key;
  return get_lists();
end $$;

-- "Got everything": +10 + 1 per item (max +30, 2 rewarded runs a day). For groceries it
-- replaces (not adds to) any Stars already earned for checking off "Order groceries".
create or replace function public.finish_trip(p_list text, p_by text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); n int; stars int := 0; tid uuid;
begin
  if not is_member() then raise exception 'not a member'; end if;
  perform pg_advisory_xact_lock(hashtext('trip' || hh::text));
  select count(*) into n from shop_items where household_id = hh and list = p_list and trip_id is null and checked_at is not null;
  if n = 0 then return jsonb_build_object('error', 'Tick off what you got first.'); end if;
  if (select count(*) from ledger where household_id = hh and kind = 'trip' and day = d) < 2 then stars := least(30, 10 + n); end if;
  insert into trips (household_id, list, by_person, items, stars) values (hh, p_list, p_by, n, stars) returning id into tid;
  update shop_items set trip_id = tid where household_id = hh and list = p_list and trip_id is null and checked_at is not null;
  if p_list = 'groceries' then
    delete from ledger where household_id = hh and kind = 'done'
      and task_id in (select id from tasks where household_id = hh and system = 'grocery_run' and done_at is not null and not trip_settled);
    update tasks set done_at = coalesce(done_at, now()), done_by = coalesce(done_by, p_by), trip_settled = true
     where household_id = hh and system = 'grocery_run' and not trip_settled;
  end if;
  if stars > 0 then
    insert into ledger (household_id, day, person, kind, stars, xp) values (hh, d, p_by, 'trip', stars, stars);
  end if;
  perform sync_levels();
  return get_lists() || jsonb_build_object('award', stars, 'items', n, 'trip_id', tid);
end $$;

-- ---------- Notification sender helpers (service role only) -------------------------
-- Which households are due a 7 a.m. or 7 p.m. message right now? Marks them, so each is sent once.
create or replace function public._due_notifications(p_force text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare res jsonb := '[]'::jsonb; r record;
begin
  for r in
    update households h set
      last_morning = case when p_force = 'morning' or (p_force is null and extract(hour from now() at time zone h.tz) = 7)
                          then ((now() at time zone h.tz) - interval '4 hours')::date else last_morning end,
      last_evening = case when p_force = 'evening' or (p_force is null and extract(hour from now() at time zone h.tz) = 19)
                          then ((now() at time zone h.tz) - interval '4 hours')::date else last_evening end
    where p_force is not null
       or (extract(hour from now() at time zone h.tz) = 7
           and last_morning is distinct from ((now() at time zone h.tz) - interval '4 hours')::date)
       or (extract(hour from now() at time zone h.tz) = 19
           and last_evening is distinct from ((now() at time zone h.tz) - interval '4 hours')::date)
    returning h.id, h.name_p1, h.name_p2,
      case when p_force is not null then p_force
           when extract(hour from now() at time zone h.tz) = 7 then 'morning' else 'evening' end as kind
  loop
    res := res || jsonb_build_array(jsonb_build_object('hh', r.id, 'kind', r.kind, 'names', jsonb_build_object('p1', r.name_p1, 'p2', r.name_p2)));
  end loop;
  return res;
end $$;

-- Timers that just ran out (each reported once).
create or replace function public._ended_timers() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare res jsonb := '[]'::jsonb; r record;
begin
  for r in
    update together set status = 'ended', end_notified = true
     where status = 'running' and ends_at <= now() and not end_notified
    returning household_id, bonus_paid
  loop
    res := res || jsonb_build_array(jsonb_build_object('hh', r.household_id, 'bonus', r.bonus_paid));
  end loop;
  return res;
end $$;

revoke all on function public._today(text) from public, anon, authenticated;
revoke all on function public._today_for(uuid, text) from public, anon, authenticated;
revoke all on function public._due_notifications(text) from public, anon, authenticated;
revoke all on function public._ended_timers() from public, anon, authenticated;
grant execute on function public._today(text), public._today_for(uuid, text),
                          public._due_notifications(text), public._ended_timers() to service_role;

-- ---------- Security: everything is scoped to your own household -------------------
alter table public.households enable row level security;   -- functions only
alter table public.join_fails enable row level security;   -- functions only

drop policy if exists tasks_members on public.tasks;
create policy tasks_members on public.tasks for all to authenticated
  using (household_id = public.my_hh()) with check (household_id = public.my_hh());
drop policy if exists picks_read on public.picks;
create policy picks_read on public.picks for select to authenticated using (household_id = public.my_hh());
drop policy if exists subs_members on public.push_subs;
create policy subs_members on public.push_subs for all to authenticated
  using (household_id = public.my_hh()) with check (household_id = public.my_hh());
drop policy if exists ledger_read on public.ledger;
create policy ledger_read on public.ledger for select to authenticated using (household_id = public.my_hh());
drop policy if exists owned_read on public.owned;
create policy owned_read on public.owned for select to authenticated using (household_id = public.my_hh());
drop policy if exists shop_items_members on public.shop_items;
create policy shop_items_members on public.shop_items for all to authenticated
  using (household_id = public.my_hh()) with check (household_id = public.my_hh());
drop policy if exists shop_usual_read on public.shop_usual;
create policy shop_usual_read on public.shop_usual for select to authenticated using (household_id = public.my_hh());
drop policy if exists trips_read on public.trips;
create policy trips_read on public.trips for select to authenticated using (household_id = public.my_hh());
drop policy if exists together_read on public.together;
create policy together_read on public.together for select to authenticated using (household_id = public.my_hh());

-- ---------- Scheduler: every 5 minutes (needed for "time's up" and, next, event reminders) ----
do $$ begin
  perform cron.alter_job(jobid, schedule := '*/5 * * * *') from cron.job where jobname = 'one-thing-hourly';
exception when others then null;   -- cron not installed (e.g. local testing): skip
end $$;
