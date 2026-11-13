-- ============================================================
-- One Thing — upgrade 002: "Our Home"
-- Stars, XP and levels · the shared room · weekly Store · Storage
-- Pause with "left off" notes
--
-- Run AFTER schema.sql. Paste into Supabase → SQL Editor → Run.
-- Safe to re-run. Your existing tasks are untouched.
-- ============================================================

-- ---------- Task additions: pause / progress notes --------------------------
alter table public.tasks add column if not exists progress_notes jsonb not null default '[]'::jsonb;
alter table public.tasks add column if not exists paused_day date;

-- ---------- Catalog ---------------------------------------------------------
create table if not exists public.items (
  id        text primary key,
  name      text not null,
  spot      text not null check (spot in ('ceiling','wall_left','wall_mid','wall_right','rug',
                                          'floor_left','floor_mid','floor_right','floor_front')),
  category  text not null check (category in ('furniture','plants','decor','lighting','rugs')),
  price     int  not null default 0,
  min_level int  not null default 1,
  kind      text not null check (kind in ('store','level')),
  level     int                                   -- for level rewards: the level that grants it
);

insert into public.items (id, name, spot, category, price, min_level, kind, level) values
  -- Level rewards (free, placed automatically)
  ('window_classic', 'Sunny window',      'wall_left',  'decor',     0, 2,  'level', 2),
  ('rug_round',      'Round rug',         'rug',        'rugs',      0, 3,  'level', 3),
  ('sofa_mint',      'Mint sofa',         'floor_mid',  'furniture', 0, 4,  'level', 4),
  ('plant_leafy',    'Leafy plant',       'floor_left', 'plants',    0, 5,  'level', 5),
  ('lamp_floor',     'Floor lamp',        'floor_right','lighting',  0, 6,  'level', 6),
  ('picture_sunny',  'Sunny hills print', 'wall_right', 'decor',     0, 7,  'level', 7),
  ('clock_wall',     'Wall clock',        'wall_mid',   'decor',     0, 8,  'level', 8),
  ('lights_string',  'String lights',     'ceiling',    'lighting',  0, 9,  'level', 9),
  ('table_coffee',   'Coffee table',      'floor_front','furniture', 0, 10, 'level', 10),
  -- Store
  ('window_round',   'Round window',      'wall_left',  'decor',     140, 3, 'store', null),
  ('window_garden',  'Window garden',     'wall_left',  'plants',    220, 6, 'store', null),
  ('shelf_small',    'Little shelf',      'wall_mid',   'decor',      70, 1, 'store', null),
  ('mirror_round',   'Round mirror',      'wall_mid',   'decor',      80, 2, 'store', null),
  ('wreath',         'Dried flower wreath','wall_mid',  'decor',      60, 1, 'store', null),
  ('poster_mountains','Mountain poster',  'wall_right', 'decor',      50, 1, 'store', null),
  ('picture_cat',    'Cat portrait',      'wall_right', 'decor',      75, 2, 'store', null),
  ('gallery_wall',   'Gallery wall',      'wall_right', 'decor',     160, 5, 'store', null),
  ('bunting',        'Party bunting',     'ceiling',    'decor',      40, 1, 'store', null),
  ('plant_hanging',  'Hanging plant',     'ceiling',    'plants',     90, 3, 'store', null),
  ('paper_lanterns', 'Paper lanterns',    'ceiling',    'lighting',  120, 5, 'store', null),
  ('rug_stripe',     'Striped rug',       'rug',        'rugs',       70, 1, 'store', null),
  ('rug_checker',    'Checker rug',       'rug',        'rugs',      110, 4, 'store', null),
  ('bookshelf',      'Bookshelf',         'floor_left', 'furniture', 120, 2, 'store', null),
  ('plant_cactus',   'Big cactus',        'floor_left', 'plants',     60, 1, 'store', null),
  ('plant_fern',     'Fern on a stand',   'floor_left', 'plants',     85, 3, 'store', null),
  ('armchair_peach', 'Peachy armchair',   'floor_mid',  'furniture',  90, 1, 'store', null),
  ('sofa_lavender',  'Lavender loveseat', 'floor_mid',  'furniture', 200, 5, 'store', null),
  ('bench_cozy',     'Cozy bench',        'floor_mid',  'furniture', 150, 4, 'store', null),
  ('lamp_mushroom',  'Mushroom lamp',     'floor_right','lighting',   75, 2, 'store', null),
  ('coatrack',       'Coat stand',        'floor_right','furniture',  55, 1, 'store', null),
  ('plant_tall',     'Tall palm',         'floor_right','plants',    130, 4, 'store', null),
  ('fishbowl',       'Goldfish bowl',     'floor_front','decor',      60, 1, 'store', null),
  ('pouf',           'Knitted pouf',      'floor_front','furniture',  45, 1, 'store', null),
  ('catbed',         'Cat bed (with cat)','floor_front','decor',     180, 6, 'store', null),
  ('radio',          'Retro radio',       'floor_front','decor',      95, 3, 'store', null)
