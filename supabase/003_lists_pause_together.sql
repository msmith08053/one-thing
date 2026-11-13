-- ============================================================
-- One Thing — upgrade 003
-- Shared shopping lists · new Pause (notes + come-back date + replacement)
-- "Do ours together" timer · seasonal Store items · wallpaper & floors
--
-- Run AFTER 002_our_home.sql. Supabase → SQL Editor → Run. Safe to re-run.
-- ============================================================

-- ---------- Column / constraint additions -----------------------------------
alter table public.tasks add column if not exists system text;          -- 'grocery_run' for the automatic order task
alter table public.picks add column if not exists rest_day date;        -- paused without a replacement today
alter table public.items add column if not exists season text;
alter table public.items add column if not exists avail_from text;      -- 'MM-DD'
alter table public.items add column if not exists avail_to text;

do $$ begin
  alter table public.items drop constraint if exists items_spot_check;
  alter table public.items add constraint items_spot_check check (spot in
    ('ceiling','wall_left','wall_mid','wall_right','rug','floor_left','floor_mid','floor_right','floor_front','wallpaper','floor'));
  alter table public.items drop constraint if exists items_category_check;
  alter table public.items add constraint items_category_check check (category in
    ('furniture','plants','decor','lighting','rugs','walls'));
  alter table public.ledger drop constraint if exists ledger_kind_check;
  alter table public.ledger add constraint ledger_kind_check check (kind in ('add','done','buy','trip','note','bonus'));
end $$;

-- ---------- New items: seasonal + walls & floors -----------------------------
insert into public.items (id, name, spot, category, price, min_level, kind, level, season, avail_from, avail_to) values
  ('pumpkin',           'Grinning pumpkin',  'floor_front','decor',     40, 1, 'store', null, 'halloween', '10-01', '11-07'),
  ('bat_garland',       'Bat garland',       'ceiling',    'decor',     55, 1, 'store', null, 'halloween', '10-01', '11-07'),
  ('lamp_jackolantern', 'Pumpkin lamp',      'floor_right','lighting',  85, 1, 'store', null, 'halloween', '10-01', '11-07'),
  ('tree_holiday',      'Holiday tree',      'floor_right','plants',   150, 1, 'store', null, 'winter',    '12-01', '01-06'),
  ('snow_garland',      'Snowflake garland', 'ceiling',    'decor',     55, 1, 'store', null, 'winter',    '12-01', '01-06'),
  ('gift_stack',        'Gift stack',        'floor_front','decor',     45, 1, 'store', null, 'winter',    '12-01', '01-06'),
  ('tulips',            'Tulip pot',         'floor_left', 'plants',    60, 1, 'store', null, 'spring',    '03-20', '04-30'),
  ('flower_garland',    'Flower garland',    'ceiling',    'decor',     50, 1, 'store', null, 'spring',    '03-20', '04-30'),
  ('wall_mint',         'Mint stripes',      'wallpaper',  'walls',     90, 1, 'store', null, null, null, null),
  ('wall_dots',         'Peach polka dots',  'wallpaper',  'walls',    110, 2, 'store', null, null, null, null),
  ('wall_gingham',      'Sky gingham',       'wallpaper',  'walls',    120, 2, 'store', null, null, null, null),
  ('wall_diamond',      'Lavender diamonds', 'wallpaper',  'walls',    130, 3, 'store', null, null, null, null),
  ('floor_carpet',      'Cozy blue carpet',  'floor',      'walls',     80, 1, 'store', null, null, null, null),
  ('floor_walnut',      'Walnut planks',     'floor',      'walls',    100, 2, 'store', null, null, null, null),
  ('floor_checker',     'Checker tiles',     'floor',      'walls',    140, 3, 'store', null, null, null, null)
on conflict (id) do update set
  name = excluded.name, spot = excluded.spot, category = excluded.category, price = excluded.price,
  min_level = excluded.min_level, kind = excluded.kind, level = excluded.level,
  season = excluded.season, avail_from = excluded.avail_from, avail_to = excluded.avail_to;

create or replace function public.in_season(x public.items, d date) returns boolean
language sql immutable as $$
  select x.season is not null and case
    when x.avail_from <= x.avail_to then to_char(d, 'MM-DD') between x.avail_from and x.avail_to
    else to_char(d, 'MM-DD') >= x.avail_from or to_char(d, 'MM-DD') <= x.avail_to end
$$;

