-- Lyceum Placements — Placement Management System
-- Copyright © Bhanu Mendis - LGH IT
--
-- v5 additions: structured audit columns and paged audit RPCs; per-recipient notifications
-- written by database triggers; Web Push subscriptions. Idempotent. The same block is appended
-- to schema.sql for new projects; a project that already ran schema.sql v4 runs only this file.
--
-- Nothing here loosens an existing policy. New tables are own-rows only. Audit rows are still
-- attributed by the audit_attribution trigger.

-- ---------------------------------------------------------------------------
-- Audit: structure, indexes, paged reads
-- ---------------------------------------------------------------------------

alter table public.audit
  add column if not exists event_type   text,
  add column if not exists entity_type  text,
  add column if not exists entity_id    text,
  add column if not exists entity_label text,
  add column if not exists outcome      text not null default 'success',
  add column if not exists source       text,
  add column if not exists session_id   text,
  add column if not exists summary      text,
  add column if not exists changes      jsonb,
  add column if not exists meta         jsonb;
create index if not exists audit_actor_idx  on public.audit (actor_id, at desc);
create index if not exists audit_entity_idx on public.audit (entity_type, entity_id, at desc);
create index if not exists audit_type_idx   on public.audit (event_type, at desc);
comment on column public.audit.changes is 'Field-level diff for updates: [{field,label,old,new}]; special-category values are redacted by the client before they arrive.';

-- One page of the audit log, newest first, keyset by (at, id). Runs with the caller's rights,
-- so audit.read decides what comes back. The default window is the last 30 days so the free
-- text match never walks the whole table.
create or replace function public.audit_page(
  p_before timestamptz, p_actor text, p_event_type text, p_entity_type text, p_entity_id text,
  p_from timestamptz, p_to timestamptz, p_q text, p_limit integer)
  returns table (
    id text, at timestamptz, actor_id text, actor_name text, actor_role text, action text, target text, detail text,
    event_type text, entity_type text, entity_id text, entity_label text, outcome text, source text, session_id text, summary text,
    has_changes boolean)
  language sql stable security invoker set search_path = public as $$
  select a.id, a.at, a.actor_id, a.actor_name, a.actor_role, a.action, a.target, a.detail,
         a.event_type, a.entity_type, a.entity_id, a.entity_label, a.outcome, a.source, a.session_id, a.summary,
         (a.changes is not null) as has_changes
  from public.audit a
  where (p_before is null or a.at < p_before)
    and (p_actor is null or p_actor = '' or a.actor_id = p_actor)
    and (p_event_type is null or p_event_type = '' or a.event_type = p_event_type)
    and (p_entity_type is null or p_entity_type = '' or a.entity_type = p_entity_type)
    and (p_entity_id is null or p_entity_id = '' or a.entity_id = p_entity_id)
    and a.at >= coalesce(p_from, now() - interval '30 days')
    and (p_to is null or a.at <= p_to)
    and (p_q is null or p_q = ''
         or a.action ilike '%' || p_q || '%' or a.summary ilike '%' || p_q || '%' or a.target ilike '%' || p_q || '%'
         or a.entity_label ilike '%' || p_q || '%' or a.actor_name ilike '%' || p_q || '%')
  order by a.at desc, a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

create or replace function public.audit_detail(p_id text)
  returns table (id text, changes jsonb, meta jsonb)
  language sql stable security invoker set search_path = public as $$
  select a.id, a.changes, a.meta from public.audit a where a.id = p_id
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id            text primary key default gen_random_uuid()::text,
  recipient_id  text not null,
  at            timestamptz not null default now(),
  type          text not null,
  priority      text not null default 'normal' check (priority in ('low','normal','high')),
  title         text not null,
  body          text,
  case_id       text,
  case_ref      text,
  step          integer,
  link          text,
  group_key     text,
  dedupe_key    text unique,
  read_at       timestamptz,
  pushed_at     timestamptz,
  push_attempts integer not null default 0
);
create index if not exists notifications_unread_idx    on public.notifications (recipient_id, at desc) where read_at is null;
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, at desc);
create index if not exists notifications_push_idx      on public.notifications (at) where pushed_at is null;
comment on table public.notifications is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Per-recipient notifications written by database triggers.';

