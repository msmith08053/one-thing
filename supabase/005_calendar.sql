-- ============================================================
-- One Thing — upgrade 005: Plan (shared calendar)
--  · Events for me / my partner / both of us, one-off or repeating
--    (weekly, every 2 weeks, monthly), all-day or with times
--  · "I went" earns +10 Stars (shared events: +10 each, one tap)
--  · Reminder 1 hour before (sent by the notify function's 5-minute tick)
--  · A private calendar feed for the iPhone Calendar app, with a reset
--  · Groceries: "Got everything" now pays a flat 10 Stars per order
--
-- Run AFTER 004. Supabase → SQL Editor → Run. Safe to re-run.
-- ============================================================

-- ---------- Tables ---------------------------------------------------------------
create table if not exists public.events (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_hh() references public.households(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  whose        text not null check (whose in ('p1','p2','both')),
  start_date   date not null,
  all_day      boolean not null default false,
  start_time   time,
  end_time     time,
  repeat       text not null default 'none' check (repeat in ('none','weekly','biweekly','monthly')),
  location     text check (char_length(location) <= 200),
  notes        text check (char_length(notes) <= 1000),
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists events_hh_idx on public.events (household_id, start_date);

-- One row per occurrence someone went to.
create table if not exists public.event_went (
  household_id uuid not null references public.households(id) on delete cascade,
  event_id     uuid not null references public.events(id) on delete cascade,
  occ          date not null,
  by_person    text,
  at           timestamptz not null default now(),
  primary key (event_id, occ)
);

-- One row per occurrence a reminder went out for (so each is sent once).
create table if not exists public.event_reminded (
  event_id uuid not null references public.events(id) on delete cascade,
  occ      date not null,
  at       timestamptz not null default now(),
  primary key (event_id, occ)
);

alter table public.ledger add column if not exists event_id uuid references public.events(id) on delete set null;
alter table public.ledger add column if not exists event_occ date;
alter table public.ledger drop constraint if exists ledger_kind_check;
alter table public.ledger add  constraint ledger_kind_check check (kind in ('add','done','buy','trip','note','bonus','adjust','went'));

-- Private calendar feed link (one per household). Existing households get one too.
alter table public.households add column if not exists ics_token text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists households_ics_token_idx on public.households (ics_token);

-- ---------- Occurrences ---------------------------------------------------------------
-- Every date an event happens on between p_from and p_to.
create or replace function public._occ(e public.events, p_from date, p_to date) returns setof date
language sql stable set search_path = public as $$
  select d from (
    select e.start_date as d where e.repeat = 'none'
    union all
    select g::date from generate_series(e.start_date::timestamp, p_to::timestamp, interval '7 days') g where e.repeat = 'weekly'
    union all
    select g::date from generate_series(e.start_date::timestamp, p_to::timestamp, interval '14 days') g where e.repeat = 'biweekly'
    union all
    select (e.start_date + make_interval(months => k))::date
      from generate_series(0, greatest(-1, ((extract(year from p_to) - extract(year from e.start_date)) * 12
                                        + extract(month from p_to) - extract(month from e.start_date))::int)) k
     where e.repeat = 'monthly'
  ) x
  where d between p_from and p_to
$$;

-- Can "I went" be tapped right now? From the start time until 4 a.m. the next morning.
create or replace function public._can_go(e public.events, p_occ date, p_now timestamp) returns boolean
language sql immutable as $$
  select p_now >= (p_occ + coalesce(case when e.all_day then null else e.start_time end, time '00:00'))
     and p_now <  (p_occ + 1) + time '04:00'
$$;

-- ---------- Reading -----------------------------------------------------------------
create or replace function public.get_plan(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare hh uuid := current_hh(); lnow timestamp := now() at time zone tz();
begin
  if not is_member() then raise exception 'not a member'; end if;
  if p_to < p_from or p_to - p_from > 92 then return jsonb_build_object('error', 'Pick a shorter range.'); end if;
  return jsonb_build_object(
    'day', household_day(),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'title', e.title, 'whose', e.whose, 'date', o.d,
               'start_date', e.start_date, 'all_day', e.all_day,
               'start_time', to_char(e.start_time, 'HH24:MI'), 'end_time', to_char(e.end_time, 'HH24:MI'),
               'repeat', e.repeat, 'location', e.location, 'notes', e.notes, 'created_by', e.created_by,
               'went', w.event_id is not null, 'can_go', w.event_id is null and _can_go(e, o.d, lnow))
             order by o.d, e.all_day desc, e.start_time, e.title)
        from events e
        cross join lateral _occ(e, p_from, p_to) o(d)
        left join event_went w on w.event_id = e.id and w.occ = o.d
       where e.household_id = hh), '[]'::jsonb));
end $$;