-- This week's Store: 8 regular items (reshuffled Mondays) + any seasonal items in season.
create or replace function public.stock_ids(lv int, wk date) returns setof text
language sql stable set search_path = public as $$
  (select i.id from items i
    where i.kind = 'store' and i.season is null
      and i.min_level <= lv + 1
      and (not exists (select 1 from owned o where o.item_id = i.id)
           or exists (select 1 from owned o where o.item_id = i.id and hday(o.got_at) >= wk))
    order by md5(i.id || wk::text)
    limit 8)
  union all
  (select i.id from items i
    where i.kind = 'store' and public.in_season(i, household_day()))
$$;

create or replace function public.get_home() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := household_day(); wk date := date_trunc('week', household_day())::date;
        total_xp int; total_stars int; lv int;
begin
  if not is_member() then raise exception 'not a member'; end if;
  perform sync_levels();
  select coalesce(sum(xp), 0), coalesce(sum(stars), 0) into total_xp, total_stars from ledger;
  lv := level_for(total_xp);
  return jsonb_build_object(
    'level', lv,
    'max_level', array_length(level_thresholds(), 1),
    'xp', total_xp,
    'stars', total_stars,
    'level_floor', level_at(lv),
    'next_at', level_at(lv + 1),
    'next_reward', (select jsonb_build_object('id', id, 'name', name, 'spot', spot) from items where kind = 'level' and level = lv + 1),
    'owned', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', o.id, 'item_id', o.item_id, 'name', i.name, 'item_spot', i.spot,
                 'spot', o.spot, 'via', o.via, 'bought_by', o.bought_by, 'level', i.level) order by o.got_at)
               from owned o join items i on i.id = o.item_id), '[]'::jsonb),
    'stock', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', i.id, 'name', i.name, 'spot', i.spot, 'category', i.category,
                 'price', i.price, 'min_level', i.min_level, 'season', i.season,
                 'owned', exists (select 1 from owned o where o.item_id = i.id))
                 order by (i.season is null), i.price desc, i.id)
               from items i where i.id in (select stock_ids(lv, wk))), '[]'::jsonb),
    'restock_in', (wk + 7) - d
  );
end $$;

-- ---------- Adding tasks: system tasks don't earn the +1 ------------------------
create or replace function public.award_add() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date := household_day(); who text := coalesce(new.created_by, 'wall');
begin
  if new.system is not null then return new; end if;
  if (select count(*) from ledger where kind = 'add' and day = d and person = who) < 5 then
    insert into ledger (day, person, kind, task_id, stars, xp) values (d, who, 'add', new.id, 1, 1);
  end if;
  return new;
end $$;

-- ---------- Do ours together ------------------------------------------------
create table if not exists public.together (
  id         int primary key default 1 check (id = 1),
  status     text not null default 'none' check (status in ('none','invited','running','ended')),
  started_by text,
  invited_at timestamptz,
  joined_at  timestamptz,
  ends_at    timestamptz,
  bonus_paid boolean not null default false
);
insert into public.together (id) values (1) on conflict do nothing;

create or replace function public.together_state() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status', case
      when t.status = 'invited' and t.invited_at < now() - interval '30 minutes' then 'none'
      when t.status = 'running' and now() > t.ends_at then 'none'
      when t.status in ('invited','running') then t.status
      else 'none' end,
    'started_by', t.started_by, 'ends_at', t.ends_at, 'joined_at', t.joined_at,
    'bonus_paid', t.bonus_paid, 'now', now())
  from together t where t.id = 1
$$;

