-- Lyceum Placements — Placement Management System
-- Copyright © Bhanu Mendis - LGH IT
--
-- v6.4 — the server's background work, in the database's terms. Idempotent.
--
-- Until v6 two Supabase Edge Functions and a pg_cron job did what lpl-api's workers now do:
-- delivering notifications to browsers (push-dispatch), service-level reminders
-- (emit_sla_notifications on a daily cron) and nothing at all about old notifications. The
-- workers call the functions below as the service role; no signed-in user can.
--
-- Also closes a hole the Edge Function era left open: notify_insert() and
-- emit_sla_notifications() are SECURITY DEFINER and, like every function Postgres creates,
-- were executable by PUBLIC, so anyone holding the public anon key could write a notification
-- to any user (and, with push, onto their phone) through the project's data API.

-- ---------------------------------------------------------------------------
-- Privileges. A definer function runs with its owner's rights, so who may call it is the
-- whole of its security. Triggers need no EXECUTE to fire.
-- ---------------------------------------------------------------------------

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- Called only from other definer functions (the notification triggers).
revoke all on function public.notify_insert(text, text, text, text, text, text, text, integer, text, text) from public, anon, authenticated;
revoke all on function public.roles_holding(text) from public, anon, authenticated;

-- The row-level security helpers: for signed-in users (their policies call them) and the
-- service role, not for anonymous callers.
revoke all on function public.current_app_role(), public.current_app_user_id(), public.current_case_scope(),
  public.app_can(text), public.case_in_scope(text, text), public.next_case_ref(text), public.prune_notifications(integer)
  from public, anon;
