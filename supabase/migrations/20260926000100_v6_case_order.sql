-- Lyceum Placements — Placement Management System
-- Copyright © Bhanu Mendis - LGH IT
--
-- v6.6 — the time-dependent orders at scale. Idempotent.
--
-- Three list orders (severity, urgency, retention) sort on what a case means *now* under the
-- configured service levels: no index on public.cases can hold them, so each page evaluated
-- every visible case (3.3 s for the severity order at a million cases). public.case_stamps
-- keeps, for every case, those sort keys together with the window in which they hold: the
-- settings they were computed under and the instants between which "now" may move without
-- changing them. The keys change only at known instants (a clock's whole-day count ticks
-- over, a hold review or retention date passes), so the window is exact, and lpl-api's worker
-- retakes a stamp soon after its window closes.
--
-- Nothing reads a stamp except to order: a page takes candidates from the stamp indexes, adds
-- every case whose stamp is not valid now, and evaluates all of them live; a stamp that is
-- fresh equals the live value, so the page is exactly what evaluating every case would give.
-- The integration suite runs the reference parity queries both ways.

-- ---------------------------------------------------------------------------
-- Instants at which a whole-day count changes.
-- ---------------------------------------------------------------------------

-- The first instant after now_ts at which lpl_days_until(due, ·) changes: the count
-- ceil((due - t) / 1 day) drops by one when t reaches due - (count - 1) days.
create or replace function public.lpl_day_turn(due timestamptz, now_ts timestamptz) returns timestamptz
  language sql immutable parallel safe as $$
  select due - make_interval(secs => 86400 * (public.lpl_days_until(due, now_ts) - 1))
$$;

-- A date a day past which lpl_days_until turns negative: that instant, while it is still ahead.
create or replace function public.lpl_after_day(t timestamptz, now_ts timestamptz) returns timestamptz
  language sql immutable parallel safe as $$
  select case when t + interval '86400 seconds' > now_ts then t + interval '86400 seconds' end
$$;

-- The service levels a stamp depends on, as one comparable key.
create or replace function public.case_stamp_key() returns text
  language sql stable parallel safe set search_path = public as $$
  select concat_ws('|', public.org_number('{sla,cisDays}', 7), public.org_number('{sla,offerReminderDays}', 21),
    public.org_number('{sla,followUpMonths}', 3), public.org_number('{retention,exitedMonths}', 24),
    public.org_number('{retention,completedMonths}', 84), public.org_number('{retention,dormantMonths}', 18),
    public.org_number('{retention,warnDays}', 30))
$$;

-- ---------------------------------------------------------------------------
-- case_state, as before, plus each clock's due instant, the stamp key, and state_until: the
-- first instant after now at which severity_rank or worst_days could change (null: never).
-- ---------------------------------------------------------------------------

drop view if exists public.case_state;
create view public.case_state with (security_invoker = true) as
select s.*,
  coalesce(s.breached_raw, 0) as breached,
  coalesce(s.due_soon_raw, 0) as due_soon,
  case
    when coalesce(s.breached_raw, 0) > 0 or s.gate_returned_now is not null then 0
    when coalesce(s.due_soon_raw, 0) > 0 or s.hold_review_due or s.retention = 'overdue' then 1
    when s.gate_pending_now is not null or s.docs_to_review > 0 or s.profile_submitted_now then 2
    else 3 end as severity_rank