-- Today's plans + how many tasks are open (for the "See all tasks" button).
create or replace function public.get_today_extras() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d date := household_day();
begin
  if not is_member() then raise exception 'not a member'; end if;
  return get_plan(d, d) || jsonb_build_object(
    'open_total', (select count(*) from tasks where household_id = current_hh() and done_at is null and system is null));
end $$;

-- ---------- Writing -----------------------------------------------------------------
create or replace function public.save_event(
  p_id uuid, p_title text, p_whose text, p_date date, p_all_day boolean,
  p_start time, p_end time, p_repeat text, p_location text, p_notes text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); t text := btrim(coalesce(p_title, '')); rid uuid;
begin
  if not is_member() then raise exception 'not a member'; end if;
  if t = '' then return jsonb_build_object('error', 'Give it a name.'); end if;
  if char_length(t) > 120 then return jsonb_build_object('error', 'That name is a bit long (120 characters max).'); end if;
  if p_whose not in ('p1','p2','both') then return jsonb_build_object('error', 'Pick whose event it is.'); end if;
  if p_date is null then return jsonb_build_object('error', 'Pick a date.'); end if;
  if coalesce(p_repeat, 'none') not in ('none','weekly','biweekly','monthly') then return jsonb_build_object('error', 'Unknown repeat.'); end if;
  if not coalesce(p_all_day, false) and p_start is null then return jsonb_build_object('error', 'Pick a start time, or turn on All day.'); end if;
  if not coalesce(p_all_day, false) and p_end is not null and p_end <= p_start then
    return jsonb_build_object('error', 'The end time is before the start.');
  end if;
  if p_id is null then
    insert into events (household_id, title, whose, start_date, all_day, start_time, end_time, repeat, location, notes, created_by)
    values (hh, t, p_whose, p_date, coalesce(p_all_day, false),
            case when p_all_day then null else p_start end, case when p_all_day then null else p_end end,
            coalesce(p_repeat, 'none'), nullif(btrim(left(p_location, 200)), ''), nullif(btrim(left(p_notes, 1000)), ''), my_person())
    returning id into rid;
  else
    update events set title = t, whose = p_whose, start_date = p_date, all_day = coalesce(p_all_day, false),
           start_time = case when p_all_day then null else p_start end,
           end_time   = case when p_all_day then null else p_end end,
           repeat = coalesce(p_repeat, 'none'),
           location = nullif(btrim(left(p_location, 200)), ''), notes = nullif(btrim(left(p_notes, 1000)), ''),
           updated_at = now()
     where id = p_id and household_id = hh
    returning id into rid;
    if rid is null then return jsonb_build_object('error', 'Event not found.'); end if;
    -- A changed time should be able to remind again.
    delete from event_reminded where event_id = rid;
  end if;
  return jsonb_build_object('id', rid);
end $$;

create or replace function public.delete_event(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  delete from events where id = p_id and household_id = current_hh();   -- Stars already earned stay
  return jsonb_build_object('ok', true);
end $$;

-- "I went": +10 Stars to whoever the event is for (both of you on shared events).
create or replace function public.went_event(p_event uuid, p_occ date) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); e events%rowtype; n int;
        before_lv int; after_lv int; lnow timestamp := now() at time zone tz();
begin
  if not is_member() then raise exception 'not a member'; end if;
  select * into e from events where id = p_event and household_id = hh;
  if not found then return jsonb_build_object('error', 'Event not found.'); end if;
  if not exists (select 1 from _occ(e, p_occ, p_occ)) then return jsonb_build_object('error', 'That event isn''t on that day.'); end if;
  if not _can_go(e, p_occ, lnow) then
    return jsonb_build_object('error', case when lnow < p_occ + coalesce(e.start_time, time '00:00')
                                            then 'You can tap this once it starts.' else 'That one has passed.' end);
  end if;
  insert into event_went (household_id, event_id, occ, by_person) values (hh, e.id, p_occ, my_person())
  on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('error', 'Already counted.'); end if;
  before_lv := level_for((hh_totals()).xp);
  insert into ledger (household_id, day, person, kind, event_id, event_occ, stars, xp)
  select hh, d, p, 'went', e.id, p_occ, 10, 10
    from unnest(case when e.whose = 'both' then array['p1','p2'] else array[e.whose] end) p;
  perform sync_levels();
  after_lv := level_for((hh_totals()).xp);
  return jsonb_build_object('award', 10, 'each', e.whose = 'both', 'level_up', after_lv > before_lv, 'level', after_lv);
end $$;

