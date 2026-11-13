-- ============================================================
-- One Thing — upgrade 006: Someday, Together + App Store readiness
--  · Someday, Together: a shared list of things to do together.
--    "Let's do it" turns an idea into an event; going to it moves the
--    idea into your "Done together" scrapbook.
--  · Delete my account (required by the App Store)
--  · iPhone app notifications (Apple push) alongside web notifications
--
-- Run AFTER 005. Supabase → SQL Editor → Run. Safe to re-run.
-- ============================================================

-- ---------- Someday, Together --------------------------------------------------------
create table if not exists public.someday (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.current_hh() references public.households(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 120),
  kind         text not null default 'other' check (kind in ('eat','go','watch','make','other')),
  notes        text check (char_length(notes) <= 500),
  added_by     text,
  created_at   timestamptz not null default now(),
  event_id     uuid references public.events(id) on delete set null,   -- planned as this event
  done_at      timestamptz,
  done_occ     date                                                  -- the day you went
);
create index if not exists someday_hh_idx on public.someday (household_id);

create or replace function public.get_someday() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare hh uuid := current_hh();
begin
  if not is_member() then raise exception 'not a member'; end if;
  return jsonb_build_object(
    'ideas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'title', s.title, 'kind', s.kind, 'notes', s.notes, 'added_by', s.added_by, 'created_at', s.created_at,
        'event_id', s.event_id, 'event_date',
          (select min(d) from events e cross join lateral _occ(e, household_day(), household_day() + 400) o(d) where e.id = s.event_id))
        order by s.created_at desc)
      from someday s where s.household_id = hh and s.done_at is null), '[]'::jsonb),
    'done', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'kind', s.kind, 'done_occ', s.done_occ)
        order by s.done_occ desc, s.done_at desc)
      from someday s where s.household_id = hh and s.done_at is not null), '[]'::jsonb));
end $$;

create or replace function public.save_someday(p_id uuid, p_title text, p_kind text, p_notes text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); t text := btrim(coalesce(p_title, '')); rid uuid;
begin
  if not is_member() then raise exception 'not a member'; end if;
  if t = '' then return jsonb_build_object('error', 'What would you like to do?'); end if;
  if char_length(t) > 120 then return jsonb_build_object('error', 'That''s a bit long (120 characters max).'); end if;
  if coalesce(p_kind, 'other') not in ('eat','go','watch','make','other') then return jsonb_build_object('error', 'Unknown kind.'); end if;
  if p_id is null then
    insert into someday (household_id, title, kind, notes, added_by)
    values (hh, t, coalesce(p_kind, 'other'), nullif(btrim(left(p_notes, 500)), ''), my_person()) returning id into rid;
  else
    update someday set title = t, kind = coalesce(p_kind, kind), notes = nullif(btrim(left(p_notes, 500)), '')
     where id = p_id and household_id = hh returning id into rid;
    if rid is null then return jsonb_build_object('error', 'Idea not found.'); end if;
  end if;
  return get_someday() || jsonb_build_object('id', rid);
end $$;

create or replace function public.delete_someday(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  delete from someday where id = p_id and household_id = current_hh();
  return get_someday();
end $$;

-- Put a finished idea back on the list (e.g. tapped by mistake).
create or replace function public.reopen_someday(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_member() then raise exception 'not a member'; end if;
  update someday set done_at = null, done_occ = null where id = p_id and household_id = current_hh();
  return get_someday();
end $$;

-- save_event gains an optional link to a Someday idea ("Let's do it").
drop function if exists public.save_event(uuid, text, text, date, boolean, time, time, text, text, text);
create or replace function public.save_event(
  p_id uuid, p_title text, p_whose text, p_date date, p_all_day boolean,
  p_start time, p_end time, p_repeat text, p_location text, p_notes text, p_someday uuid default null) returns jsonb
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
    delete from event_reminded where event_id = rid;
  end if;
  if p_someday is not null then
    update someday set event_id = rid where id = p_someday and household_id = hh;
  end if;
  return jsonb_build_object('id', rid);
end $$;

-- Going to an event that came from an idea moves the idea into "Done together".
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
  update someday set done_at = now(), done_occ = p_occ where household_id = hh and event_id = e.id and done_at is null;
  perform sync_levels();
  after_lv := level_for((hh_totals()).xp);
  return jsonb_build_object('award', 10, 'each', e.whose = 'both', 'level_up', after_lv > before_lv, 'level', after_lv,
                            'someday', exists (select 1 from someday where household_id = hh and event_id = e.id and done_occ = p_occ));
end $$;

create or replace function public.unwent_event(p_event uuid, p_occ date) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid := current_hh(); bal int;
begin
  if not is_member() then raise exception 'not a member'; end if;
  delete from event_went where event_id = p_event and occ = p_occ and household_id = hh;
  delete from ledger where household_id = hh and kind = 'went' and event_id = p_event and event_occ = p_occ;
  update someday set done_at = null, done_occ = null where household_id = hh and event_id = p_event and done_occ = p_occ;
  bal := (hh_totals()).stars;
  if bal < 0 then
    insert into ledger (household_id, day, person, kind, stars, xp) values (hh, household_day(), my_person(), 'adjust', -bal, 0);
  end if;
  return jsonb_build_object('ok', true);
end $$;

alter table public.someday enable row level security;
drop policy if exists someday_read on public.someday;
create policy someday_read on public.someday for select to authenticated using (household_id = public.my_hh());
do $$ begin alter publication supabase_realtime add table public.someday;
exception when others then null; end $$;

-- ---------- iPhone app notifications (Apple push) ---------------------------------------
-- Web subscriptions keep working; the App Store app registers an Apple device token instead.
alter table public.push_subs add column if not exists kind text not null default 'web';
alter table public.push_subs drop constraint if exists push_subs_kind_check;
alter table public.push_subs add constraint push_subs_kind_check check (kind in ('web','apns'));
alter table public.push_subs alter column p256dh set default '';
alter table public.push_subs alter column auth set default '';

-- ---------- Delete my account (App Store requirement) ----------------------------------
-- Removes this device's sign-in from the household. If nobody is left, the whole
-- household and everything in it is deleted. Called by the notify function, which
-- also deletes the sign-in itself.
create or replace function public._delete_account(p_uid uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare hh uuid; left_n int;
begin
  select household_id into hh from members where uid = p_uid;
  delete from push_subs where uid = p_uid;
  delete from members where uid = p_uid;
  delete from join_fails where uid = p_uid;
  if hh is null then return jsonb_build_object('ok', true, 'household_deleted', false); end if;
  select count(*) into left_n from members where household_id = hh;
  if left_n = 0 then
    delete from households where id = hh;   -- cascades to every table in the household
    return jsonb_build_object('ok', true, 'household_deleted', true);
  end if;
  return jsonb_build_object('ok', true, 'household_deleted', false, 'others_left', left_n);
end $$;
revoke all on function public._delete_account(uuid) from public, anon, authenticated;
grant execute on function public._delete_account(uuid) to service_role;

-- Who else is in my household? (so the app can say what deleting will do)
create or replace function public.household_members() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('count', count(*), 'others', count(*) filter (where uid <> auth.uid()))
  from members where household_id = public.my_hh()
$$;