from (
  select k.*,
    coalesce((k.cis_days < 0)::int, 0) + coalesce((k.cis2_days < 0)::int, 0) + coalesce((k.offer_days < 0)::int, 0) + coalesce((k.fu_days < 0)::int, 0) as breached_raw,
    coalesce((k.cis_days between 0 and 2)::int, 0) + coalesce((k.cis2_days between 0 and 2)::int, 0)
      + coalesce((k.offer_days between 0 and k.cfg_offer_days)::int, 0) + coalesce((k.fu_days between 0 and 7)::int, 0) as due_soon_raw,
    case when k.status = 'open' then k.docs_uploaded else 0 end as docs_to_review,
    case when k.status = 'open' then k.gate_pending end as gate_pending_now,
    case when k.status = 'open' then k.gate_returned end as gate_returned_now,
    (k.status = 'open' and k.profile_submitted) as profile_submitted_now,
    case
      when k.disposed then 'disposed'
      when k.legal_hold then 'held'
      when k.retention_due_at is null then 'none'
      when public.lpl_days_until(k.retention_due_at, k.now_ts) < 0 then 'overdue'
      when public.lpl_days_until(k.retention_due_at, k.now_ts) <= k.cfg_ret_warn then 'due_soon'
      else 'scheduled' end as retention,
    least(k.cis_days, k.cis2_days, k.offer_days, k.fu_days) as worst_days,
    -- Every running clock's day count (severity and urgency), the hold review falling due, and
    -- retention falling overdue (severity) are the only ways time moves either key.
    least(public.lpl_day_turn(k.cis_due_at, k.now_ts), public.lpl_day_turn(k.cis2_due_at, k.now_ts),
          public.lpl_day_turn(k.offer_due_at, k.now_ts), public.lpl_day_turn(k.fu_due_at, k.now_ts),
          case when k.status in ('hold', 'deferred') and k.hold_review_at is not null then public.lpl_after_day(k.hold_review_at, k.now_ts) end,
          public.lpl_after_day(k.retention_due_at, k.now_ts)) as state_until
  from (
    select d.*,
      public.lpl_days_until(d.cis_due_at, d.now_ts) as cis_days,
      public.lpl_days_until(d.cis2_due_at, d.now_ts) as cis2_days,
      public.lpl_days_until(d.offer_due_at, d.now_ts) as offer_days,
      public.lpl_days_until(d.fu_due_at, d.now_ts) as fu_days,
      (d.status in ('hold', 'deferred') and d.hold_review_at is not null and public.lpl_days_until(d.hold_review_at, d.now_ts) < 0) as hold_review_due
    from (
      select c.*, v.cfg_offer_days, v.cfg_ret_warn, v.now_ts, v.stamp_key,
        case when c.status = 'open' and c.cis_start_at is not null and c.done_mask & 8 = 0
          then public.lpl_add_days(c.cis_start_at, v.cfg_cis_days) end as cis_due_at,
        case when c.status = 'open' and c.cis2_from is not null
          then public.lpl_add_days(c.cis2_from, v.cfg_cis_days) end as cis2_due_at,
        case when c.status = 'open' and c.offer_lapse_at is not null and c.done_mask & 8192 = 0
          then c.offer_lapse_at end as offer_due_at,
        case when c.status = 'open' and c.arrival_at is not null and c.done_mask & 536870912 <> 0 and c.done_mask & 1073741824 = 0
          then public.lpl_add_months(c.arrival_at, v.cfg_fu_months) end as fu_due_at,
        case when c.retention_anchor_at is not null
          then public.lpl_add_months(c.retention_anchor_at, case c.retention_kind when 'exited' then v.cfg_ret_exited when 'completed' then v.cfg_ret_completed else v.cfg_ret_dormant end) end as retention_due_at
      from public.cases c,
        -- One row of constants. Each value is an InitPlan; the planner pulls this subquery up.
        lateral (select
          (select public.org_number('{sla,cisDays}', 7))                as cfg_cis_days,
          (select public.org_number('{sla,offerReminderDays}', 21))     as cfg_offer_days,
          (select public.org_number('{sla,followUpMonths}', 3))         as cfg_fu_months,
          (select public.org_number('{retention,exitedMonths}', 24))    as cfg_ret_exited,
          (select public.org_number('{retention,completedMonths}', 84)) as cfg_ret_completed,
          (select public.org_number('{retention,dormantMonths}', 18))   as cfg_ret_dormant,
          (select public.org_number('{retention,warnDays}', 30))        as cfg_ret_warn,
          (select public.lpl_now())                                     as now_ts,
          (select public.case_stamp_key())                              as stamp_key) v
    ) d
  ) k
) s;
comment on view public.case_state is 'Cases with their clocks, attention and retention evaluated now (see src/lib/summary.ts evaluateCase), with the instant that evaluation next changes. security_invoker: the caller''s row-level security applies.';
revoke all on public.case_state from anon;
grant select on public.case_state to authenticated;

-- ---------------------------------------------------------------------------
-- The stamps: one row per case, maintained by trigger and by lpl-api's worker.
-- ---------------------------------------------------------------------------