on conflict (id) do update set
  name = excluded.name, spot = excluded.spot, category = excluded.category, price = excluded.price,
  min_level = excluded.min_level, kind = excluded.kind, level = excluded.level;

-- ---------- Stars / XP ledger ----------------------------------------------
-- One row per earn or spend. XP only ever goes up (purchases have xp = 0).
create table if not exists public.ledger (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  day     date not null,
  person  text,                       -- 'p1' | 'p2' | 'wall'
  kind    text not null check (kind in ('add','done','buy')),
  task_id uuid references public.tasks(id) on delete set null,
  item_id text references public.items(id),
  stars   int not null,
  xp      int not null
);
create index if not exists ledger_done_task_idx on public.ledger (task_id) where kind = 'done';

-- ---------- What the household owns ----------------------------------------
create table if not exists public.owned (
  id        uuid primary key default gen_random_uuid(),
  item_id   text not null unique references public.items(id),
  bought_by text,                     -- who bought it (null for level rewards)
  via       text not null default 'store' check (via in ('store','level')),
  got_at    timestamptz not null default now(),
  spot      text unique               -- where it sits in the room; null = in Storage
);

-- ---------- Levels ----------------------------------------------------------
create or replace function public.level_thresholds() returns int[]
language sql immutable as $$ select array[0,60,150,280,450,660,920,1230,1600,2050] $$;

create or replace function public.level_for(x int) returns int
language sql immutable as $$
  select count(*)::int from unnest(public.level_thresholds()) t where t <= x
$$;

create or replace function public.level_at(l int) returns int
language sql immutable as $$ select (public.level_thresholds())[l] $$;

-- Hand out any level rewards the household has reached but doesn't own yet.
create or replace function public.sync_levels() returns void
language plpgsql volatile security definer set search_path = public as $$
declare lv int; it record;
begin
  lv := level_for(coalesce((select sum(xp) from ledger), 0)::int);
  for it in select * from items i
             where i.kind = 'level' and i.level <= lv
               and not exists (select 1 from owned o where o.item_id = i.id)
             order by i.level loop
    insert into owned (item_id, via, spot)
    values (it.id, 'level', case when exists (select 1 from owned o where o.spot = it.spot) then null else it.spot end);
  end loop;
end $$;

-- This week's Store: 8 items, reshuffled every Monday. Items one level above yours
-- show as "unlocks soon"; anything bought this week stays listed as owned.
create or replace function public.stock_ids(lv int, wk date) returns setof text
language sql stable set search_path = public as $$
  select i.id from items i
   where i.kind = 'store'
     and i.min_level <= lv + 1
     and (not exists (select 1 from owned o where o.item_id = i.id)
          or exists (select 1 from owned o where o.item_id = i.id and hday(o.got_at) >= wk))
   order by md5(i.id || wk::text)
   limit 8
$$;

-- ---------- Earning ---------------------------------------------------------
-- 1 Star for adding a task, at most 5 a day per person.
create or replace function public.award_add() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date := household_day(); who text := coalesce(new.created_by, 'wall');
begin
  if (select count(*) from ledger where kind = 'add' and day = d and person = who) < 5 then
    insert into ledger (day, person, kind, task_id, stars, xp) values (d, who, 'add', new.id, 1, 1);
  end if;
  return new;
end $$;
drop trigger if exists tasks_award_add on public.tasks;
create trigger tasks_award_add after insert on public.tasks
  for each row execute function public.award_add();