grant execute on function public.current_app_role(), public.current_app_user_id(), public.current_case_scope(),
  public.app_can(text), public.case_in_scope(text, text), public.next_case_ref(text), public.prune_notifications(integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Push delivery: a queue with leases, so any number of lpl-api replicas can dispatch
-- without sending a notification twice and without holding a transaction open while they
-- talk to push services. A claim takes the oldest undelivered rows nobody holds, leases them
-- for a while and counts the attempt; settling records the outcome or, for a transient
-- failure, when to try again. A replica that dies mid-batch loses its lease, not the rows.
-- ---------------------------------------------------------------------------

alter table public.notifications
  add column if not exists push_outcome       text,
  add column if not exists push_claimed_until timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.notifications'::regclass and conname = 'notifications_push_outcome_check') then
    alter table public.notifications add constraint notifications_push_outcome_check
      check (push_outcome in ('sent', 'no_device', 'expired', 'rejected', 'gone', 'failed'));
  end if;
end $$;
comment on column public.notifications.push_outcome is
  'How push delivery ended: sent (to at least one device), no_device, expired (older than the push lifetime), rejected or gone (every device refused), failed (transient errors until the attempts ran out). Null while pending, and on rows settled before v6.';
comment on column public.notifications.push_claimed_until is 'The lease of the dispatcher holding the row; after it, another may claim it.';

-- Pruning reads by age.
create index if not exists notifications_at_idx on public.notifications (at);

-- Claims up to p_limit rows (oldest first). Rows older than p_ttl_seconds are settled as
-- expired instead: a device notification a day late is noise (and this keeps the first run
-- after push is switched on from delivering the whole history).
create or replace function public.push_claim(p_limit integer, p_lease_seconds integer, p_ttl_seconds integer)
  returns table (id text, recipient_id text, priority text, title text, body text, link text, at timestamptz, attempts integer)
  language plpgsql volatile security definer set search_path = public as $$
#variable_conflict use_column
begin
  update public.notifications n set pushed_at = now(), push_outcome = 'expired', push_claimed_until = null
   where n.pushed_at is null and n.at < now() - make_interval(secs => greatest(coalesce(p_ttl_seconds, 86400), 60));
  return query
  with due as (
    select n.id from public.notifications n
     where n.pushed_at is null and (n.push_claimed_until is null or n.push_claimed_until < now())
     order by n.at, n.id
     limit greatest(1, least(coalesce(p_limit, 100), 500))
     for update skip locked)
  update public.notifications n
     set push_claimed_until = now() + make_interval(secs => greatest(coalesce(p_lease_seconds, 120), 10)),
         push_attempts = n.push_attempts + 1
    from due where n.id = due.id
  returning n.id, n.recipient_id, n.priority, n.title, n.body, n.link, n.at, n.push_attempts;
end $$;

-- The devices to deliver to: active subscriptions of active users. A deactivated account's
-- phone stops receiving case details the moment the account is switched off.
create or replace function public.push_targets(p_recipients text[])
  returns table (id text, user_id text, endpoint text, p256dh text, auth text)
  language sql stable security definer set search_path = public as $$
  select s.id, s.user_id, s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s join public.app_users u on u.id = s.user_id and u.active
   where s.user_id = any(p_recipients) and s.revoked_at is null
$$;

-- Records a batch's outcomes:
--   {"settled": [{"id", "outcome"}], "retry": [{"id", "after": seconds}], "revoke": [subscription id]}
create or replace function public.push_settle(p jsonb) returns void
  language plpgsql volatile security definer set search_path = public as $$
begin
  update public.notifications n set pushed_at = now(), push_outcome = r.outcome, push_claimed_until = null
    from jsonb_to_recordset(coalesce(p -> 'settled', '[]')) r(id text, outcome text)
   where n.id = r.id and n.pushed_at is null;
  update public.notifications n set push_claimed_until = now() + make_interval(secs => greatest(coalesce(r.after, 60), 1))
    from jsonb_to_recordset(coalesce(p -> 'retry', '[]')) r(id text, after integer)
   where n.id = r.id and n.pushed_at is null;
  update public.push_subscriptions s set revoked_at = now()
   where s.id in (select jsonb_array_elements_text(coalesce(p -> 'revoke', '[]'))) and s.revoked_at is null;
end $$;

-- A device subscribes for the signed-in user. The endpoint is unique to a browser profile, so
-- when a shared computer changes hands the subscription moves to whoever subscribes now; the
-- previous account stops receiving pushes there. (A plain upsert cannot do this: the row
-- belongs to the other account, which row-level security rightly hides.)
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
  returns void language plpgsql volatile security definer set search_path = public as $$
declare me text;
begin
  select u.id into me from public.app_users u where u.auth_id = auth.uid() and u.active;
  if me is null then raise exception 'An active account is required to receive notifications' using errcode = '42501'; end if;
  if p_endpoint is null or p_endpoint !~ '^https://[^/@\s]+/' or length(p_endpoint) > 2048 then
    raise exception 'The push endpoint must be an https URL' using errcode = '22023';
  end if;
  if coalesce(length(p_p256dh), 0) not between 80 and 100 or coalesce(length(p_auth), 0) not between 16 and 32 then
    raise exception 'The subscription keys are malformed' using errcode = '22023';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, last_seen_at, revoked_at)
  values (me, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200), now(), null)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
    user_agent = excluded.user_agent, last_seen_at = excluded.last_seen_at, revoked_at = null;
end $$;

-- ---------------------------------------------------------------------------
-- Service-level reminders. The same clocks the application shows (case_state, which mirrors
-- src/lib/summary.ts), reminded when due soon or breached, once per clock, state and due date:
-- a moved date or a clock that breaches reminds again, a re-run does not. v5 cast dates out of
-- the document (one malformed date stopped every reminder), missed the additional CIS clock,
-- read every open case, and anyone could run it.
-- ---------------------------------------------------------------------------

create or replace function public.emit_sla_notifications() returns integer
  language plpgsql volatile security definer set search_path = public set jit = off as $$