create table if not exists public.push_subscriptions (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null,
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
comment on table public.push_subscriptions is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Web Push subscriptions, one row per device.';

-- Roles holding a matrix cell, from the configured matrix or the standard model; admin always.
create or replace function public.roles_holding(perm text) returns text[]
  language plpgsql stable security definer set search_path = public as $$
declare cell jsonb; out_roles text[];
begin
  select c.config -> 'permissions' -> perm into cell from public.org_config c where c.id = 'org';
  if cell is not null and jsonb_typeof(cell) = 'array' then
    select array_agg(x) into out_roles from jsonb_array_elements_text(cell) t(x);
  else
    select d.roles into out_roles from public.permission_defaults d where d.perm = roles_holding.perm;
  end if;
  return array_append(coalesce(out_roles, '{}'::text[]), 'admin');
end $$;

-- Inserts one row unless the recipient is the actor. Dedupe keys make re-fired triggers harmless.
create or replace function public.notify_insert(
  p_recipient text, p_type text, p_priority text, p_title text, p_body text,
  p_case_id text, p_case_ref text, p_step integer, p_link text, p_dedupe text) returns void
  language plpgsql security definer set search_path = public as $$
begin
  if p_recipient is null or p_recipient = coalesce(public.current_app_user_id(), '') then return; end if;
  insert into public.notifications (recipient_id, type, priority, title, body, case_id, case_ref, step, link, group_key, dedupe_key)
  values (p_recipient, p_type, p_priority, p_title, p_body, p_case_id, p_case_ref, p_step, p_link, p_case_id, p_dedupe)
  on conflict (dedupe_key) do nothing;
end $$;

-- Mirrors src/notifications/fanout.ts rule for rule. Keep the two in step.
create or replace function public.notify_case_change() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  ref text := new.ref; cid text := new.id;
  couns text := new.counsellor_id; student text := new.student_user_id;
  g jsonb; o jsonb; d jsonb; k text; st jsonb; ost jsonb; r text; u record;
  old_couns text; status_word text; pr text;
begin
  old_couns := case when tg_op = 'INSERT' then null else old.counsellor_id end;

  -- Assignment (also on creation).
  if couns is not null and couns is distinct from old_couns then
    perform public.notify_insert(couns, 'case_assigned', 'normal', 'Case ' || ref || ' assigned to you', null,
      cid, ref, null, '#/case/' || cid, cid || ':assigned:' || coalesce(new.data ->> 'assignedAt', now()::text));
  end if;
  if tg_op = 'INSERT' then return new; end if;

  -- Gates.
  for g in select * from jsonb_array_elements(coalesce(new.data -> 'gates', '[]'::jsonb)) loop
    select x into o from jsonb_array_elements(coalesce(old.data -> 'gates', '[]'::jsonb)) x where x ->> 'id' = g ->> 'id';
    if o is null and g ->> 'status' = 'pending' then
      for r in select unnest(public.roles_holding('gate.write')) loop
        for u in select id from public.app_users where active and role = r loop
          perform public.notify_insert(u.id, 'gate_submitted', 'high',
            'Gate ' || (g ->> 'gate') || case when coalesce((g ->> 'round')::int, 1) > 1 then ' resubmitted on ' else ' submitted on ' end || ref, null,
            cid, ref, (g ->> 'gate')::int, '#/case/' || cid || '/step/' || (g ->> 'gate'), cid || ':gate:' || (g ->> 'id') || ':pending:' || u.id);
        end loop;
      end loop;
    elsif o is not null and o ->> 'status' = 'pending' and g ->> 'status' in ('approved','returned') then
      perform public.notify_insert(couns, 'gate_decided', case when g ->> 'status' = 'returned' then 'high' else 'normal' end,
        'Gate ' || (g ->> 'gate') || ' ' || (g ->> 'status') || ' on ' || ref, null,
        cid, ref, (g ->> 'gate')::int, '#/case/' || cid || '/step/' || (g ->> 'gate'), cid || ':gate:' || (g ->> 'id') || ':' || (g ->> 'status'));
    end if;
  end loop;

  -- Documents. The kind id travels in body; the client renders the checklist label.
  for d in select * from jsonb_array_elements(coalesce(new.data -> 'documents', '[]'::jsonb)) loop
    select x into o from jsonb_array_elements(coalesce(old.data -> 'documents', '[]'::jsonb)) x where x ->> 'id' = d ->> 'id';
    if o is null then
      if d ->> 'uploadedBy' is distinct from couns then
        perform public.notify_insert(couns, 'document_uploaded', 'normal', 'Document uploaded on ' || ref, d ->> 'kind',
          cid, ref, (d ->> 'step')::int, '#/case/' || cid || '/documents', cid || ':doc:' || (d ->> 'id') || ':uploaded');
      end if;
    elsif o ->> 'status' = 'uploaded' and d ->> 'status' in ('accepted','rejected') then
      perform public.notify_insert(student, 'document_reviewed', case when d ->> 'status' = 'rejected' then 'high' else 'normal' end,
        case when d ->> 'status' = 'rejected' then 'Document returned' else 'Document accepted' end, d ->> 'kind',
        cid, ref, (d ->> 'step')::int, '#/documents', cid || ':doc:' || (d ->> 'id') || ':' || (d ->> 'status'));
    end if;
  end loop;

  -- Profile submitted by the student.
  if new.data -> 'steps' -> '2' ->> 'studentSubmittedAt' is not null
     and new.data -> 'steps' -> '2' ->> 'studentSubmittedAt' is distinct from old.data -> 'steps' -> '2' ->> 'studentSubmittedAt'
     and coalesce(new.data -> 'steps' -> '2' ->> 'status', 'pending') <> 'done' then
    perform public.notify_insert(couns, 'profile_submitted', 'normal', 'Profile submitted on ' || ref, null,
      cid, ref, 2, '#/case/' || cid || '/step/2', cid || ':profile:' || (new.data -> 'steps' -> '2' ->> 'studentSubmittedAt'));
  end if;

  -- Steps completed.
  for k in select jsonb_object_keys(coalesce(new.data -> 'steps', '{}'::jsonb)) loop
    st := new.data -> 'steps' -> k;
    ost := old.data -> 'steps' -> k;
    if st ->> 'status' = 'done' and coalesce(ost ->> 'status', 'pending') <> 'done' then
      if student is not null and st ->> 'completedBy' = student then
        perform public.notify_insert(couns, 'step_completed', 'normal', 'Step ' || k || ' confirmed by student on ' || ref, null,
          cid, ref, k::int, '#/case/' || cid || '/step/' || k, cid || ':step:' || k || ':done:' || coalesce(st ->> 'completedAt', ''));
      else
        perform public.notify_insert(student, 'step_completed', 'low', 'Step ' || k || ' completed', null,
          cid, ref, k::int, '#/journey/step/' || k, cid || ':step:' || k || ':done:' || coalesce(st ->> 'completedAt', ''));
      end if;
    end if;
  end loop;

  -- Status.
  if new.status is distinct from old.status then
    status_word := case new.status when 'hold' then 'on hold' when 'open' then 'reopened' else new.status end;
    pr := case when new.status in ('exited','hold') then 'high' else 'normal' end;
    perform public.notify_insert(student, 'status_changed', pr, 'Case ' || ref || ' ' || status_word, null,
      cid, ref, null, '#/', cid || ':status:' || new.status || ':' || new.updated_at::text || ':s');
    perform public.notify_insert(couns, 'status_changed', pr, 'Case ' || ref || ' ' || status_word, null,
      cid, ref, null, '#/case/' || cid, cid || ':status:' || new.status || ':' || new.updated_at::text || ':c');
  end if;
  return new;
end $$;
drop trigger if exists cases_notify on public.cases;
create trigger cases_notify after insert or update on public.cases for each row execute function public.notify_case_change();

-- Service-level reminders. Schedule daily on Supabase (dashboard SQL, once):
--   select cron.schedule('lpl-sla', '0 3 * * *', $$select public.emit_sla_notifications()$$);
-- The Go service can call the same function from a ticker. Until scheduled, the notification
-- center's Reminders tab shows the same clocks, computed live.
create or replace function public.emit_sla_notifications() returns integer
  language plpgsql security definer set search_path = public as $$
declare c record; cfg jsonb; cis int; offer int; fu int; due timestamptz; days int; n integer := 0; state text;
begin
  select config into cfg from public.org_config where id = 'org';
  cis   := coalesce((cfg -> 'sla' ->> 'cisDays')::int, 7);
  offer := coalesce((cfg -> 'sla' ->> 'offerReminderDays')::int, 21);
  fu    := coalesce((cfg -> 'sla' ->> 'followUpMonths')::int, 3);
  for c in select id, ref, counsellor_id, data from public.cases where status = 'open' loop
    -- Course Information Sheet: step 3 done, step 4 not done.
    if c.data -> 'steps' -> '3' ->> 'status' = 'done' and (c.data -> 'steps' -> '3' ->> 'completedAt') is not null
       and coalesce(c.data -> 'steps' -> '4' ->> 'status', 'pending') <> 'done' then
      due := (c.data -> 'steps' -> '3' ->> 'completedAt')::timestamptz + make_interval(days => cis);
      days := ceil(extract(epoch from (due - now())) / 86400)::int;
      if days <= 2 then
        state := case when days < 0 then 'breached' else 'due' end;
        perform public.notify_insert(c.counsellor_id, case when days < 0 then 'sla_breached' else 'sla_due' end, 'high',
          'Course Information Sheet ' || case when days < 0 then 'overdue' else 'due' end || ' on ' || c.ref, null,
          c.id, c.ref, 4, '#/case/' || c.id || '/step/4', c.id || ':cis:' || state || ':' || due::date::text);
        n := n + 1;
      end if;
    end if;
    -- Offer lapse: step 13 lapse date, step 14 not done.
    if (c.data -> 'steps' -> '13' -> 'values' ->> 'offerLapseDate') is not null
       and coalesce(c.data -> 'steps' -> '14' ->> 'status', 'pending') <> 'done' then
      due := (c.data -> 'steps' -> '13' -> 'values' ->> 'offerLapseDate')::timestamptz;
      days := ceil(extract(epoch from (due - now())) / 86400)::int;
      if days <= offer then
        state := case when days < 0 then 'breached' else 'due' end;
        perform public.notify_insert(c.counsellor_id, case when days < 0 then 'sla_breached' else 'sla_due' end, 'high',
          case when days < 0 then 'Offer lapsed on ' else 'Offer lapse approaching on ' end || c.ref, null,
          c.id, c.ref, 13, '#/case/' || c.id || '/step/13', c.id || ':offer:' || state || ':' || due::date::text);
        n := n + 1;
      end if;
    end if;
    -- Three-month follow-up: step 30 done with an arrival date, step 31 not done.
    if c.data -> 'steps' -> '30' ->> 'status' = 'done' and (c.data -> 'steps' -> '30' -> 'values' ->> 'arrivalDate') is not null
       and coalesce(c.data -> 'steps' -> '31' ->> 'status', 'pending') <> 'done' then
      due := (c.data -> 'steps' -> '30' -> 'values' ->> 'arrivalDate')::timestamptz + make_interval(months => fu);
      days := ceil(extract(epoch from (due - now())) / 86400)::int;
      if days <= 7 then
        state := case when days < 0 then 'breached' else 'due' end;
        perform public.notify_insert(c.counsellor_id, case when days < 0 then 'sla_breached' else 'sla_due' end, 'normal',
          'Three-month follow-up ' || case when days < 0 then 'overdue' else 'due' end || ' on ' || c.ref, null,
          c.id, c.ref, 31, '#/case/' || c.id || '/step/31', c.id || ':followup:' || state || ':' || due::date::text);
        n := n + 1;
      end if;
    end if;
  end loop;
  return n;
end $$;

-- Reads and read-marking, all scoped to the caller by RLS.
create or replace function public.notification_state() returns table (unread integer, latest timestamptz)
  language sql stable security invoker set search_path = public as $$
  select count(*) filter (where read_at is null)::int, max(at)
  from public.notifications where recipient_id = public.current_app_user_id()
$$;

create or replace function public.notifications_page(p_before timestamptz, p_limit integer, p_unread_only boolean)
  returns setof public.notifications
  language sql stable security invoker set search_path = public as $$
  select * from public.notifications
  where recipient_id = public.current_app_user_id()
    and (p_before is null or at < p_before)
    and (not coalesce(p_unread_only, false) or read_at is null)
  order by at desc, id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

create or replace function public.mark_notifications_read(p_ids text[]) returns integer
  language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update public.notifications set read_at = now()
   where id = any(p_ids) and recipient_id = public.current_app_user_id() and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.mark_all_notifications_read() returns integer
  language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update public.notifications set read_at = now()
   where recipient_id = public.current_app_user_id() and read_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.prune_notifications(p_days integer) returns integer
  language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if public.current_app_role() is distinct from 'admin' then
    raise exception 'Pruning notifications requires the Administrator role';
  end if;
  delete from public.notifications where at < now() - make_interval(days => greatest(coalesce(p_days, 90), 7));
  get diagnostics n = row_count;
  return n;
end $$;

-- A signed-in user may change nothing but read_at on their own rows.
create or replace function public.guard_notification_update() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if public.is_system_caller() then return new; end if;
  if (to_jsonb(new) - 'read_at') is distinct from (to_jsonb(old) - 'read_at') then
    raise exception 'Only read_at may change on a notification';
  end if;
  return new;
end $$;
drop trigger if exists notifications_guard on public.notifications;
create trigger notifications_guard before update on public.notifications for each row execute function public.guard_notification_update();

alter table public.notifications      enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists notifications_read   on public.notifications;
drop policy if exists notifications_update on public.notifications;
create policy notifications_read   on public.notifications for select to authenticated using (recipient_id = public.current_app_user_id());
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = public.current_app_user_id()) with check (recipient_id = public.current_app_user_id());

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = public.current_app_user_id()) with check (user_id = public.current_app_user_id());

grant select, update on public.notifications to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
grant execute on function
  public.notification_state(), public.notifications_page(timestamptz, integer, boolean),
  public.mark_notifications_read(text[]), public.mark_all_notifications_read(), public.prune_notifications(integer),
  public.audit_page(timestamptz, text, text, text, text, timestamptz, timestamptz, text, integer), public.audit_detail(text)
  to authenticated;
revoke all on public.notifications, public.push_subscriptions from anon;