-- Undo "I went" (Stars come back off, never below zero).
create or replace function public.unwent_event(p_event uuid, p_occ date) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); bal int;
begin
  if not is_member() then raise exception 'not a member'; end if;
  delete from event_went where event_id = p_event and occ = p_occ and household_id = hh;
  delete from ledger where household_id = hh and kind = 'went' and event_id = p_event and event_occ = p_occ;
  bal := (hh_totals()).stars;
  if bal < 0 then
    insert into ledger (household_id, day, person, kind, stars, xp) values (hh, household_day(), my_person(), 'adjust', -bal, 0);
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- Calendar feed link ---------------------------------------------------------
create or replace function public.household_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'member', h.id is not null,
    'person', m.person,
    'household', h.id,
    'code', h.code,
    'ics', h.ics_token,
    'names', case when h.id is not null then jsonb_build_object('p1', h.name_p1, 'p2', h.name_p2) end,
    'add_pref', case when h.id is not null then jsonb_build_object('p1', h.add_pref_p1, 'p2', h.add_pref_p2) end)
  from (select 1) x
  left join members m on m.uid = auth.uid()
  left join households h on h.id = m.household_id
$$;

create or replace function public.reset_calendar_link() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update households set ics_token = replace(gen_random_uuid()::text, '-', '') where id = my_hh();
  return household_status();
end $$;

-- ---------- For the notify function only (service role) ----------------------------------
-- Everything the calendar feed needs, looked up by its private token.
create or replace function public._ics_for(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tz', h.tz, 'names', jsonb_build_object('p1', h.name_p1, 'p2', h.name_p2),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
                 'id', e.id, 'title', e.title, 'whose', e.whose, 'start_date', e.start_date, 'all_day', e.all_day,
                 'start_time', to_char(e.start_time, 'HH24:MI'), 'end_time', to_char(e.end_time, 'HH24:MI'),
                 'repeat', e.repeat, 'location', e.location, 'notes', e.notes, 'updated_at', e.updated_at) order by e.start_date)
               from events e
              where e.household_id = h.id
                and (e.repeat <> 'none' or e.start_date >= current_date - 365)), '[]'::jsonb))
  from households h
  where length(coalesce(p_token, '')) >= 32 and h.ics_token = p_token
$$;

-- Events starting within the next hour that haven't had a reminder yet. Marks them.
create or replace function public._due_event_reminders() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare res jsonb := '[]'::jsonb; r record; n int;
begin
  for r in
    select h.id as hh, e.id as event_id, o.d as occ, e.title, e.whose, e.location,
           to_char(e.start_time, 'HH24:MI') as start_time
      from households h
      join events e on e.household_id = h.id and not e.all_day and e.start_time is not null
      cross join lateral _occ(e, ((now() at time zone h.tz))::date, ((now() at time zone h.tz))::date + 1) o(d)
     where (now() at time zone h.tz) >= (o.d + e.start_time) - interval '1 hour'
       and (now() at time zone h.tz) <  (o.d + e.start_time)
       and not exists (select 1 from event_reminded x where x.event_id = e.id and x.occ = o.d)
  loop
    insert into event_reminded (event_id, occ) values (r.event_id, r.occ) on conflict do nothing;
    get diagnostics n = row_count;
    if n > 0 then
      res := res || jsonb_build_array(jsonb_build_object('hh', r.hh, 'title', r.title, 'whose', r.whose,
                                                         'location', r.location, 'start_time', r.start_time));
    end if;
  end loop;
  delete from event_reminded where at < now() - interval '30 days';
  return res;
end $$;

revoke all on function public._ics_for(text) from public, anon, authenticated;
revoke all on function public._due_event_reminders() from public, anon, authenticated;
grant execute on function public._ics_for(text), public._due_event_reminders() to service_role;

-- ---------- Groceries: flat 10 Stars per order (still 2 a day) ----------------------------
create or replace function public.finish_trip(p_list text, p_by text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); d date := household_day(); n int; stars int := 0; tid uuid;
begin
  if not is_member() then raise exception 'not a member'; end if;
  perform pg_advisory_xact_lock(hashtext('trip' || hh::text));
  select count(*) into n from shop_items where household_id = hh and list = p_list and trip_id is null and checked_at is not null;
  if n = 0 then return jsonb_build_object('error', 'Tick off what you got first.'); end if;
  if (select count(*) from ledger where household_id = hh and kind = 'trip' and day = d) < 2 then stars := 10; end if;
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

-- ---------- Security ---------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.event_went enable row level security;
alter table public.event_reminded enable row level security;   -- functions only
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated using (household_id = public.my_hh());
drop policy if exists event_went_read on public.event_went;
create policy event_went_read on public.event_went for select to authenticated using (household_id = public.my_hh());

-- Live updates on the other phone.
do $$ begin alter publication supabase_realtime add table public.events;
exception when others then null; end $$;
do $$ begin alter publication supabase_realtime add table public.event_went;
exception when others then null; end $$;