create table if not exists public.case_stamps (
  id               text primary key references public.cases (id) on delete cascade,
  cfg              text not null,          -- case_stamp_key() when taken
  at               timestamptz not null,   -- "now" when taken
  until            timestamptz not null,   -- valid while at <= now < until
  severity_rank    smallint not null,
  worst_days       integer,
  retention_due_at timestamptz,
  list_at          timestamptz not null
);
-- Read only through the definer functions below, which answer only callers who see every case.
alter table public.case_stamps enable row level security;
revoke all on public.case_stamps from public, anon, authenticated;
comment on table public.case_stamps is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. The severity, urgency and retention sort keys of each case with the window in which they hold; an index for ordering only, never a source of truth.';
-- One index per order and direction, in exactly the expressions cases_page sorts by.
create index if not exists case_stamps_severity_idx on public.case_stamps (severity_rank, list_at desc, id collate "C");
create index if not exists case_stamps_severity_rev_idx on public.case_stamps (severity_rank desc, list_at, id collate "C");
create index if not exists case_stamps_urgency_idx on public.case_stamps ((coalesce(worst_days, 2147483647)), id collate "C");
create index if not exists case_stamps_retention_idx on public.case_stamps ((coalesce(retention_due_at, 'infinity'::timestamptz)), id collate "C");
-- Finding the stamps that are not valid now.
create index if not exists case_stamps_until_idx on public.case_stamps (until);
create index if not exists case_stamps_cfg_idx on public.case_stamps (cfg);
create index if not exists case_stamps_at_idx on public.case_stamps (at);

-- Take (or retake) the stamps of these cases at lpl_now(). As the owner, so a write by a user
-- who cannot read the case afterwards still leaves a correct stamp.
create or replace function public.case_restamp(p_ids text[]) returns integer
  language plpgsql volatile security definer set search_path = public set jit = off as $$
declare n integer;
begin
  insert into public.case_stamps as t (id, cfg, at, until, severity_rank, worst_days, retention_due_at, list_at)
  select s.id, s.stamp_key, s.now_ts, coalesce(s.state_until, 'infinity'::timestamptz), s.severity_rank, s.worst_days, s.retention_due_at, s.list_at
    from public.case_state s
   where s.id = any (p_ids)
  on conflict (id) do update set cfg = excluded.cfg, at = excluded.at, until = excluded.until, severity_rank = excluded.severity_rank,
    worst_days = excluded.worst_days, retention_due_at = excluded.retention_due_at, list_at = excluded.list_at;
  get diagnostics n = row_count;
  return n;
end $$;

-- Every write to a case retakes its stamp, set-based, once per statement.
create or replace function public.case_stamp_changed() returns trigger
  language plpgsql volatile security definer set search_path = public as $$
begin
  perform public.case_restamp(array(select id from changed));
  return null;
end $$;
drop trigger if exists cases_stamp_insert on public.cases;
create trigger cases_stamp_insert after insert on public.cases referencing new table as changed
  for each statement execute function public.case_stamp_changed();
drop trigger if exists cases_stamp_update on public.cases;
create trigger cases_stamp_update after update on public.cases referencing new table as changed
  for each statement execute function public.case_stamp_changed();

-- The worker's pass (lpl-api, every minute): retake up to p_batch stamps that are not valid
-- now, those whose window closed first, then those taken under other service levels. One
-- worker at a time; returns how many it retook (p_batch means there may be more).
create or replace function public.case_restamp_due(p_batch integer) returns integer
  language plpgsql volatile security definer set search_path = public set jit = off as $$
declare
  key text := public.case_stamp_key();
  now_ts timestamptz := public.lpl_now();
  lim integer := least(greatest(coalesce(p_batch, 1), 1), 100000);
  ids text[];
begin
  if not pg_try_advisory_xact_lock(hashtext('lpl.case_restamp')) then return 0; end if;
  ids := array(select id from public.case_stamps where until <= now_ts order by until limit lim);
  if cardinality(ids) < lim then
    ids := ids || array(select id from public.case_stamps where cfg < key or cfg > key limit lim - cardinality(ids));
  end if;
  if cardinality(ids) < lim then
    ids := ids || array(select id from public.case_stamps where at > now_ts limit lim - cardinality(ids));
  end if;
  if cardinality(ids) = 0 then return 0; end if;
  return public.case_restamp(ids);
end $$;

-- ---------------------------------------------------------------------------
-- Ordering: the ORDER BY of a cases_page request, and the keyset condition after a cursor.
-- Shared by cases_page and case_stamp_ids so the stamp walk and the page order agree exactly.
-- The statement text is built from fixed expressions and quoted, parsed values only.
-- ---------------------------------------------------------------------------