declare n integer; v_cis_days integer; v_fu_months integer;
begin
  if not public.is_system_caller() then
    raise exception 'Service-level reminders are sent by the server' using errcode = '42501';
  end if;
  v_cis_days := public.org_number('{sla,cisDays}', 7);
  v_fu_months := public.org_number('{sla,followUpMonths}', 3);
  insert into public.notifications (recipient_id, type, priority, title, body, case_id, case_ref, step, link, group_key, dedupe_key)
  select s.counsellor_id, case when k.days < 0 then 'sla_breached' else 'sla_due' end, k.priority,
         k.title || case when k.days < 0 then k.late else k.soon end || s.ref, null, s.id, s.ref, k.step,
         '#/case/' || s.id || '/step/' || k.step, s.id,
         s.id || ':' || k.kind || ':' || case when k.days < 0 then 'breached' else 'due' end || ':' || to_char(k.due at time zone 'UTC', 'YYYY-MM-DD')
    from public.case_state s
    cross join lateral (values
      ('cis', 4, 'high', s.cis_days, public.lpl_add_days(s.cis_start_at, v_cis_days), 2,
         'Course Information Sheet ', 'overdue on ', 'due on '),
      ('cis2', 5, 'high', s.cis2_days, public.lpl_add_days(s.cis2_from, v_cis_days), 2,
         'Additional Course Information Sheet ', 'overdue on ', 'due on '),
      ('offer', 13, 'high', s.offer_days, s.offer_lapse_at, s.cfg_offer_days,
         'Offer ', 'lapsed on ', 'lapse approaching on '),
      ('followup', 31, 'normal', s.fu_days, public.lpl_add_months(s.arrival_at, v_fu_months), 7,
         'Three-month follow-up ', 'overdue on ', 'due on ')
    ) k(kind, step, priority, days, due, within, title, late, soon)
   where s.status = 'open' and s.needs_look and s.has_clock and s.counsellor_id is not null
     and k.days is not null and k.days <= k.within
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Retention. Notifications older than p_days go, p_batch at a time so no statement holds
-- locks for long (the worker calls until a batch comes back short); subscriptions revoked a
-- month ago go with them. The SUPER ADMIN's prune_notifications() remains for manual use.
-- ---------------------------------------------------------------------------

create or replace function public.prune_notifications_system(p_days integer, p_batch integer) returns integer
  language plpgsql volatile security definer set search_path = public as $$
declare n integer;
begin
  delete from public.notifications where id in (
    select id from public.notifications where at < now() - make_interval(days => greatest(coalesce(p_days, 90), 7))
     order by at limit greatest(1, least(coalesce(p_batch, 5000), 50000)));
  get diagnostics n = row_count;
  delete from public.push_subscriptions where revoked_at < now() - interval '30 days';
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- The dashboard refresher, now re-checking after it waits for the lock: a reader may have
-- computed the answer meanwhile, and a second computation at scale costs seconds.
-- ---------------------------------------------------------------------------

create or replace function public.dashboard_refresh() returns integer
  language plpgsql volatile security definer set search_path = public as $$
declare
  c record; cv bigint; fv bigint; t0 timestamptz; body jsonb; ms integer;
begin
  select version into cv from public.change_log where topic = 'cases';
  select version into fv from public.change_log where topic = 'config';
  select * into c from public.dashboard_cache where scope = 'all';
  if found and c.cases_v = cv and c.config_v = fv and c.computed_at > now() - interval '4 minutes' then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('lpl.dashboard_shared'));
  select * into c from public.dashboard_cache where scope = 'all';
  if found and c.cases_v = cv and c.config_v = fv and c.computed_at > clock_timestamp() - interval '5 seconds' then return 0; end if;
  t0 := clock_timestamp();
  body := public.dashboard_compute('all', null, now());
  ms := (extract(epoch from clock_timestamp() - t0) * 1000)::int;
  insert into public.dashboard_cache (scope, cases_v, config_v, computed_at, compute_ms, body)
  values ('all', cv, fv, now(), ms, body)
  on conflict (scope) do update set cases_v = excluded.cases_v, config_v = excluded.config_v, computed_at = excluded.computed_at,
    compute_ms = excluded.compute_ms, body = excluded.body;
  return greatest(ms, 1);
end $$;

-- ---------------------------------------------------------------------------
-- Grants for the functions above.
-- ---------------------------------------------------------------------------

revoke all on function public.push_claim(integer, integer, integer), public.push_targets(text[]), public.push_settle(jsonb),
  public.emit_sla_notifications(), public.prune_notifications_system(integer, integer), public.dashboard_refresh()
  from public, anon, authenticated;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.push_claim(integer, integer, integer), public.push_targets(text[]), public.push_settle(jsonb),
      public.emit_sla_notifications(), public.prune_notifications_system(integer, integer), public.dashboard_refresh()
      to service_role;
    grant execute on function public.current_app_role(), public.current_app_user_id(), public.current_case_scope(),
      public.app_can(text), public.case_in_scope(text, text) to service_role;
  end if;
end $$;

insert into public.schema_migrations (version, name) values ('20260925000400', 'v6_workers') on conflict (version) do nothing;