create or replace function public.start_together(p text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  if (together_state()->>'status') = 'running' then
    return jsonb_build_object('error', 'A timer is already running.');
  end if;
  update together set status = 'invited', started_by = p, invited_at = now(),
         joined_at = null, ends_at = null, bonus_paid = false where id = 1;
  return get_board();
end $$;

create or replace function public.join_together(p text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s jsonb := together_state();
begin
  if not is_member() then raise exception 'not a member'; end if;
  if s->>'status' <> 'invited' then return jsonb_build_object('error', 'That invite has expired.'); end if;
  if s->>'started_by' = p then return jsonb_build_object('error', 'Waiting for your partner to join.'); end if;
  update together set status = 'running', joined_at = now(), ends_at = now() + interval '25 minutes' where id = 1;
  return get_board();
end $$;

create or replace function public.end_together() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update together set status = 'ended' where id = 1;
  return get_board();
end $$;

-- ---------- Today's board (adds: rest day after a pause, paused rows) -------
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

  if pk.task_id is null and n_urgent = 0 and pk.rest_day is distinct from d then
    pk.task_id := pick_candidate(p, d);
    if pk.task_id is not null then
      update picks set task_id = pk.task_id, since = d where person = p;
      pk.since := d;
    end if;
  end if;

  items := items || coalesce((
    select jsonb_agg(to_jsonb(x) || jsonb_build_object('kind','urgent','days', d - hday(x.created_at))
                     order by x.priority desc, x.due_date asc nulls last, x.created_at)
      from tasks x
     where x.owner in (p, 'both') and eligible(x, d) and is_urgent(x, d)), '[]'::jsonb);

  if pk.task_id is not null then
    select * into t from tasks where id = pk.task_id;
    if t.done_at is null then
      pick_open := true;
      if n_urgent = 0 then
        items := items || jsonb_build_array(to_jsonb(t) || jsonb_build_object('kind','pick','days', d - pk.since));
      end if;
    end if;
  end if;

  select x.* into t from picks o join tasks x on x.id = o.task_id
   where o.person = other and x.owner = 'both' and x.done_at is null;
  if found and not items @> jsonb_build_array(jsonb_build_object('id', t.id)) then
    items := items || jsonb_build_array(to_jsonb(t) || jsonb_build_object('kind','shared','days', 0));
  end if;

  -- Paused today, coming back later
  items := items || coalesce((
    select jsonb_agg(to_jsonb(x) || jsonb_build_object('kind','paused','days',0) order by x.not_before)
      from tasks x
     where x.owner in (p, 'both') and x.done_at is null and x.paused_day = d
       and x.not_before is not null and x.not_before > d), '[]'::jsonb);

  items := items || coalesce((
    select jsonb_agg(to_jsonb(x) || jsonb_build_object('kind','done','days',0) order by x.done_at)
      from tasks x
     where x.owner in (p, 'both') and x.done_at is not null and hday(x.done_at) = d), '[]'::jsonb);

  can_another := n_urgent = 0 and not pick_open and pick_candidate(p, d) is not null;

  return jsonb_build_object(
    'day', d, 'person', p, 'items', items,
    'swap_used', exists (select 1 from swaps where person = p and day = d),
    'can_another', can_another,
    'open_count', (select count(*) from tasks x where x.owner in (p,'both') and x.done_at is null)
  );
end $$;

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
    'week_done', (select count(*) from tasks where done_at is not null and hday(done_at) >= date_trunc('week', d)::date),
    'together', together_state(),
    'now', now()
  );
end $$;

-- "Give me another" also clears a rest day.
create or replace function public.next_task(p text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := household_day(); cur uuid; cand uuid;
begin
  if not is_member() then raise exception 'not a member'; end if;
  perform _today(p);
  select task_id into cur from picks where person = p;
  if cur is not null and exists (select 1 from tasks where id = cur and done_at is null) then
    return get_board();
  end if;
  cand := pick_candidate(p, d);
  if cand is not null then
    update picks set task_id = cand, since = d, rest_day = null where person = p;
  end if;
  return get_board();
end $$;

-- ---------- Finishing: + together bonus --------------------------------------
create or replace function public.complete_task(p_task uuid, p_by text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := household_day(); t tasks%rowtype; award int := 0; before_lv int; after_lv int;
        tg together%rowtype; bonus boolean := false;
begin
  if not is_member() then raise exception 'not a member'; end if;
  before_lv := level_for(coalesce((select sum(xp) from ledger), 0)::int);
  update tasks set done_at = now(), done_by = p_by, paused_day = null
   where id = p_task and done_at is null
   returning * into t;
  if found then
    award := (case when t.priority = 2 then 15 else 10 end) + least(5, greatest(0, d - hday(t.created_at)));
    insert into ledger (day, person, kind, task_id, stars, xp) values (d, p_by, 'done', t.id, award, award);
    -- Together bonus: both finished something during a running timer → +5 each, once.
    select * into tg from together where id = 1 for update;
    if tg.status = 'running' and now() <= tg.ends_at and not tg.bonus_paid
       and exists (select 1 from ledger where kind = 'done' and person = 'p1' and at >= tg.joined_at)
       and exists (select 1 from ledger where kind = 'done' and person = 'p2' and at >= tg.joined_at) then
      insert into ledger (day, person, kind, stars, xp) values (d, 'p1', 'bonus', 5, 5), (d, 'p2', 'bonus', 5, 5);
      update together set bonus_paid = true where id = 1;
      bonus := true;
    end if;
    perform sync_levels();
  end if;
  after_lv := level_for(coalesce((select sum(xp) from ledger), 0)::int);
  return get_board() || jsonb_build_object('award', award, 'together_bonus', bonus,
                                           'level_up', after_lv > before_lv, 'level', after_lv);
end $$;

-- ---------- New Pause: note + come-back date + optional replacement ---------
drop function if exists public.pause_task(text, uuid, text);
drop function if exists public.resume_task(uuid);

create or replace function public.pause_task(p text, p_task uuid, p_note text, p_until date, p_replace boolean)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare d date := household_day(); t tasks%rowtype; note text := nullif(btrim(coalesce(p_note, '')), '');
        back date := greatest(coalesce(p_until, household_day() + 1), household_day() + 1); award int := 0;
begin
  if not is_member() then raise exception 'not a member'; end if;
  select * into t from tasks where id = p_task;
  if not found or t.done_at is not null then return jsonb_build_object('error', 'That task can''t be paused.'); end if;
  update tasks set
    paused_day = d,
    not_before = back,
    progress_notes = progress_notes || case when note is null then '[]'::jsonb
                     else jsonb_build_array(jsonb_build_object('day', d, 'by', p, 'note', note, 'back', back)) end
  where id = p_task;
  -- +3 for writing down where you left off (once per task per day)
  if note is not null and not exists (select 1 from ledger where kind = 'note' and task_id = p_task and day = d) then
    award := 3;
    insert into ledger (day, person, kind, task_id, stars, xp) values (d, p, 'note', p_task, 3, 3);
    perform sync_levels();
  end if;
  -- Free its slot. With a replacement: a new one is picked now (no swap used). Without: rest for today.
  update picks set task_id = null, since = null,
         rest_day = case when person = p and not coalesce(p_replace, true) then d else rest_day end
   where task_id = p_task;
  return get_board() || jsonb_build_object('award', award, 'back', back);
end $$;

-- Undo a pause made today: back on the pile, and onto your card if it's empty.
create or replace function public.resume_task(p text, p_task uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := household_day();
begin
  if not is_member() then raise exception 'not a member'; end if;
  update tasks set not_before = null, paused_day = null where id = p_task and done_at is null;
  update picks set task_id = p_task, since = d, rest_day = null
   where person = p and (task_id is null or not exists (select 1 from tasks where id = picks.task_id and done_at is null));
  return get_board();
end $$;

-- ---------- Shared shopping lists ---------------------------------------------
create table if not exists public.shop_items (
  id         uuid primary key default gen_random_uuid(),
  list       text not null check (list in ('groceries','household')),
  name       text not null check (length(btrim(name)) > 0),
  qty        text,
  note       text,
  added_by   text,
  added_at   timestamptz not null default now(),
  checked_at timestamptz,
  checked_by text,
  trip_id    uuid
);
create index if not exists shop_items_active_idx on public.shop_items (list) where trip_id is null;

create table if not exists public.shop_usual (
  list    text not null,
  key     text not null,
  name    text not null,
  uses    int  not null default 0,
  last_at timestamptz,
  hidden  boolean not null default false,
  primary key (list, key)
);

create table if not exists public.trips (
  id    uuid primary key default gen_random_uuid(),
  list  text not null,
  by_person text,
  at    timestamptz not null default now(),
  items int not null,
  stars int not null
);

create or replace function public.shop_key(n text) returns text
language sql immutable as $$ select lower(regexp_replace(btrim(n), '\s+', ' ', 'g')) $$;

-- The automatic "Order groceries" task once the list has 8+ items.
create or replace function public.maybe_order_task() returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if (select count(*) from shop_items where list = 'groceries' and trip_id is null and checked_at is null) >= 8
     and not exists (select 1 from tasks where system = 'grocery_run' and done_at is null) then
    insert into tasks (title, owner, priority, system, notes)
    values ('Order groceries', 'both', 1, 'grocery_run', 'The grocery list has 8+ items. Tick them off in Lists as you add them to the order.');
  end if;
end $$;

create or replace function public.get_lists() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := household_day(); res jsonb := '{}'::jsonb; l text;
begin
  if not is_member() then raise exception 'not a member'; end if;
  foreach l in array array['groceries','household'] loop
    res := res || jsonb_build_object(l, jsonb_build_object(
      'items', coalesce((select jsonb_agg(to_jsonb(s) order by (s.checked_at is not null), s.checked_at, s.added_at)
                          from shop_items s where s.list = l and s.trip_id is null), '[]'::jsonb),
      'usual', coalesce((select jsonb_agg(jsonb_build_object('key', u.key, 'name', u.name) order by u.uses desc, u.last_at desc)
                          from (select * from shop_usual u
                                 where u.list = l and not u.hidden
                                   and u.key not in (select shop_key(name) from shop_items where list = l and trip_id is null)
                                 order by u.uses desc, u.last_at desc limit 30) u), '[]'::jsonb)));
  end loop;
  return jsonb_build_object(
    'lists', res,
    'trips_today', (select count(*) from ledger where kind = 'trip' and day = d),
    'order_task_open', exists (select 1 from tasks where system = 'grocery_run' and done_at is null));
end $$;

-- Add one or many: "milk, eggs, 2 avocados, bread x2"
create or replace function public.add_shop_items(p_list text, p_text text, p_by text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare part text; nm text; q text; m text[]; added int := 0;
begin
  if not is_member() then raise exception 'not a member'; end if;
  for part in select btrim(x) from regexp_split_to_table(coalesce(p_text, ''), '\s*[,;\n]\s*') x loop
    continue when part = '';
    q := null; nm := part;
    m := regexp_match(part, '^(\d+)\s*x?\s+(.+)$');
    if m is not null then q := m[1]; nm := m[2];
    else
      m := regexp_match(part, '^(.+?)\s*x\s*(\d+)$');
      if m is not null then nm := m[1]; q := m[2]; end if;
    end if;
    nm := btrim(nm);
    continue when nm = '';
    -- already on the list (not yet bought)? skip the duplicate
    continue when exists (select 1 from shop_items where list = p_list and trip_id is null and checked_at is null and shop_key(name) = shop_key(nm));
    insert into shop_items (list, name, qty, added_by) values (p_list, nm, q, p_by);
    insert into shop_usual (list, key, name, uses, last_at) values (p_list, shop_key(nm), nm, 1, now())
    on conflict (list, key) do update set uses = shop_usual.uses + 1, name = excluded.name, last_at = now(), hidden = false;
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
  where id = p_id and trip_id is null;
  return get_lists();
end $$;

create or replace function public.hide_usual(p_list text, p_key text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update shop_usual set hidden = true where list = p_list and key = p_key;
  return get_lists();
end $$;

-- "Got everything": +10 Stars + 1 per item ticked, max +30, 2 rewarded trips a day.
create or replace function public.finish_trip(p_list text, p_by text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := household_day(); n int; stars int := 0; tid uuid;
begin
  if not is_member() then raise exception 'not a member'; end if;
  perform pg_advisory_xact_lock(4243);
  select count(*) into n from shop_items where list = p_list and trip_id is null and checked_at is not null;
  if n = 0 then return jsonb_build_object('error', 'Tick off what you got first.'); end if;
  if (select count(*) from ledger where kind = 'trip' and day = d) < 2 then
    stars := least(30, 10 + n);
  end if;
  insert into trips (list, by_person, items, stars) values (p_list, p_by, n, stars) returning id into tid;
  update shop_items set trip_id = tid where list = p_list and trip_id is null and checked_at is not null;
  if stars > 0 then
    insert into ledger (day, person, kind, stars, xp) values (d, p_by, 'trip', stars, stars);
    perform sync_levels();
  end if;
  if p_list = 'groceries' then
    update tasks set done_at = now(), done_by = p_by where system = 'grocery_run' and done_at is null;
  end if;
  return get_lists() || jsonb_build_object('award', stars, 'items', n, 'trip_id', tid);
end $$;

-- ---------- Security & live sync ---------------------------------------------
alter table public.shop_items enable row level security;
alter table public.shop_usual enable row level security;
alter table public.trips      enable row level security;
alter table public.together   enable row level security;

drop policy if exists shop_items_members on public.shop_items;
create policy shop_items_members on public.shop_items for all to authenticated
  using (public.is_member()) with check (public.is_member());
drop policy if exists shop_usual_read on public.shop_usual;
create policy shop_usual_read on public.shop_usual for select to authenticated using (public.is_member());
drop policy if exists trips_read on public.trips;
create policy trips_read on public.trips for select to authenticated using (public.is_member());
drop policy if exists together_read on public.together;
create policy together_read on public.together for select to authenticated using (public.is_member());

do $$ begin alter publication supabase_realtime add table public.shop_items;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.together;
exception when duplicate_object then null; end $$;