create or replace function public.case_order_sql(p jsonb, after jsonb, out ord text, out seek text, out cur text)
  language plpgsql stable set search_path = public as $$
declare
  k record; keys text[] := '{}'; types text[] := '{}'; descs boolean[] := '{}';
  sort text := coalesce(nullif(p ->> 'sort', ''), 'updated');
  flip boolean := coalesce(p ->> 'dir', '') = case when sort = 'updated' then 'asc' else 'desc' end;
  one_status boolean := coalesce(jsonb_typeof(p -> 'status') = 'array' and jsonb_array_length(p -> 'status') = 1, false) or coalesce(jsonb_typeof(p -> 'stage') = 'number', false);
  uniform boolean; id_desc boolean; after_id text;
  o text[] := '{}'; eqs text := ''; i integer; c text[] := '{}'; lhs text[] := '{}'; rhs text[] := '{}';
begin
  for k in select * from public.case_sort_keys(sort, one_status) loop
    keys := keys || k.expr; types := types || k.typ; descs := descs || (k.descending <> flip);
  end loop;
  if keys = '{}' then raise exception 'Unknown sort %', sort using errcode = '22023'; end if;
  -- When every key runs one way, id runs that way too and the seek is one row comparison (an
  -- index range); otherwise id ascends and the seek is expanded key by key.
  uniform := (select bool_and(d) = bool_or(d) from unnest(descs) d);
  id_desc := uniform and descs[1];
  for i in 1 .. array_length(keys, 1) loop
    o := o || (keys[i] || case when descs[i] then ' desc' else ' asc' end);
    c := c || format('to_jsonb(%s)', keys[i]);
  end loop;
  o := o || case when id_desc then 'id collate "C" desc' else 'id collate "C" asc' end;
  ord := array_to_string(o, ', ');
  cur := array_to_string(c, ', ');
  seek := 'true';
  if jsonb_typeof(after) = 'object' then
    if jsonb_typeof(after -> 'k') is distinct from 'array' or jsonb_array_length(after -> 'k') <> array_length(keys, 1)
       or jsonb_typeof(after -> 'id') is distinct from 'string' then
      raise exception 'The cursor does not belong to this sort' using errcode = '22023';
    end if;
    after_id := after ->> 'id';
    for i in 1 .. array_length(keys, 1) loop
      lhs := lhs || keys[i];
      -- Parsed here, so a malformed value is an error, never text in the statement.
      rhs := rhs || format('%L::%s', case types[i]
        when 'boolean' then ((after -> 'k' ->> (i - 1))::boolean)::text
        when 'integer' then ((after -> 'k' ->> (i - 1))::integer)::text
        else ((after -> 'k' ->> (i - 1))::timestamptz)::text end, types[i]);
    end loop;
    if uniform then
      seek := format('(%s, id collate "C") %s (%s, %L)', array_to_string(lhs, ', '), case when id_desc then '<' else '>' end, array_to_string(rhs, ', '), after_id);
    else
      seek := '';
      for i in 1 .. array_length(keys, 1) loop
        seek := seek || format('%s(%s%s %s %s)', case when i > 1 then ' or ' else '' end, eqs, lhs[i], case when descs[i] then '<' else '>' end, rhs[i]);
        eqs := eqs || format('%s = %s and ', lhs[i], rhs[i]);
      end loop;
      seek := format('%s %s %s and (%s or (%s id collate "C" > %L))', lhs[1], case when descs[1] then '<=' else '>=' end, rhs[1], seek, eqs, after_id);
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Stamp reads, for callers who could read every case themselves (as dashboard_shared): they
-- return ids of cases the caller may read anyway, and nothing to anyone else.
-- ---------------------------------------------------------------------------

-- The first p_limit cases after p.after in p's order among the stamps valid now, and the
-- cursor of the last one (the boundary the caller may trust up to).
create or replace function public.case_stamp_ids(p jsonb, p_limit integer, out ids text[], out last_cursor jsonb)
  language plpgsql stable security definer set search_path = public set jit = off as $$
declare
  o record;
  key text := public.case_stamp_key();
  now_ts timestamptz := public.lpl_now();
  lim integer := least(greatest(coalesce(p_limit, 1), 1), 100000);