-- Finishing: 10 Stars (15 if High) + 1 per day it waited, up to +5.
create or replace function public.complete_task(p_task uuid, p_by text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := household_day(); t tasks%rowtype; award int := 0; before_lv int; after_lv int;
begin
  if not is_member() then raise exception 'not a member'; end if;
  before_lv := level_for(coalesce((select sum(xp) from ledger), 0)::int);
  update tasks set done_at = now(), done_by = p_by, paused_day = null
   where id = p_task and done_at is null
   returning * into t;
  if found then
    award := (case when t.priority = 2 then 15 else 10 end) + least(5, greatest(0, d - hday(t.created_at)));
    insert into ledger (day, person, kind, task_id, stars, xp) values (d, p_by, 'done', t.id, award, award);
    perform sync_levels();
  end if;
  after_lv := level_for(coalesce((select sum(xp) from ledger), 0)::int);
  return get_board() || jsonb_build_object('award', award, 'level_up', after_lv > before_lv, 'level', after_lv);
end $$;

-- Undo takes the Stars back (items already earned stay — nothing is ever taken away).
create or replace function public.uncomplete_task(p_task uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  delete from ledger where kind = 'done' and task_id = p_task;
  update tasks set done_at = null, done_by = null where id = p_task;
  return get_board();
end $$;

-- ---------- Pause with a "left off" note ------------------------------------
create or replace function public.pause_task(p text, p_task uuid, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := household_day(); note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not is_member() then raise exception 'not a member'; end if;
  update tasks set
    paused_day = d,
    progress_notes = progress_notes || case when note is null then '[]'::jsonb
                     else jsonb_build_array(jsonb_build_object('day', d, 'by', p, 'note', note)) end
  where id = p_task and done_at is null;
  return get_board();
end $$;

create or replace function public.resume_task(p_task uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update tasks set paused_day = null where id = p_task;
  return get_board();
end $$;

-- ---------- The home --------------------------------------------------------
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
                 'price', i.price, 'min_level', i.min_level,
                 'owned', exists (select 1 from owned o where o.item_id = i.id)) order by i.price desc, i.id)
               from items i where i.id in (select stock_ids(lv, wk))), '[]'::jsonb),
    'restock_in', (wk + 7) - d
  );
end $$;

create or replace function public.buy_item(p_item text, p_by text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := household_day(); wk date := date_trunc('week', household_day())::date;
        it items%rowtype; lv int; bal int;
begin
  if not is_member() then raise exception 'not a member'; end if;
  perform pg_advisory_xact_lock(4242);
  perform sync_levels();
  lv  := level_for(coalesce((select sum(xp) from ledger), 0)::int);
  bal := coalesce((select sum(stars) from ledger), 0)::int;
  select * into it from items where id = p_item and kind = 'store';
  if not found then return jsonb_build_object('error', 'That item isn''t for sale.'); end if;
  if exists (select 1 from owned where item_id = it.id) then
    return jsonb_build_object('error', 'You already own that one.');
  end if;
  if p_item not in (select stock_ids(lv, wk)) then
    return jsonb_build_object('error', 'That item isn''t in this week''s Store.');
  end if;
  if it.min_level > lv then
    return jsonb_build_object('error', 'Unlocks at level ' || it.min_level || '.');
  end if;
  if bal < it.price then
    return jsonb_build_object('error', 'You need ' || (it.price - bal) || ' more Stars.');
  end if;
  insert into ledger (day, person, kind, item_id, stars, xp) values (d, p_by, 'buy', it.id, -it.price, 0);
  update owned set spot = null where spot = it.spot;           -- whatever was there goes to Storage
  insert into owned (item_id, bought_by, via, spot) values (it.id, p_by, 'store', it.spot);
  return get_home();
end $$;

-- Put an owned item into its spot (the current occupant goes to Storage).
create or replace function public.place_item(p_owned uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s text;
begin
  if not is_member() then raise exception 'not a member'; end if;
  perform pg_advisory_xact_lock(4242);
  select i.spot into s from owned o join items i on i.id = o.item_id where o.id = p_owned;
  if s is null then return jsonb_build_object('error', 'Item not found.'); end if;
  update owned set spot = null where spot = s and id <> p_owned;
  update owned set spot = s where id = p_owned;
  return get_home();
end $$;

create or replace function public.store_item(p_owned uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update owned set spot = null where id = p_owned;
  return get_home();
end $$;

-- ---------- Security & live sync ------------------------------------------
alter table public.items  enable row level security;
alter table public.ledger enable row level security;
alter table public.owned  enable row level security;

drop policy if exists items_read on public.items;
create policy items_read on public.items for select to authenticated using (public.is_member());
drop policy if exists ledger_read on public.ledger;
create policy ledger_read on public.ledger for select to authenticated using (public.is_member());
drop policy if exists owned_read on public.owned;
create policy owned_read on public.owned for select to authenticated using (public.is_member());

do $$ begin alter publication supabase_realtime add table public.owned;
exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.ledger;
exception when duplicate_object then null; end $$;