begin
  if not (coalesce(public.app_can('case.read'), false) and public.current_case_scope() = 'all') then return; end if;
  if coalesce(p ->> 'sort', '') not in ('severity', 'urgency', 'retention') then return; end if;
  o := public.case_order_sql(p, p -> 'after');
  execute format('select coalesce(array_agg(id order by n), ''{}''), (array_agg(cur order by n desc))[1]
      from (select id, jsonb_build_object(''k'', jsonb_build_array(%s), ''id'', id) as cur, row_number() over (order by %s) as n
              from public.case_stamps
             where cfg = %L and at <= %L::timestamptz and until > %L::timestamptz and %s
             order by %s limit %s) x',
    o.cur, o.ord, key, now_ts, now_ts, o.seek, o.ord, lim)
    into ids, last_cursor;
end $$;

-- Every case whose stamp is not valid now, or null when there are more than p_cap of them (the
-- caller then evaluates every case, as before stamps).
create or replace function public.case_stale_ids(p_cap integer) returns text[]
  language plpgsql stable security definer set search_path = public set jit = off as $$
declare
  key text := public.case_stamp_key();
  now_ts timestamptz := public.lpl_now();
  cap integer := least(greatest(coalesce(p_cap, 1), 1), 100000);
  ids text[];
begin
  if not (coalesce(public.app_can('case.read'), false) and public.current_case_scope() = 'all') then return null; end if;
  ids := array(select id from (
      select id from public.case_stamps where until <= now_ts
      union all select id from public.case_stamps where cfg < key or cfg > key
      union all select id from public.case_stamps where at > now_ts) x
    limit cap + 1);
  if cardinality(ids) > cap then return null; end if;
  return ids;
end $$;

-- ---------------------------------------------------------------------------
-- A search in the list order. case_filter hands a selective search (at most 1,000 matches) to
-- the trigram index and walks the list order for a broad one, which is quick when matches are
-- spread through the list and slow when they cluster far down it (0.8 s at a million cases).
-- For the list order with only status, stage or counsellor alongside, this reads the page as
-- the owner, the caller's visibility applied as in case_search_ids: a walk of the first 5,000
-- cases, and when that does not fill the page, every match through the trigram index, sorted.
-- Ids only, of cases the caller may read.
-- ---------------------------------------------------------------------------

create or replace function public.case_search_page_ids(p jsonb, p_limit integer) returns text[]
  language plpgsql stable security definer set search_path = public set jit = off as $$
declare
  w text[] := array[public.case_visibility_sql()];
  o record;
  pat text;
  lim integer := least(greatest(coalesce(p_limit, 1), 1), 200);
  -- lpl.search_walk only shortens the walk (the integration suite sets it to prove the second
  -- route gives the same page); the answer never depends on it.
  budget integer := least(greatest(coalesce(nullif(current_setting('lpl.search_walk', true), '')::integer, 5000), 1), 5000);
  ids text[];
  prior_idx text := current_setting('enable_indexscan');
  prior_seq text := current_setting('enable_seqscan');
begin
  if coalesce(p ->> 'q', '') = '' or coalesce(nullif(p ->> 'sort', ''), 'updated') <> 'updated' then return null; end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('q', 'status', 'stage', 'counsellor', 'sort', 'dir', 'limit', 'after', 'now')) then return null; end if;
  pat := public.lpl_like_pattern(p ->> 'q');
  -- The same conditions as case_filter, all on stored columns.
  if jsonb_typeof(p -> 'status') = 'array' and jsonb_array_length(p -> 'status') = 1 then
    w := w || format('status = %L', p -> 'status' ->> 0);
  elsif jsonb_typeof(p -> 'status') = 'array' then
    w := w || format('status = any (%L::text[])', array(select jsonb_array_elements_text(p -> 'status')));
  end if;
  if jsonb_typeof(p -> 'stage') = 'number' then w := w || format('status = ''open'' and stage = %s', (p ->> 'stage')::smallint); end if;
  if p ->> 'counsellor' = 'none' then w := w || text 'counsellor_id is null';
  elsif coalesce(p ->> 'counsellor', '') <> '' then w := w || format('counsellor_id = %L', p ->> 'counsellor');
  end if;
  o := public.case_order_sql(p, p -> 'after');
  execute format('select array(select id from (select id, search_text, status, list_at from public.cases where %s and %s order by %s limit %s) x
      where search_text like %L order by %s limit %s)', array_to_string(w, ' and '), o.seek, o.ord, budget, pat, o.ord, lim) into ids;
  if cardinality(ids) >= lim then return ids; end if;
  -- Sparse or clustered: through the trigram index, then sorted (the planner would walk again).
  perform set_config('enable_indexscan', 'off', true), set_config('enable_seqscan', 'off', true);
  execute format('select array(select id from public.cases where %s and search_text like %L and %s order by %s limit %s)',
    array_to_string(w, ' and '), pat, o.seek, o.ord, lim) into ids;
  perform set_config('enable_indexscan', prior_idx, true), set_config('enable_seqscan', prior_seq, true);
  return ids;
end $$;

-- ---------------------------------------------------------------------------
-- cases_page: as before, and the severity, urgency and retention orders from the stamps.
-- ---------------------------------------------------------------------------

drop function if exists public.cases_page(jsonb);
create function public.cases_page(p jsonb) returns table (
  id text, ref text, status text, counsellor_id text, student_user_id text, student_name text, student_email text,
  created_at timestamptz, updated_at timestamptz, current_step smallint, stage smallint,
  progress_done smallint, progress_applicable smallint, progress_pct smallint,
  gate_pending smallint, gate_pending_at timestamptz, gate_pending_round integer, gate_returned smallint,
  docs_uploaded integer, docs_accepted integer, docs_rejected integer, profile_submitted boolean,
  cis_start_at timestamptz, cis2_from timestamptz, offer_lapse_at timestamptz, arrival_at timestamptz, hold_review_at timestamptz,
  retention_anchor_at timestamptz, retention_kind text, disposed boolean, legal_hold boolean,
  last_event_at timestamptz, last_event_by text, last_event_text text, destination text, channel text, exit_code text, done_mask integer, visa_granted boolean,
  cis_sent_at timestamptz, offer_decided_at timestamptz, profile_started boolean, consent_yes boolean,
  transfers_total integer, transfers_unsafeguarded integer, transfers_unapproved integer,
  breached integer, due_soon integer, severity_rank integer, retention text, retention_due_at timestamptz, worst_days integer, cursor jsonb)
  -- JIT compiles for the planner's worst case; a fifty-row page pays ~100 ms for nothing.
  language plpgsql stable security invoker set search_path = public set jit = off as $$
declare
  sort text := coalesce(nullif(p ->> 'sort', ''), 'updated');
  lim integer := least(greatest(coalesce((p ->> 'limit')::integer, 50), 1), 200);
  o record; f record; s record; bound text;
  cols constant text := 'id, ref, status, counsellor_id, student_user_id, student_name, student_email, created_at, data_updated_at, current_step, stage,
           progress_done, progress_applicable, progress_pct, gate_pending, gate_pending_at, gate_pending_round, gate_returned,
           docs_uploaded, docs_accepted, docs_rejected, profile_submitted, cis_start_at, cis2_from, offer_lapse_at, arrival_at, hold_review_at,
           retention_anchor_at, retention_kind, disposed, legal_hold, last_event_at, last_event_by, last_event_text, destination, channel, exit_code, done_mask, visa_granted,
           cis_sent_at, offer_decided_at, profile_started, consent_yes, transfers_total, transfers_unsafeguarded, transfers_unapproved,
           breached, due_soon, severity_rank, retention, retention_due_at, worst_days';
  stale text[]; n integer; got text[];
  -- The list orders ("updated", "gate") are index orders. The policy's OR of scopes makes the
  -- planner think almost no row is visible, and so prefer to collect and sort; for these
  -- orders it must walk the index instead, so sorting is disabled for this one statement. A
  -- selective search hands over a short list of ids, which is best fetched and sorted.
  prior_sort text := current_setting('enable_sort');
begin
  if coalesce(p ->> 'now', '') <> '' then perform set_config('lpl.now', (p ->> 'now')::timestamptz::text, true); end if;
  o := public.case_order_sql(p, p -> 'after');
  -- A search in the list order (case_search_page_ids).
  if coalesce(p ->> 'q', '') <> '' then
    got := public.case_search_page_ids(p, lim);
    if got is not null then
      return query execute format('select %s, jsonb_build_object(''k'', jsonb_build_array(%s), ''id'', id)
          from public.case_state where id = any ($1) order by %s', cols, o.cur, o.ord) using got;
      return;
    end if;
  end if;
  f := public.case_filter(p);

  -- Severity, urgency and retention, for a caller who sees every case, without a selective
  -- search or counsellor (short lists) or only closed statuses (which the stamp order does not
  -- serve), all evaluated directly below: candidates in stamp
  -- order plus every case whose stamp is not valid now, all evaluated live. While there are
  -- more candidates than were taken, only rows up to the last candidate are certain, so the
  -- walk widens until a page is certain or it has read every candidate; past 20,000 (a filter
  -- the stamp order does not serve, such as one status) every case is evaluated, as before.
  if sort in ('severity', 'urgency', 'retention') and f.by_index and coalesce(p ->> 'counsellor', '') = ''
     and (jsonb_typeof(p -> 'status') is distinct from 'array' or (p -> 'status') ? 'open') then
    stale := public.case_stale_ids(5000);
    n := lim * 4;
    while stale is not null and n <= 20000 loop
      s := public.case_stamp_ids(p, n);
      exit when s.ids is null;
      -- Rows after the last candidate are not certain while there may be more candidates.
      bound := case when cardinality(s.ids) >= n then (public.case_order_sql(p, s.last_cursor)).seek end;
      execute format('select array(select id from public.case_state where %s and %s and %s and not (%s) and id = any ($1) order by %s limit %s)',
          public.case_visibility_sql(), f.where_sql, o.seek, coalesce(bound, 'false'), o.ord, lim)
        into got using s.ids || stale;
      if cardinality(got) >= lim or bound is null then
        return query execute format('select %s, jsonb_build_object(''k'', jsonb_build_array(%s), ''id'', id)
            from public.case_state where id = any ($1) order by %s', cols, o.cur, o.ord) using got;
        return;
      end if;
      n := n * 10;
    end loop;
  end if;

  if sort in ('updated', 'gate') and f.by_index then perform set_config('enable_sort', 'off', true); end if;
  return query execute format($f$
    select %s, jsonb_build_object('k', jsonb_build_array(%s), 'id', id)
      from public.case_state
     where %s and %s and %s
     order by %s
     limit %s$f$,
    cols, o.cur, public.case_visibility_sql(), f.where_sql, o.seek, o.ord, lim);
  perform set_config('enable_sort', prior_sort, true);
end $$;

-- ---------------------------------------------------------------------------
-- Approval statistics: one shared answer for the roles that see every gate, kept warm by the
-- dashboard refresh (a count over every gate took 0.7 s at a million cases).
-- ---------------------------------------------------------------------------

create or replace function public.gate_stats_compute() returns jsonb
  language sql stable security invoker set search_path = public set jit = off as $$
  select jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'oldestPendingAt', min(submitted_at) filter (where status = 'pending'),
    'decided', count(*) filter (where status in ('approved', 'returned')),
    'approved', count(*) filter (where status = 'approved'),
    'firstRoundApproved', count(*) filter (where status = 'approved' and round = 1),
    -- Mean days from submission to decision, to one decimal (as the page showed it).
    'avgTurnaroundDays', round((avg(extract(epoch from (coalesce(decided_at, submitted_at) - submitted_at)) / 86400)
                                filter (where status in ('approved', 'returned') and submitted_at is not null))::numeric, 1))
  from public.case_gates
$$;

create or replace function public.gate_stats_shared() returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare c record; cv bigint; t0 timestamptz; body jsonb;
begin
  -- As dashboard_shared: computed without row-level security, so only for callers who would
  -- see every gate through the policy (case.read with the scope "all").
  if not (coalesce(public.app_can('case.read'), false) and public.current_case_scope() = 'all') then
    raise exception 'The shared approval statistics are for roles that see every case' using errcode = '42501';
  end if;
  select version into cv from public.change_log where topic = 'cases';
  select * into c from public.dashboard_cache where scope = 'gates';
  if found and ((c.cases_v = cv and c.computed_at > now() - interval '5 minutes')
                or (c.compute_ms > 250 and c.computed_at > now() - interval '1 minute')) then
    return c.body;
  end if;
  perform pg_advisory_xact_lock(hashtext('lpl.gate_stats_shared'));
  select * into c from public.dashboard_cache where scope = 'gates';
  if found and c.cases_v = cv and c.computed_at > clock_timestamp() - interval '5 seconds' then return c.body; end if;
  t0 := clock_timestamp();
  body := public.gate_stats_compute();
  insert into public.dashboard_cache (scope, cases_v, config_v, computed_at, compute_ms, body)
  values ('gates', cv, 0, now(), (extract(epoch from clock_timestamp() - t0) * 1000)::int, body)
  on conflict (scope) do update set cases_v = excluded.cases_v, config_v = excluded.config_v, computed_at = excluded.computed_at,
    compute_ms = excluded.compute_ms, body = excluded.body;
  return body;
end $$;

create or replace function public.gate_stats() returns jsonb
  language plpgsql volatile security invoker set search_path = public as $$
begin
  if coalesce(public.app_can('case.read'), false) and public.current_case_scope() = 'all' then
    return public.gate_stats_shared();
  end if;
  return public.gate_stats_compute();
end $$;

-- The worker's refresher keeps the approval statistics warm with the dashboard. Returns the
-- milliseconds spent (0 when both were fresh).
create or replace function public.dashboard_refresh() returns integer
  language plpgsql volatile security definer set search_path = public as $$
declare
  c record; cv bigint; fv bigint; t0 timestamptz := clock_timestamp(); body jsonb; ms integer; t1 timestamptz; did boolean := false;
begin
  select version into cv from public.change_log where topic = 'cases';
  select version into fv from public.change_log where topic = 'config';
  select * into c from public.dashboard_cache where scope = 'gates';
  if not found or c.cases_v <> cv or c.computed_at <= now() - interval '4 minutes' then
    perform pg_advisory_xact_lock(hashtext('lpl.gate_stats_shared'));
    t1 := clock_timestamp();
    body := public.gate_stats_compute();
    insert into public.dashboard_cache (scope, cases_v, config_v, computed_at, compute_ms, body)
    values ('gates', cv, 0, now(), (extract(epoch from clock_timestamp() - t1) * 1000)::int, body)
    on conflict (scope) do update set cases_v = excluded.cases_v, config_v = excluded.config_v, computed_at = excluded.computed_at,
      compute_ms = excluded.compute_ms, body = excluded.body;
    did := true;
  end if;
  select * into c from public.dashboard_cache where scope = 'all';
  if found and c.cases_v = cv and c.config_v = fv and c.computed_at > now() - interval '4 minutes' then
    return case when did then greatest((extract(epoch from clock_timestamp() - t0) * 1000)::int, 1) else 0 end;
  end if;
  perform pg_advisory_xact_lock(hashtext('lpl.dashboard_shared'));
  body := public.dashboard_compute('all', null, now());
  ms := (extract(epoch from clock_timestamp() - t0) * 1000)::int;
  insert into public.dashboard_cache (scope, cases_v, config_v, computed_at, compute_ms, body)
  values ('all', cv, fv, now(), ms, body)
  on conflict (scope) do update set cases_v = excluded.cases_v, config_v = excluded.config_v, computed_at = excluded.computed_at,
    compute_ms = excluded.compute_ms, body = excluded.body;
  return greatest(ms, 1);
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on function public.case_restamp(text[]), public.case_restamp_due(integer), public.case_stamp_changed(),
  public.gate_stats_shared(), public.dashboard_refresh() from public, anon, authenticated;
revoke all on function public.case_search_page_ids(jsonb, integer) from public, anon;
grant execute on function public.case_search_page_ids(jsonb, integer) to authenticated;
revoke all on function public.case_stamp_ids(jsonb, integer), public.case_stale_ids(integer), public.gate_stats(),
  public.gate_stats_compute(), public.cases_page(jsonb) from public, anon;
grant execute on function public.case_stamp_ids(jsonb, integer), public.case_stale_ids(integer), public.gate_stats(),
  public.gate_stats_compute(), public.cases_page(jsonb) to authenticated;
grant execute on function public.gate_stats_shared() to authenticated;
grant execute on function public.lpl_day_turn(timestamptz, timestamptz), public.lpl_after_day(timestamptz, timestamptz),
  public.case_stamp_key(), public.case_order_sql(jsonb, jsonb) to public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.case_restamp(text[]), public.case_restamp_due(integer), public.dashboard_refresh() to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Backfill: a stamp for every case (set-based; about a minute per million cases).
-- ---------------------------------------------------------------------------

do $$
begin
  perform public.case_restamp(array(select c.id from public.cases c where not exists (select 1 from public.case_stamps t where t.id = c.id)));
end $$;

insert into public.schema_migrations (version, name) values ('20260926000100', 'v6_case_order') on conflict (version) do nothing;
