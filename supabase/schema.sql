-- Lyceum Placements — Placement Management System
-- Copyright © Bhanu Mendis - LGH IT
--
-- GENERATED FILE. Do not edit: change or add a file in supabase/migrations and run
--   node scripts/build-schema.mjs
--
-- New project: run this whole file once in the SQL editor (or psql). It is idempotent and
-- runs as one transaction, so a failure leaves the database unchanged.
-- Existing project: run only the migration files newer than the latest version recorded in
-- public.schema_migrations, in order. See docs/OPERATIONS.md.
--
-- Migrations included: 20260901000000, 20260912000000, 20260925000100, 20260925000200, 20260925000300

begin;

-- ===========================================================================
-- 20260901000000_v4_base.sql
-- ===========================================================================

-- Lyceum Placements — Placement Management System
-- Copyright (c) 2026 Bhanu Mendis. All rights reserved.
-- Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
--
-- Supabase schema for LGH/IMS/PROC/LPL/001. Run once in the SQL editor of a new project;
-- it is idempotent, so it can be re-run after an upgrade.
--
-- Security model: the browser only ever holds the anon key and a signed-in user's token, so
-- every read and write is filtered by the policies and triggers below rather than by
-- application code. Policies read the same resource × action matrix the administrator
-- configures under Roles and permissions (org_config.config.permissions), with the standard
-- model in permission_defaults as the fallback. Case visibility is scoped on top of the
-- matrix (own / assigned / all). The Administrator holds every cell; the Prompt Engineer
-- Workspace is Administrator-only and cannot be granted.
--
-- Registration is closed. The only public sign-up the database accepts is the first
-- administrator on an empty project. Every other identity is created by the admin-users Edge
-- Function with the service role key, which stamps app_metadata.provisioned so the trigger can
-- tell it from a public sign-up. A public sign-up never claims a profile, not even by email.
--
-- Region: choose the Supabase region closest to Colombo (Singapore, ap-southeast-1) and add
-- the project to Data protection → Standing processors.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.org_config (
  id          text primary key default 'org',
  config      jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.app_users (
  id              text primary key,
  auth_id         uuid unique references auth.users(id) on delete set null,
  email           text not null unique,
  name            text not null,
  phone           text,
  branch          text,
  role            text not null default 'student' check (role in ('admin','team_leader','counsellor','student')),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  created_by      text,
  last_sign_in_at timestamptz,
  updated_at      timestamptz not null default now()
);
alter table public.app_users add column if not exists updated_at timestamptz not null default now();
create index if not exists app_users_role_idx on public.app_users (role);

create table if not exists public.cases (
  id              text primary key,
  ref             text not null unique,
  status          text not null default 'open',
  counsellor_id   text,
  student_user_id text,
  rev             integer not null default 0,
  updated_at      timestamptz not null default now(),
  data            jsonb not null
);
create index if not exists cases_counsellor_idx on public.cases (counsellor_id);
create index if not exists cases_student_idx    on public.cases (student_user_id);
create index if not exists cases_status_idx     on public.cases (status);

create table if not exists public.audit (
  id         text primary key,
  at         timestamptz not null default now(),
  actor_id   text not null,
  actor_name text not null,
  actor_role text not null,
  action     text not null,
  target     text,
  detail     text
);
create index if not exists audit_at_idx on public.audit (at desc);

create table if not exists public.prompts (
  id          text primary key,
  title       text not null,
  status      text not null default 'draft',
  version     integer not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  data        jsonb not null
);
create index if not exists prompts_updated_idx on public.prompts (updated_at desc);

-- Standard model for the three non-administrator roles. Keep in step with DEFAULT_PERMISSIONS
-- in src/lib/rbac.ts. Administrator is implicit.
create table if not exists public.permission_defaults (
  perm   text primary key,
  roles  text[] not null
);
insert into public.permission_defaults (perm, roles) values
  ('case.view',               '{team_leader,counsellor,student}'),
  ('case.read',               '{team_leader,counsellor,student}'),
  ('case.write',              '{team_leader,counsellor,student}'),
  ('case.delete',             '{}'),
  ('case.download',           '{team_leader,counsellor}'),
  ('sensitive.view',          '{team_leader,counsellor,student}'),
  ('sensitive.read',          '{team_leader,counsellor}'),
  ('sensitive.write',         '{team_leader,counsellor,student}'),
  ('assignment.view',         '{team_leader,counsellor,student}'),
  ('assignment.write',        '{team_leader}'),
  ('document.view',           '{team_leader,counsellor,student}'),
  ('document.read',           '{team_leader,counsellor,student}'),
  ('document.write',          '{counsellor,student}'),
  ('document.delete',         '{}'),
  ('document.download',       '{team_leader,counsellor,student}'),
  ('review.view',             '{team_leader,counsellor,student}'),
  ('review.write',            '{team_leader,counsellor}'),
  ('gate.view',               '{team_leader,counsellor}'),
  ('gate.read',               '{team_leader,counsellor}'),
  ('gate.write',              '{team_leader}'),
  ('escalation.view',         '{team_leader}'),
  ('escalation.read',         '{team_leader}'),
  ('analytics.view',          '{team_leader}'),
  ('analytics.read',          '{team_leader}'),
  ('analytics.download',      '{team_leader}'),
  ('staff.view',              '{team_leader,counsellor}'),
  ('staff.read',              '{team_leader}'),
  ('staff.write',             '{}'),
  ('staff.delete',            '{}'),
  ('staff.download',          '{}'),
  ('account.write',           '{}'),
  ('account.delete',          '{}'),
  ('role.view',               '{}'),
  ('role.read',               '{}'),
  ('role.write',              '{}'),
  ('audit.view',              '{team_leader}'),
  ('audit.read',              '{team_leader}'),
  ('audit.download',          '{}'),
  ('settings.view',           '{}'),
  ('settings.read',           '{}'),
  ('settings.write',          '{}'),
  ('settings.delete',         '{}'),
  ('dataprotection.view',     '{team_leader}'),
  ('dataprotection.read',     '{team_leader}'),
  ('dataprotection.write',    '{team_leader}'),
  ('dataprotection.delete',   '{}'),
  ('dataprotection.download', '{team_leader}'),
  ('prompt.view',             '{}'),
  ('prompt.read',             '{}'),
  ('prompt.write',            '{}'),
  ('prompt.delete',           '{}'),
  ('prompt.download',         '{}')
on conflict (perm) do update set roles = excluded.roles;

-- Ownership notice stored with the objects themselves, so it is visible to anyone inspecting
-- the database (Table Editor, psql \d+, pg_dump).
comment on table public.org_config          is 'Lyceum Placements — Placement Management System. Copyright (c) 2026 Bhanu Mendis. All rights reserved. Organisation settings, permission matrix, case scope and standing processors.';
comment on table public.app_users           is 'Lyceum Placements — Placement Management System. Copyright (c) 2026 Bhanu Mendis. All rights reserved. Staff and student profiles linked to auth.users.';
comment on table public.cases               is 'Lyceum Placements — Placement Management System. Copyright (c) 2026 Bhanu Mendis. All rights reserved. One row per student case; the full record is in data.';
comment on table public.audit               is 'Lyceum Placements — Placement Management System. Copyright (c) 2026 Bhanu Mendis. All rights reserved. Append-only, database-attributed activity log.';
comment on table public.prompts             is 'Lyceum Placements — Placement Management System. Copyright (c) 2026 Bhanu Mendis. All rights reserved. Prompt Engineer Workspace templates (Administrator only).';
comment on table public.permission_defaults is 'Lyceum Placements — Placement Management System. Copyright (c) 2026 Bhanu Mendis. All rights reserved. Standard permission model fallback.';

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so policies on app_users do not recurse)
-- ---------------------------------------------------------------------------

create or replace function public.current_app_user_id() returns text
  language sql stable security definer set search_path = public as $$
  select id from public.app_users where auth_id = auth.uid() limit 1
$$;

create or replace function public.current_app_role() returns text
  language sql stable security definer set search_path = public as $$
  select role from public.app_users where auth_id = auth.uid() and active limit 1
$$;

create or replace function public.needs_bootstrap() returns boolean
  language sql stable security definer set search_path = public as $$
  select count(*) = 0 from public.app_users
$$;

create or replace function public.app_can(perm text) returns boolean
  language plpgsql stable security definer set search_path = public as $$
declare r text; cell jsonb;
begin
  r := public.current_app_role();
  if r is null then return false; end if;
  if r = 'admin' then return true; end if;
  if split_part(perm, '.', 1) = 'prompt' then return false; end if;
  select c.config -> 'permissions' -> perm into cell from public.org_config c where c.id = 'org';
  if cell is not null and jsonb_typeof(cell) = 'array' then return cell ? r; end if;
  return exists (select 1 from public.permission_defaults d where d.perm = app_can.perm and r = any (d.roles));
end $$;

create or replace function public.current_case_scope() returns text
  language plpgsql stable security definer set search_path = public as $$
declare r text; s text;
begin
  r := public.current_app_role();
  if r is null then return 'none'; end if;
  if r = 'admin' then return 'all'; end if;
  select c.config -> 'caseScope' ->> r into s from public.org_config c where c.id = 'org';
  if s in ('none','own','assigned','all') then return s; end if;
  return case r when 'team_leader' then 'all' when 'counsellor' then 'assigned' when 'student' then 'own' else 'none' end;
end $$;

create or replace function public.case_in_scope(p_counsellor_id text, p_student_user_id text) returns boolean
  language sql stable security definer set search_path = public as $$
  select case public.current_case_scope()
    when 'all' then true
    when 'assigned' then p_counsellor_id = public.current_app_user_id()
    when 'own' then p_student_user_id = public.current_app_user_id()
    else false end
$$;

-- True for the service role, the SQL editor and GoTrue's own connection: no user token.
create or replace function public.is_system_caller() returns boolean
  language sql stable as $$ select auth.uid() is null $$;

create sequence if not exists public.case_ref_seq;

create or replace function public.next_case_ref(prefix text) returns text
  language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  if not public.app_can('case.write') then raise exception 'Opening a case requires the case.write permission'; end if;
  select nextval('public.case_ref_seq') into n;
  return coalesce(nullif(prefix,''),'LPL') || '-' || to_char(now(),'YYYY') || '-' || lpad(n::text, 4, '0');
end $$;

-- Cheap change probe for polling: one row instead of the whole workspace. Runs with the
-- caller's rights, so it reflects only what that user may see.
create or replace function public.workspace_version() returns text
  language sql stable security invoker set search_path = public as $$
  select md5(
    coalesce((select max(updated_at)::text from public.cases), '') || '|' || (select count(*) from public.cases) || '|' ||
    coalesce((select max(updated_at)::text from public.app_users), '') || '|' || (select count(*) from public.app_users) || '|' ||
    coalesce((select max(updated_at)::text from public.org_config), '') || '|' ||
    coalesce((select max(at)::text from public.audit), '') || '|' ||
    coalesce((select max(updated_at)::text from public.prompts), '') || '|' || (select count(*) from public.prompts)
  )
$$;

create or replace function public.touch_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists app_users_touch on public.app_users;
create trigger app_users_touch before update on public.app_users for each row execute function public.touch_updated_at();
drop trigger if exists org_config_touch on public.org_config;
create trigger org_config_touch before update on public.org_config for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Identity: closed registration
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  meta_id  text;
  is_first boolean;
begin
  -- 1. Provisioned by an administrator through the Edge Function. Only the service role can
  --    write app_metadata, so a public sign-up cannot forge this path.
  if coalesce(new.raw_app_meta_data ->> 'provisioned', '') = 'admin-users' then
    meta_id := nullif(new.raw_app_meta_data ->> 'app_user_id', '');
    update public.app_users set auth_id = new.id, last_sign_in_at = now()
     where id = meta_id and auth_id is null and lower(email) = lower(new.email);
    if not found then raise exception 'Provisioned identity does not match an unclaimed profile' using errcode = 'P0001'; end if;
    return new;
  end if;

  -- 2. Bootstrap: the first account on an empty project becomes the administrator.
  select count(*) = 0 into is_first from public.app_users;
  if is_first then
    insert into public.app_users (id, auth_id, email, name, phone, role, active, created_at, last_sign_in_at)
    values (gen_random_uuid()::text, new.id, lower(new.email),
      coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)),
      nullif(new.raw_user_meta_data->>'phone',''), 'admin', true, now(), now());
    return new;
  end if;

  -- 3. Everything else is refused inside the transaction, so no identity is created.
  raise exception 'Registration is closed. Accounts are created by an administrator.' using errcode = 'P0001';
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

-- Profile guard: no self-promotion, no touching administrator rows without being one, no
-- identity or id rewrites through the API.
create or replace function public.guard_user_update() returns trigger
  language plpgsql security definer set search_path = public as $$
declare me text := public.current_app_user_id(); r text := public.current_app_role();
begin
  if public.is_system_caller() then return new; end if;
  if new.id is distinct from old.id then raise exception 'id is not writable'; end if;
  if new.auth_id is distinct from old.auth_id then raise exception 'auth_id is not writable'; end if;
  if r is distinct from 'admin' then
    if old.role = 'admin' or new.role = 'admin' then raise exception 'Only an administrator may manage administrator profiles'; end if;
    if old.id = me and (new.role is distinct from old.role or new.active is distinct from old.active) then
      raise exception 'You cannot change your own role or activation state';
    end if;
  end if;
  if not public.app_can('staff.write') then
    if new.role is distinct from old.role then raise exception 'Changing a role requires the staff.write permission'; end if;
    if new.email is distinct from old.email then raise exception 'Changing an email address requires the staff.write permission'; end if;
    if old.id <> me and (new.name is distinct from old.name or new.phone is distinct from old.phone or new.branch is distinct from old.branch or new.created_by is distinct from old.created_by) then
      raise exception 'Editing another profile requires the staff.write permission';
    end if;
  end if;
  if new.active is distinct from old.active and not public.app_can('account.delete') then
    raise exception 'Deactivating or reactivating a sign-in requires the account.delete permission';
  end if;
  return new;
end $$;
drop trigger if exists app_users_guard on public.app_users;
create trigger app_users_guard before update on public.app_users for each row execute function public.guard_user_update();

create or replace function public.guard_user_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if public.is_system_caller() then return new; end if;
  if new.auth_id is not null then raise exception 'auth_id is set by the identity provider'; end if;
  if new.role = 'admin' and public.current_app_role() is distinct from 'admin' then raise exception 'Only an administrator may create an administrator profile'; end if;
  if new.role <> 'student' and not public.app_can('staff.write') then raise exception 'Creating a staff profile requires the staff.write permission'; end if;
  if new.role = 'student' and not (public.app_can('staff.write') or public.app_can('account.write')) then raise exception 'Creating a student profile requires staff.write or account.write'; end if;
  return new;
end $$;
drop trigger if exists app_users_insert_guard on public.app_users;
create trigger app_users_insert_guard before insert on public.app_users for each row execute function public.guard_user_insert();

-- ---------------------------------------------------------------------------
-- Case write guard: the matrix cells that live inside the case JSON
-- ---------------------------------------------------------------------------

create or replace function public.guard_case_update() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  r text := public.current_app_role();
  me text := public.current_app_user_id();
  old_docs jsonb := coalesce(old.data -> 'documents', '[]'::jsonb);
  new_docs jsonb := coalesce(new.data -> 'documents', '[]'::jsonb);
  old_gates jsonb := coalesce(old.data -> 'gates', '[]'::jsonb);
  new_gates jsonb := coalesce(new.data -> 'gates', '[]'::jsonb);
  old_ev jsonb := coalesce(old.data -> 'events', '[]'::jsonb);
  new_ev jsonb := coalesce(new.data -> 'events', '[]'::jsonb);
  old_tr jsonb := coalesce(old.data -> 'transfers', '[]'::jsonb);
  new_tr jsonb := coalesce(new.data -> 'transfers', '[]'::jsonb);
  k text;
  added int;
begin
  if public.is_system_caller() then return new; end if;

  -- Identity of the record never changes through the API.
  if new.id is distinct from old.id or new.ref is distinct from old.ref
     or new.data ->> 'id' is distinct from old.data ->> 'id' or new.data ->> 'ref' is distinct from old.data ->> 'ref'
     or new.data ->> 'createdAt' is distinct from old.data ->> 'createdAt' then
    raise exception 'Case identity is not writable';
  end if;

  -- Students: their own details, their step-2 answers, steps 26/29 confirmations, uploads, events.
  if r = 'student' then
    if new.counsellor_id is distinct from old.counsellor_id or new.student_user_id is distinct from old.student_user_id
       or new.status is distinct from old.status
       or new.data -> 'gates' is distinct from old.data -> 'gates' or new.data -> 'exit' is distinct from old.data -> 'exit'
       or new.data -> 'hold' is distinct from old.data -> 'hold' or new.data -> 'disposal' is distinct from old.data -> 'disposal'
       or new.data -> 'legalHold' is distinct from old.data -> 'legalHold' or new.data -> 'transfers' is distinct from old.data -> 'transfers'
       or new.data -> 'student' is distinct from old.data -> 'student'
       or new.data ->> 'counsellorId' is distinct from old.data ->> 'counsellorId' or new.data ->> 'studentUserId' is distinct from old.data ->> 'studentUserId'
       or new.data ->> 'status' is distinct from old.data ->> 'status'
       or new.data ->> 'assignedAt' is distinct from old.data ->> 'assignedAt' or new.data ->> 'assignedBy' is distinct from old.data ->> 'assignedBy' then
      raise exception 'Students may only update their own details and documents';
    end if;
    for k in select jsonb_object_keys(coalesce(new.data -> 'steps', '{}'::jsonb) || coalesce(old.data -> 'steps', '{}'::jsonb)) loop
      if k = '2' then
        if (new.data -> 'steps' -> '2') - 'values' - 'studentSubmittedAt' is distinct from (old.data -> 'steps' -> '2') - 'values' - 'studentSubmittedAt' then
          raise exception 'Students may only supply step 2 answers, not confirm the step';
        end if;
      elsif k in ('26','29') then
        if new.data -> 'steps' -> k is distinct from old.data -> 'steps' -> k then
          if coalesce(old.data -> 'steps' -> k ->> 'status', 'pending') <> 'pending'
             or new.data -> 'steps' -> k ->> 'status' not in ('pending','done')
             or (new.data -> 'steps' -> k ->> 'status' = 'done' and new.data -> 'steps' -> k ->> 'completedBy' is distinct from me) then
            raise exception 'Students may only confirm steps 26 and 29 as themselves';
          end if;
        end if;
      elsif new.data -> 'steps' -> k is distinct from old.data -> 'steps' -> k then
        raise exception 'Students may not change step %', k;
      end if;
    end loop;
    -- Existing documents stay as they are; only new uploads by the student are allowed.
    if exists (select 1 from jsonb_array_elements(old_docs) o where not exists (select 1 from jsonb_array_elements(new_docs) d where d = o)) then
      raise exception 'Students may not change existing document records';
    end if;
    if exists (select 1 from jsonb_array_elements(new_docs) d
               where not exists (select 1 from jsonb_array_elements(old_docs) o where o ->> 'id' = d ->> 'id')
                 and (d ->> 'uploadedBy' is distinct from me or d ->> 'status' is distinct from 'uploaded' or d ? 'url')) then
      raise exception 'Uploads must be recorded as the student, awaiting review, without a link';
    end if;
  end if;

  -- Events are append-only (prepended) and attributed to the caller.
  added := jsonb_array_length(new_ev) - jsonb_array_length(old_ev);
  if added < 0 and not public.app_can('dataprotection.delete') then raise exception 'Events cannot be removed'; end if;
  if added >= 0 and (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(new_ev) with ordinality t(e, i) where i > added) is distinct from old_ev
     and not public.app_can('dataprotection.delete') then
    raise exception 'Existing events cannot be rewritten';
  end if;
  if added > 0 and exists (select 1 from jsonb_array_elements(new_ev) with ordinality t(e, i) where i <= added and e ->> 'by' is distinct from me) then
    raise exception 'Events must be recorded as yourself';
  end if;

  -- Reassignment.
  if (new.counsellor_id is distinct from old.counsellor_id or new.data ->> 'counsellorId' is distinct from old.data ->> 'counsellorId')
     and not public.app_can('assignment.write') then
    raise exception 'Counsellor assignment requires the assignment.write permission';
  end if;

  -- Gates: any decided record is immutable except for the counsellor's addressed note; a
  -- decision (new or changed approved/returned record, or removal) requires gate.write.
  if exists (
      select 1 from jsonb_array_elements(new_gates) g left join jsonb_array_elements(old_gates) o on o ->> 'id' = g ->> 'id'
      where (g ->> 'status' in ('approved','returned') and (o is null or (o - 'addressedAt' - 'addressedNote') is distinct from (g - 'addressedAt' - 'addressedNote')))
         or (o is not null and o ->> 'status' in ('approved','returned') and (o - 'addressedAt' - 'addressedNote') is distinct from (g - 'addressedAt' - 'addressedNote')))
     and not public.app_can('gate.write') then
    raise exception 'Gate decisions require the gate.write permission';
  end if;
  if exists (select 1 from jsonb_array_elements(old_gates) o where not exists (select 1 from jsonb_array_elements(new_gates) g where g ->> 'id' = o ->> 'id'))
     and not public.app_can('gate.write') then
    raise exception 'Removing a gate record requires the gate.write permission';
  end if;

  -- Documents: uploads need document.write; review outcomes need review.write; removal needs
  -- document.delete; the file identity itself never changes except under disposal.
  if exists (select 1 from jsonb_array_elements(new_docs) d where not exists (select 1 from jsonb_array_elements(old_docs) o where o ->> 'id' = d ->> 'id'))
     and not public.app_can('document.write') then
    raise exception 'Uploading a document requires the document.write permission';
  end if;
  if exists (
      select 1 from jsonb_array_elements(new_docs) d join jsonb_array_elements(old_docs) o on o ->> 'id' = d ->> 'id'
      where d ->> 'status' is distinct from o ->> 'status' or d ->> 'reviewNote' is distinct from o ->> 'reviewNote'
         or d ->> 'reviewedBy' is distinct from o ->> 'reviewedBy' or d ->> 'reviewedAt' is distinct from o ->> 'reviewedAt')
     and not public.app_can('review.write') then
    raise exception 'Reviewing a document requires the review.write permission';
  end if;
  if exists (
      select 1 from jsonb_array_elements(new_docs) d join jsonb_array_elements(old_docs) o on o ->> 'id' = d ->> 'id'
      where (d - 'status' - 'reviewNote' - 'reviewedBy' - 'reviewedAt' - 'fileName' - 'size') is distinct from (o - 'status' - 'reviewNote' - 'reviewedBy' - 'reviewedAt' - 'fileName' - 'size')) then
    raise exception 'Document records are immutable once uploaded';
  end if;
  if exists (
      select 1 from jsonb_array_elements(new_docs) d join jsonb_array_elements(old_docs) o on o ->> 'id' = d ->> 'id'
      where d ->> 'fileName' is distinct from o ->> 'fileName' or d ->> 'size' is distinct from o ->> 'size')
     and not public.app_can('dataprotection.delete') then
    raise exception 'Only disposal may alter a stored file record';
  end if;
  if exists (select 1 from jsonb_array_elements(old_docs) o where not exists (select 1 from jsonb_array_elements(new_docs) d where d ->> 'id' = o ->> 'id'))
     and not public.app_can('document.delete') then
    raise exception 'Removing a document requires the document.delete permission';
  end if;

  -- Data protection.
  if new.data -> 'disposal' is distinct from old.data -> 'disposal' and not public.app_can('dataprotection.delete') then
    raise exception 'Disposing of a record requires the dataprotection.delete permission';
  end if;
  if new.data -> 'legalHold' is distinct from old.data -> 'legalHold' and not public.app_can('dataprotection.write') then
    raise exception 'Legal holds require the dataprotection.write permission';
  end if;
  -- Transfers: step completion appends; editing or removing an existing record needs dataprotection.write (or disposal).
  if exists (select 1 from jsonb_array_elements(old_tr) o where not exists (select 1 from jsonb_array_elements(new_tr) t where t = o))
     and not (public.app_can('dataprotection.write') or public.app_can('dataprotection.delete')) then
    raise exception 'Editing the transfer register requires the dataprotection.write permission';
  end if;

  return new;
end $$;
drop trigger if exists cases_guard on public.cases;
create trigger cases_guard before update on public.cases for each row execute function public.guard_case_update();

-- Audit rows are attributed by the database, never by the client.
create or replace function public.guard_audit_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
declare me text := public.current_app_user_id();
begin
  if public.is_system_caller() then return new; end if;
  if me is null then raise exception 'Sign in required'; end if;
  new.actor_id := me;
  select name into new.actor_name from public.app_users where id = me;
  new.actor_role := coalesce(public.current_app_role(), 'inactive');
  new.at := now();
  return new;
end $$;
drop trigger if exists audit_attribution on public.audit;
create trigger audit_attribution before insert on public.audit for each row execute function public.guard_audit_insert();

-- org_config carries settings, the permission matrix, case scope and standing processors;
-- each part answers to its own cell.
create or replace function public.guard_org_update() returns trigger
  language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if public.is_system_caller() then return new; end if;
  for k in select jsonb_object_keys(coalesce(new.config, '{}'::jsonb) || coalesce(old.config, '{}'::jsonb)) loop
    if new.config -> k is distinct from old.config -> k then
      if k = 'rev' then continue;
      elsif k in ('permissions','caseScope') then
        if not public.app_can('role.write') then raise exception 'Changing % requires the role.write permission', k; end if;
      elsif k = 'processors' then
        if not public.app_can('dataprotection.write') then raise exception 'Editing standing processors requires the dataprotection.write permission'; end if;
      elsif not public.app_can('settings.write') then
        raise exception 'Changing % requires the settings.write permission', k;
      end if;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists org_config_guard on public.org_config;
create trigger org_config_guard before update on public.org_config for each row execute function public.guard_org_update();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.org_config          enable row level security;
alter table public.app_users           enable row level security;
alter table public.cases               enable row level security;
alter table public.audit               enable row level security;
alter table public.prompts             enable row level security;
alter table public.permission_defaults enable row level security;

drop policy if exists org_read   on public.org_config;
drop policy if exists org_write  on public.org_config;
drop policy if exists org_update on public.org_config;
drop policy if exists org_delete on public.org_config;
create policy org_read   on public.org_config for select to authenticated using (true);
create policy org_write  on public.org_config for insert to authenticated with check (public.app_can('settings.write'));
create policy org_update on public.org_config for update to authenticated
  using (public.app_can('settings.write') or public.app_can('role.write') or public.app_can('dataprotection.write'))
  with check (public.app_can('settings.write') or public.app_can('role.write') or public.app_can('dataprotection.write'));
create policy org_delete on public.org_config for delete to authenticated using (public.app_can('settings.delete'));

drop policy if exists users_read   on public.app_users;
drop policy if exists users_insert on public.app_users;
drop policy if exists users_update on public.app_users;
drop policy if exists users_delete on public.app_users;
create policy users_read on public.app_users for select to authenticated using (
  auth_id = auth.uid()
  or public.app_can('staff.read')
  or (public.app_can('staff.view') and role <> 'student')
  or exists (select 1 from public.cases c where c.student_user_id = public.current_app_user_id() and c.counsellor_id = app_users.id)
);
create policy users_insert on public.app_users for insert to authenticated
  with check (public.app_can('staff.write') or (public.app_can('account.write') and role = 'student'));
create policy users_update on public.app_users for update to authenticated
  using (auth_id = auth.uid() or public.app_can('staff.write') or public.app_can('account.delete'))
  with check (auth_id = auth.uid() or public.app_can('staff.write') or public.app_can('account.delete'));
create policy users_delete on public.app_users for delete to authenticated using (public.app_can('staff.delete'));

drop policy if exists cases_read   on public.cases;
drop policy if exists cases_insert on public.cases;
drop policy if exists cases_update on public.cases;
drop policy if exists cases_delete on public.cases;
create policy cases_read on public.cases for select to authenticated
  using (public.app_can('case.read') and public.case_in_scope(counsellor_id, student_user_id));
create policy cases_insert on public.cases for insert to authenticated with check (
  public.app_can('case.write') and public.current_case_scope() in ('all','assigned')
  and (public.current_case_scope() = 'all' or counsellor_id is null or counsellor_id = public.current_app_user_id())
);
create policy cases_update on public.cases for update to authenticated
  using (public.app_can('case.write') and public.case_in_scope(counsellor_id, student_user_id))
  with check (public.app_can('case.write') and public.case_in_scope(counsellor_id, student_user_id));
create policy cases_delete on public.cases for delete to authenticated
  using (public.app_can('case.delete') and public.case_in_scope(counsellor_id, student_user_id));

drop policy if exists audit_read   on public.audit;
drop policy if exists audit_insert on public.audit;
drop policy if exists audit_delete on public.audit;
create policy audit_read   on public.audit for select to authenticated using (public.app_can('audit.read'));
create policy audit_insert on public.audit for insert to authenticated with check (public.current_app_user_id() is not null);
create policy audit_delete on public.audit for delete to authenticated using (public.app_can('settings.delete'));

drop policy if exists prompts_read   on public.prompts;
drop policy if exists prompts_insert on public.prompts;
drop policy if exists prompts_update on public.prompts;
drop policy if exists prompts_delete on public.prompts;
create policy prompts_read   on public.prompts for select to authenticated using (public.current_app_role() = 'admin');
create policy prompts_insert on public.prompts for insert to authenticated with check (public.current_app_role() = 'admin');
create policy prompts_update on public.prompts for update to authenticated
  using (public.current_app_role() = 'admin') with check (public.current_app_role() = 'admin');
create policy prompts_delete on public.prompts for delete to authenticated using (public.current_app_role() = 'admin');

drop policy if exists permission_defaults_read on public.permission_defaults;
create policy permission_defaults_read on public.permission_defaults for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Grants. No table is granted to anon; an anonymous caller can only ask needs_bootstrap().
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.org_config, public.app_users, public.cases, public.audit, public.prompts to authenticated;
grant select on public.permission_defaults to authenticated;
grant execute on function public.needs_bootstrap() to anon, authenticated;
grant execute on function public.current_app_role(), public.current_app_user_id(), public.app_can(text), public.current_case_scope(), public.case_in_scope(text, text), public.workspace_version() to authenticated;
grant execute on function public.next_case_ref(text) to authenticated;
grant usage on sequence public.case_ref_seq to authenticated;

-- ===========================================================================
-- 20260912000000_v5_notifications_audit.sql
-- ===========================================================================

-- Lyceum Placements — Placement Management System
-- Copyright (c) 2026 Bhanu Mendis. All rights reserved.
-- Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
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
comment on table public.notifications is 'Lyceum Placements — Placement Management System. Copyright (c) 2026 Bhanu Mendis. All rights reserved. Per-recipient notifications written by database triggers.';

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
comment on table public.push_subscriptions is 'Lyceum Placements — Placement Management System. Copyright (c) 2026 Bhanu Mendis. All rights reserved. Web Push subscriptions, one row per device.';

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

-- ===========================================================================
-- 20260925000100_v6_write_path.sql
-- ===========================================================================

-- Lyceum Placements — Placement Management System
-- Copyright © Bhanu Mendis - LGH IT
--
-- v6.1 — migration history, the write path and optimistic concurrency. Idempotent.
--
-- Until v5 the browser saved every record with an upsert (INSERT … ON CONFLICT DO UPDATE).
-- Postgres checks the INSERT policy, the SELECT policy and the BEFORE INSERT triggers for an
-- upsert even when the row already exists, so on a real project a counsellor or student
-- could not write an audit row, a student could not save their own case and nobody but the
-- administrator could edit their own profile. From v6 the client inserts new rows and
-- PATCHes existing ones; nothing in this file loosens a policy to make upserts work.
--
-- Concurrency: every case carries a revision. An update must present exactly the stored
-- revision plus one, otherwise it is refused with HTTP 409 (SQLSTATE PT409) and the writer
-- reloads. Two counsellors editing the same case can no longer overwrite each other.

-- ---------------------------------------------------------------------------
-- Migration history
-- ---------------------------------------------------------------------------

create table if not exists public.schema_migrations (
  version    text primary key,
  name       text not null,
  applied_at timestamptz not null default now()
);
alter table public.schema_migrations enable row level security;
revoke all on public.schema_migrations from anon, authenticated;
comment on table public.schema_migrations is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Applied schema migrations; data migrations run once, keyed by version.';

-- A project reaching v6 has necessarily run the v4 base and the v5 additions.
insert into public.schema_migrations (version, name) values
  ('20260901000000', 'v4_base'),
  ('20260912000000', 'v5_notifications_audit')
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- The organisation row always exists, so saving settings is an UPDATE under org_update
-- and never needs the insert policy.
-- ---------------------------------------------------------------------------

insert into public.org_config (id, config) values ('org', '{}'::jsonb) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Cases: columns derived from the document, revision guard, server time
-- ---------------------------------------------------------------------------

-- The columns that row-level security reads (counsellor_id, student_user_id) and the status
-- are copied from the case document rather than trusted from the payload, so the two can
-- never disagree: a caller cannot point student_user_id at another student while the
-- document says otherwise. RLS WITH CHECK runs after BEFORE triggers, so the policies judge
-- the derived values. Runs before cases_guard (trigger names fire in alphabetical order).
create or replace function public.case_derive() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    raise exception 'A case must be a JSON object' using errcode = 'P0001';
  end if;
  if new.data ->> 'id' is distinct from new.id or new.data ->> 'ref' is distinct from new.ref then
    raise exception 'Case identity in the document does not match the record' using errcode = 'P0001';
  end if;
  new.counsellor_id   := nullif(new.data ->> 'counsellorId', '');
  new.student_user_id := nullif(new.data ->> 'studentUserId', '');
  new.status          := coalesce(nullif(new.data ->> 'status', ''), 'open');
  if new.status not in ('open', 'hold', 'deferred', 'exited', 'completed') then
    raise exception 'Unknown case status %', new.status using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    new.rev := 1;
  elsif public.is_system_caller() then
    -- Maintenance jobs and the SQL editor still move the revision, so an open browser copy
    -- of the case is recognised as stale.
    if new.rev is not distinct from old.rev then new.rev := old.rev + 1; end if;
  elsif new.rev is distinct from old.rev + 1 then
    raise exception 'This case was changed by someone else while you were working on it. Your change was not saved; reload to see the latest version.'
      using errcode = 'PT409', hint = 'stale_revision';
  end if;

  new.updated_at := now();
  new.data := jsonb_set(new.data, '{rev}', to_jsonb(new.rev));
  return new;
end $$;

drop trigger if exists cases_derive on public.cases;
create trigger cases_derive before insert or update on public.cases for each row execute function public.case_derive();

-- Saving a case. A PATCH that row-level security filters out matches nothing and still
-- answers 204, which would let a counsellor who was unassigned mid-edit believe their work
-- was saved. The function reports that case instead. It runs with the caller's rights, so
-- the policies, the guard and the revision check above decide exactly as for a PATCH.
create or replace function public.save_case(p_id text, p_rev integer, p_data jsonb) returns integer
  language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update public.cases set rev = p_rev, data = p_data where id = p_id;
  get diagnostics n = row_count;
  if n = 0 then
    if exists (select 1 from public.cases where id = p_id) then
      raise exception 'You can no longer change this case. Ask a Team Leader to check the assignment.' using errcode = 'PT403';
    end if;
    raise exception 'This case no longer exists, or you can no longer see it.' using errcode = 'PT404';
  end if;
  return p_rev;
end $$;
revoke all on function public.save_case(text, integer, jsonb) from public, anon;
grant execute on function public.save_case(text, integer, jsonb) to authenticated;

insert into public.schema_migrations (version, name) values ('20260925000100', 'v6_write_path') on conflict (version) do nothing;

-- ===========================================================================
-- 20260925000200_v6_rbac.sql
-- ===========================================================================

-- Lyceum Placements — Placement Management System
-- Copyright © Bhanu Mendis - LGH IT
--
-- v6.2 — role model: SUPER ADMIN (Group IT) and ADMIN (Placement Team). Idempotent.
--
--   super_admin  Group IT. System owner: holds every cell, including the locked ones (system
--                configuration, the permission matrix, the Prompt Engineer Workspace). Only an
--                email on a Group IT domain (public.group_it_domains) may hold it, only another
--                SUPER ADMIN may grant it, and the last active one cannot be removed.
--   admin        Placement Team. Operational administration: cases, assignment, documents,
--                staff profiles and sign-ins for non-administrator roles, operational settings,
--                data protection, analytics, the audit log (read). Never: system
--                configuration, the permission matrix, administrator accounts, prompts.
--
-- Existing 'admin' profiles held the old all-powerful role; the data migration below makes
-- them SUPER ADMIN so nobody loses access, and the new ADMIN role starts empty. Database
-- credentials, the service role key and the Supabase dashboard are outside the application:
-- they are never held by an application role (see docs/SECURITY.md).

-- ---------------------------------------------------------------------------
-- Roles
-- ---------------------------------------------------------------------------

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users add constraint app_users_role_check
  check (role in ('super_admin', 'admin', 'team_leader', 'counsellor', 'student'));

-- ---------------------------------------------------------------------------
-- Group IT: the email domains that may hold SUPER ADMIN. Maintained with SQL by Group IT
-- (migrations or the SQL editor); no application role can write it.
-- ---------------------------------------------------------------------------

create table if not exists public.group_it_domains (
  domain   text primary key check (domain = lower(domain) and domain ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  note     text,
  added_at timestamptz not null default now()
);
alter table public.group_it_domains enable row level security;
drop policy if exists group_it_domains_read on public.group_it_domains;
create policy group_it_domains_read on public.group_it_domains for select to authenticated using (true);
revoke all on public.group_it_domains from anon, authenticated;
grant select on public.group_it_domains to authenticated;
comment on table public.group_it_domains is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Email domains whose accounts may hold SUPER ADMIN. Changed by Group IT through SQL only.';
insert into public.group_it_domains (domain, note) values ('lyceum.lk', 'Group IT, set by migration 20260925000200')
on conflict (domain) do nothing;

create or replace function public.is_group_it_email(p_email text) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_it_domains d where d.domain = lower(split_part(coalesce(p_email, ''), '@', 2)))
$$;

-- The first-run screen checks the address before signing up, so the refusal is explained
-- rather than arriving as the identity provider's generic error. Domains are not secret.
create or replace function public.bootstrap_domains() returns text[]
  language sql stable security definer set search_path = public as $$
  select case when (select count(*) from public.app_users) = 0
    then coalesce((select array_agg(domain order by domain) from public.group_it_domains), '{}') else '{}' end
$$;

-- ---------------------------------------------------------------------------
-- The matrix
-- ---------------------------------------------------------------------------

-- Cells no configuration can grant to anyone but SUPER ADMIN.
create or replace function public.perm_is_locked(perm text) returns boolean
  language sql immutable as $$
  select split_part(perm, '.', 1) in ('system', 'prompt') or perm = 'role.write'
$$;

-- Standard model. SUPER ADMIN is implicit. Keep in step with DEFAULT_PERMISSIONS in
-- src/lib/rbac.ts; the integration suite compares the two cell for cell.
delete from public.permission_defaults where perm = 'settings.delete';
insert into public.permission_defaults (perm, roles) values
  ('case.view',               '{admin,team_leader,counsellor,student}'),
  ('case.read',               '{admin,team_leader,counsellor,student}'),
  ('case.write',              '{admin,team_leader,counsellor,student}'),
  ('case.delete',             '{}'),
  ('case.download',           '{admin,team_leader,counsellor}'),
  ('sensitive.view',          '{admin,team_leader,counsellor,student}'),
  ('sensitive.read',          '{admin,team_leader,counsellor}'),
  ('sensitive.write',         '{admin,team_leader,counsellor,student}'),
  ('assignment.view',         '{admin,team_leader,counsellor,student}'),
  ('assignment.write',        '{admin,team_leader}'),
  ('document.view',           '{admin,team_leader,counsellor,student}'),
  ('document.read',           '{admin,team_leader,counsellor,student}'),
  ('document.write',          '{admin,counsellor,student}'),
  ('document.delete',         '{}'),
  ('document.download',       '{admin,team_leader,counsellor,student}'),
  ('review.view',             '{admin,team_leader,counsellor,student}'),
  ('review.write',            '{admin,team_leader,counsellor}'),
  ('gate.view',               '{admin,team_leader,counsellor}'),
  ('gate.read',               '{admin,team_leader,counsellor}'),
  ('gate.write',              '{team_leader}'),
  ('escalation.view',         '{admin,team_leader}'),
  ('escalation.read',         '{admin,team_leader}'),
  ('analytics.view',          '{admin,team_leader}'),
  ('analytics.read',          '{admin,team_leader}'),
  ('analytics.download',      '{admin,team_leader}'),
  ('staff.view',              '{admin,team_leader,counsellor}'),
  ('staff.read',              '{admin,team_leader}'),
  ('staff.write',             '{admin}'),
  ('staff.delete',            '{}'),
  ('staff.download',          '{admin}'),
  ('account.write',           '{admin}'),
  ('account.delete',          '{admin}'),
  ('role.view',               '{admin}'),
  ('role.read',               '{admin}'),
  ('role.write',              '{}'),
  ('audit.view',              '{admin,team_leader}'),
  ('audit.read',              '{admin,team_leader}'),
  ('audit.download',          '{}'),
  ('settings.view',           '{admin}'),
  ('settings.read',           '{admin}'),
  ('settings.write',          '{admin}'),
  ('dataprotection.view',     '{admin,team_leader}'),
  ('dataprotection.read',     '{admin,team_leader}'),
  ('dataprotection.write',    '{admin,team_leader}'),
  ('dataprotection.delete',   '{}'),
  ('dataprotection.download', '{admin,team_leader}'),
  ('system.view',             '{}'),
  ('system.read',             '{}'),
  ('system.write',            '{}'),
  ('system.delete',           '{}'),
  ('prompt.view',             '{}'),
  ('prompt.read',             '{}'),
  ('prompt.write',            '{}'),
  ('prompt.delete',           '{}'),
  ('prompt.download',         '{}')
on conflict (perm) do update set roles = excluded.roles;

create or replace function public.app_can(perm text) returns boolean
  language plpgsql stable security definer set search_path = public as $$
declare r text; cell jsonb;
begin
  r := public.current_app_role();
  if r is null then return false; end if;
  if r = 'super_admin' then return true; end if;
  if public.perm_is_locked(perm) then return false; end if;
  select c.config -> 'permissions' -> perm into cell from public.org_config c where c.id = 'org';
  if cell is not null and jsonb_typeof(cell) = 'array' then return cell ? r; end if;
  return exists (select 1 from public.permission_defaults d where d.perm = app_can.perm and r = any (d.roles));
end $$;

create or replace function public.current_case_scope() returns text
  language plpgsql stable security definer set search_path = public as $$
declare r text; s text;
begin
  r := public.current_app_role();
  if r is null then return 'none'; end if;
  if r = 'super_admin' then return 'all'; end if;
  select c.config -> 'caseScope' ->> r into s from public.org_config c where c.id = 'org';
  if s in ('none', 'own', 'assigned', 'all') then return s; end if;
  return case r when 'admin' then 'all' when 'team_leader' then 'all' when 'counsellor' then 'assigned' when 'student' then 'own' else 'none' end;
end $$;

-- Roles holding a cell (used by the notification fan-out); SUPER ADMIN always.
create or replace function public.roles_holding(perm text) returns text[]
  language plpgsql stable security definer set search_path = public as $$
declare cell jsonb; out_roles text[];
begin
  if public.perm_is_locked(perm) then return array['super_admin']; end if;
  select c.config -> 'permissions' -> perm into cell from public.org_config c where c.id = 'org';
  if cell is not null and jsonb_typeof(cell) = 'array' then
    select array_agg(x) into out_roles from jsonb_array_elements_text(cell) t(x) where x <> 'super_admin';
  else
    select d.roles into out_roles from public.permission_defaults d where d.perm = roles_holding.perm;
  end if;
  return array_append(coalesce(out_roles, '{}'::text[]), 'super_admin');
end $$;

-- Administrator accounts (SUPER ADMIN and ADMIN) are managed by a SUPER ADMIN only: their
-- profiles, their sign-ins, their passwords and their activation. Used by the profile guards
-- below and by the account-administration endpoint (lpl-api) before it touches an identity.
create or replace function public.can_manage_account(p_target text) returns boolean
  language sql stable security definer set search_path = public as $$
  select case
    when (select role from public.app_users where id = p_target) in ('super_admin', 'admin') then public.current_app_role() = 'super_admin'
    else public.current_app_role() is not null
  end
$$;

-- ---------------------------------------------------------------------------
-- Data migration: runs once.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.schema_migrations where version = '20260925000200') then return; end if;

  -- The v5 administrator was the system owner; that is now SUPER ADMIN.
  update public.app_users set role = 'super_admin' where role = 'admin';

  -- Stored matrix: every v5 cell listed 'admin' (the old owner). Strip it, then give the new
  -- ADMIN exactly the v6 standard cells; drop cells that no longer exist.
  update public.org_config c set config = jsonb_set(c.config, '{permissions}', coalesce((
    select jsonb_object_agg(p.key, (
      select coalesce(jsonb_agg(x.r order by x.r), '[]'::jsonb) from (
        select r from jsonb_array_elements_text(p.value) r where r not in ('admin', 'super_admin')
        union
        select 'admin' where exists (select 1 from public.permission_defaults d where d.perm = p.key and 'admin' = any (d.roles))
      ) x(r)))
    from jsonb_each(c.config -> 'permissions') p
    where jsonb_typeof(p.value) = 'array' and p.key <> 'settings.delete' and not public.perm_is_locked(p.key)
  ), '{}'::jsonb))
  where jsonb_typeof(c.config -> 'permissions') = 'object';

  update public.org_config c set config = jsonb_set(c.config, '{caseScope}', (c.config -> 'caseScope') - 'super_admin' || jsonb_build_object('admin', 'all'))
  where jsonb_typeof(c.config -> 'caseScope') = 'object';
end $$;

-- SUPER ADMINs outside the Group IT domains (for example a v5 administrator who signed up
-- with a personal address). They keep access; Group IT reviews this list and either adds
-- the domain or moves the role to a Group IT account.
create or replace view public.super_admin_review with (security_invoker = true) as
  select id, email, name, active, created_at
  from public.app_users
  where role = 'super_admin' and not public.is_group_it_email(email);
revoke all on public.super_admin_review from anon, authenticated;
comment on view public.super_admin_review is 'SUPER ADMIN profiles whose email is not on a Group IT domain. Review after upgrading from v5.';

-- ---------------------------------------------------------------------------
-- Identity: bootstrap creates the first SUPER ADMIN, from a Group IT address only.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_auth_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  meta_id  text;
  is_first boolean;
begin
  if coalesce(new.raw_app_meta_data ->> 'provisioned', '') = 'admin-users' then
    meta_id := nullif(new.raw_app_meta_data ->> 'app_user_id', '');
    update public.app_users set auth_id = new.id, last_sign_in_at = now()
     where id = meta_id and auth_id is null and lower(email) = lower(new.email);
    if not found then raise exception 'Provisioned identity does not match an unclaimed profile' using errcode = 'P0001'; end if;
    return new;
  end if;

  select count(*) = 0 into is_first from public.app_users;
  if is_first then
    if not public.is_group_it_email(new.email) then
      raise exception 'The first account must use a Group IT email address' using errcode = 'P0001';
    end if;
    insert into public.app_users (id, auth_id, email, name, phone, role, active, created_at, last_sign_in_at)
    values (gen_random_uuid()::text, new.id, lower(new.email),
      coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email,'@',1)),
      nullif(new.raw_user_meta_data->>'phone',''), 'super_admin', true, now(), now());
    return new;
  end if;

  raise exception 'Registration is closed. Accounts are created by an administrator.' using errcode = 'P0001';
end $$;

-- ---------------------------------------------------------------------------
-- Profile guards
-- ---------------------------------------------------------------------------

create or replace function public.guard_user_update() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  me text := public.current_app_user_id();
  r  text := public.current_app_role();
  own_contact_only boolean;
begin
  if public.is_system_caller() then return new; end if;
  if new.id is distinct from old.id then raise exception 'id is not writable'; end if;
  if new.auth_id is distinct from old.auth_id then raise exception 'auth_id is not writable'; end if;

  -- Nobody changes their own role or activation, SUPER ADMIN included: no self-escalation and
  -- no accidental self-lockout.
  if old.id = me and (new.role is distinct from old.role or new.active is distinct from old.active) then
    raise exception 'You cannot change your own role or activation state';
  end if;

  -- Administrator accounts are managed by a SUPER ADMIN only. Anyone may still edit their own
  -- contact details and sign-in time.
  own_contact_only := old.id = me and new.role = old.role and new.active = old.active and new.email = old.email;
  if r is distinct from 'super_admin' and (old.role in ('super_admin', 'admin') or new.role in ('super_admin', 'admin')) and not own_contact_only then
    raise exception 'Only a SUPER ADMIN may manage administrator accounts';
  end if;

  if new.role = 'super_admin' and (new.role is distinct from old.role or new.email is distinct from old.email) and not public.is_group_it_email(new.email) then
    raise exception 'SUPER ADMIN is restricted to Group IT email addresses';
  end if;

  -- The last active SUPER ADMIN stays.
  if old.role = 'super_admin' and old.active and (new.role <> 'super_admin' or not new.active)
     and not exists (select 1 from public.app_users u where u.role = 'super_admin' and u.active and u.id <> old.id) then
    raise exception 'At least one active SUPER ADMIN must remain';
  end if;

  if not public.app_can('staff.write') then
    if new.role is distinct from old.role then raise exception 'Changing a role requires the staff.write permission'; end if;
    if new.email is distinct from old.email then raise exception 'Changing an email address requires the staff.write permission'; end if;
    if old.id <> me and (new.name is distinct from old.name or new.phone is distinct from old.phone or new.branch is distinct from old.branch or new.created_by is distinct from old.created_by) then
      raise exception 'Editing another profile requires the staff.write permission';
    end if;
  end if;
  if new.active is distinct from old.active and not public.app_can('account.delete') then
    raise exception 'Deactivating or reactivating a sign-in requires the account.delete permission';
  end if;
  return new;
end $$;

create or replace function public.guard_user_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if public.is_system_caller() then return new; end if;
  if new.auth_id is not null then raise exception 'auth_id is set by the identity provider'; end if;
  if new.role in ('super_admin', 'admin') and public.current_app_role() is distinct from 'super_admin' then
    raise exception 'Only a SUPER ADMIN may create administrator accounts';
  end if;
  if new.role = 'super_admin' and not public.is_group_it_email(new.email) then
    raise exception 'SUPER ADMIN is restricted to Group IT email addresses';
  end if;
  if new.role <> 'student' and not public.app_can('staff.write') then raise exception 'Creating a staff profile requires the staff.write permission'; end if;
  if new.role = 'student' and not (public.app_can('staff.write') or public.app_can('account.write')) then raise exception 'Creating a student profile requires staff.write or account.write'; end if;
  return new;
end $$;

create or replace function public.guard_user_delete() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if public.is_system_caller() then return old; end if;
  if old.id = public.current_app_user_id() then raise exception 'You cannot delete your own profile'; end if;
  if old.role in ('super_admin', 'admin') and public.current_app_role() is distinct from 'super_admin' then
    raise exception 'Only a SUPER ADMIN may manage administrator accounts';
  end if;
  if old.role = 'super_admin' and old.active
     and not exists (select 1 from public.app_users u where u.role = 'super_admin' and u.active and u.id <> old.id) then
    raise exception 'At least one active SUPER ADMIN must remain';
  end if;
  return old;
end $$;
drop trigger if exists app_users_delete_guard on public.app_users;
create trigger app_users_delete_guard before delete on public.app_users for each row execute function public.guard_user_delete();

-- ---------------------------------------------------------------------------
-- Organisation configuration: each key answers to its own cell, and the stored matrix
-- can never grant a locked cell or name SUPER ADMIN.
-- ---------------------------------------------------------------------------

create or replace function public.guard_org_update() returns trigger
  language plpgsql security definer set search_path = public as $$
declare k text; p record;
begin
  if public.is_system_caller() then return new; end if;
  for k in select jsonb_object_keys(coalesce(new.config, '{}'::jsonb) || coalesce(old.config, '{}'::jsonb)) loop
    if new.config -> k is distinct from old.config -> k then
      if k in ('rev', 'setupComplete') then continue;
      elsif k in ('permissions', 'caseScope') then
        if not public.app_can('role.write') then raise exception 'Changing % requires the role.write permission', k; end if;
      elsif k = 'processors' then
        if not public.app_can('dataprotection.write') then raise exception 'Editing standing processors requires the dataprotection.write permission'; end if;
      elsif k = 'push' then
        if not public.app_can('system.write') then raise exception 'Changing the push notification keys requires the system.write permission'; end if;
      elsif not public.app_can('settings.write') then
        raise exception 'Changing % requires the settings.write permission', k;
      end if;
    end if;
  end loop;

  if jsonb_typeof(new.config -> 'permissions') = 'object' then
    for p in select key, value from jsonb_each(new.config -> 'permissions') loop
      if jsonb_typeof(p.value) <> 'array' then raise exception 'Permission % must be a list of roles', p.key; end if;
      if exists (select 1 from jsonb_array_elements_text(p.value) x where x not in ('admin', 'team_leader', 'counsellor', 'student')) then
        raise exception 'Permission % names an unknown role or SUPER ADMIN (who holds every cell implicitly)', p.key;
      end if;
      if public.perm_is_locked(p.key) and jsonb_array_length(p.value) > 0 then
        raise exception 'Permission % is reserved for SUPER ADMIN and cannot be granted', p.key;
      end if;
    end loop;
  end if;
  if jsonb_typeof(new.config -> 'caseScope') = 'object' and (new.config -> 'caseScope') ? 'super_admin' then
    raise exception 'SUPER ADMIN always sees every case';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Cases: the student link
-- ---------------------------------------------------------------------------

-- A case is linked to a student account when it is created. Re-linking it to a different
-- student through the API would hand one student another's record, so it is refused for
-- everyone; clearing the link is part of disposal.
create or replace function public.guard_case_link() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if public.is_system_caller() or new.student_user_id is not distinct from old.student_user_id then return new; end if;
  if new.student_user_id is null then
    if not public.app_can('dataprotection.delete') then raise exception 'Unlinking a student requires the dataprotection.delete permission'; end if;
    return new;
  end if;
  if old.student_user_id is not null then raise exception 'A case cannot be moved to a different student account'; end if;
  if not public.app_can('account.write') then raise exception 'Linking a student account requires the account.write permission'; end if;
  if not exists (select 1 from public.app_users u where u.id = new.student_user_id and u.role = 'student') then
    raise exception 'Only a student account can be linked to a case';
  end if;
  if exists (select 1 from public.cases c where c.student_user_id = new.student_user_id and c.id <> new.id) then
    raise exception 'That student account is already linked to another case';
  end if;
  return new;
end $$;
drop trigger if exists cases_link_guard on public.cases;
create trigger cases_link_guard before update on public.cases for each row execute function public.guard_case_link();

-- ---------------------------------------------------------------------------
-- SUPER ADMIN-only objects
-- ---------------------------------------------------------------------------

drop policy if exists prompts_read   on public.prompts;
drop policy if exists prompts_insert on public.prompts;
drop policy if exists prompts_update on public.prompts;
drop policy if exists prompts_delete on public.prompts;
create policy prompts_read   on public.prompts for select to authenticated using ((select public.current_app_role()) = 'super_admin');
create policy prompts_insert on public.prompts for insert to authenticated with check ((select public.current_app_role()) = 'super_admin');
create policy prompts_update on public.prompts for update to authenticated
  using ((select public.current_app_role()) = 'super_admin') with check ((select public.current_app_role()) = 'super_admin');
create policy prompts_delete on public.prompts for delete to authenticated using ((select public.current_app_role()) = 'super_admin');

create or replace function public.prune_notifications(p_days integer) returns integer
  language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if public.current_app_role() is distinct from 'super_admin' then
    raise exception 'Pruning notifications requires SUPER ADMIN';
  end if;
  delete from public.notifications where at < now() - make_interval(days => greatest(coalesce(p_days, 90), 7));
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Row-level security, rewritten so the per-caller helpers are evaluated once per statement
-- (an InitPlan) rather than once per row: at a million cases the difference is seconds.
-- The visibility rule itself is unchanged.
-- ---------------------------------------------------------------------------

drop policy if exists cases_read   on public.cases;
drop policy if exists cases_insert on public.cases;
drop policy if exists cases_update on public.cases;
drop policy if exists cases_delete on public.cases;
create policy cases_read on public.cases for select to authenticated using (
  (select public.app_can('case.read')) and (
    (select public.current_case_scope()) = 'all'
    or ((select public.current_case_scope()) = 'assigned' and counsellor_id = (select public.current_app_user_id()))
    or ((select public.current_case_scope()) = 'own' and student_user_id = (select public.current_app_user_id()))));
create policy cases_insert on public.cases for insert to authenticated with check (
  (select public.app_can('case.write')) and (
    (select public.current_case_scope()) = 'all'
    or ((select public.current_case_scope()) = 'assigned' and (counsellor_id is null or counsellor_id = (select public.current_app_user_id())))));
create policy cases_update on public.cases for update to authenticated
  using ((select public.app_can('case.write')) and (
    (select public.current_case_scope()) = 'all'
    or ((select public.current_case_scope()) = 'assigned' and counsellor_id = (select public.current_app_user_id()))
    or ((select public.current_case_scope()) = 'own' and student_user_id = (select public.current_app_user_id()))))
  with check ((select public.app_can('case.write')) and (
    (select public.current_case_scope()) = 'all'
    or ((select public.current_case_scope()) = 'assigned' and counsellor_id = (select public.current_app_user_id()))
    or ((select public.current_case_scope()) = 'own' and student_user_id = (select public.current_app_user_id()))));
create policy cases_delete on public.cases for delete to authenticated using (
  (select public.app_can('case.delete')) and (
    (select public.current_case_scope()) = 'all'
    or ((select public.current_case_scope()) = 'assigned' and counsellor_id = (select public.current_app_user_id()))));

drop policy if exists users_read   on public.app_users;
drop policy if exists users_insert on public.app_users;
drop policy if exists users_update on public.app_users;
drop policy if exists users_delete on public.app_users;
create policy users_read on public.app_users for select to authenticated using (
  auth_id = (select auth.uid())
  or (select public.app_can('staff.read'))
  or ((select public.app_can('staff.view')) and role <> 'student')
  or exists (select 1 from public.cases c where c.student_user_id = (select public.current_app_user_id()) and c.counsellor_id = app_users.id));
create policy users_insert on public.app_users for insert to authenticated
  with check ((select public.app_can('staff.write')) or ((select public.app_can('account.write')) and role = 'student'));
create policy users_update on public.app_users for update to authenticated
  using (auth_id = (select auth.uid()) or (select public.app_can('staff.write')) or (select public.app_can('account.delete')))
  with check (auth_id = (select auth.uid()) or (select public.app_can('staff.write')) or (select public.app_can('account.delete')));
create policy users_delete on public.app_users for delete to authenticated using ((select public.app_can('staff.delete')));

drop policy if exists audit_read   on public.audit;
drop policy if exists audit_insert on public.audit;
drop policy if exists audit_delete on public.audit;
create policy audit_read   on public.audit for select to authenticated using ((select public.app_can('audit.read')));
create policy audit_insert on public.audit for insert to authenticated with check ((select public.current_app_user_id()) is not null);
-- The audit log is append-only for every application role. Retention is a database job.
revoke delete on public.audit from authenticated;

drop policy if exists org_read   on public.org_config;
drop policy if exists org_write  on public.org_config;
drop policy if exists org_update on public.org_config;
drop policy if exists org_delete on public.org_config;
create policy org_read   on public.org_config for select to authenticated using (true);
create policy org_update on public.org_config for update to authenticated
  using ((select public.app_can('settings.write')) or (select public.app_can('role.write')) or (select public.app_can('dataprotection.write')) or (select public.app_can('system.write')))
  with check ((select public.app_can('settings.write')) or (select public.app_can('role.write')) or (select public.app_can('dataprotection.write')) or (select public.app_can('system.write')));
-- The single configuration row exists from the migration on; it is never inserted or deleted
-- through the API.
revoke insert, delete on public.org_config from authenticated;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.is_group_it_email(text) from public;
revoke all on function public.can_manage_account(text) from public;
revoke all on function public.bootstrap_domains() from public;
grant execute on function public.is_group_it_email(text), public.can_manage_account(text), public.perm_is_locked(text) to authenticated;
grant execute on function public.bootstrap_domains() to anon, authenticated;

comment on column public.app_users.role is 'super_admin (Group IT, see group_it_domains) | admin (Placement Team) | team_leader | counsellor | student.';

insert into public.schema_migrations (version, name) values ('20260925000200', 'v6_rbac') on conflict (version) do nothing;

-- ===========================================================================
-- 20260925000300_v6_case_index.sql
-- ===========================================================================

-- Lyceum Placements — Placement Management System
-- Copyright © Bhanu Mendis - LGH IT
--
-- v6.3 — cases at scale. Idempotent.
--
-- Until v5 every browser downloaded every case it could see and worked out stages, clocks and
-- dashboards itself: fine for a hundred cases, impossible for a hundred thousand. From v6 the
-- database keeps a summary of each case in columns, derived from the case document on every
-- write (so it cannot disagree with the document or be set by a client), and answers lists,
-- searches and dashboards with paging and aggregation.
--
-- The derivation mirrors src/lib/summary.ts line for line; the integration suite replays a
-- generated fixture through both and requires identical answers.

-- ---------------------------------------------------------------------------
-- The process spine the derivation needs: order, pipeline stage, optional, unlock dependencies.
-- Generated from src/lib/spine.ts; src/lib/summary.parity.test.ts checks it stays in step.
-- ---------------------------------------------------------------------------

create table if not exists public.case_step_defs (
  n        smallint primary key,
  ord      smallint not null unique,
  stage    smallint not null check (stage between 1 and 9),
  optional boolean not null,
  deps     smallint[] not null
);
alter table public.case_step_defs enable row level security;
drop policy if exists case_step_defs_read on public.case_step_defs;
create policy case_step_defs_read on public.case_step_defs for select to authenticated using (true);
revoke all on public.case_step_defs from anon, authenticated;
grant select on public.case_step_defs to authenticated;
comment on table public.case_step_defs is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. The 31 process steps: order, pipeline stage, optional, unlock dependencies (from src/lib/spine.ts).';
insert into public.case_step_defs (n, ord, stage, optional, deps) values
  (1, 1, 1, false, '{}'),
  (2, 2, 2, false, '{1}'),
  (3, 3, 2, false, '{2}'),
  (4, 4, 3, false, '{3}'),
  (5, 5, 3, true, '{4}'),
  (6, 6, 3, false, '{4}'),
  (7, 7, 4, false, '{6}'),
  (8, 8, 4, false, '{7}'),
  (9, 9, 5, false, '{8}'),
  (10, 10, 5, false, '{9}'),
  (11, 11, 5, false, '{10}'),
  (12, 12, 5, true, '{11}'),
  (13, 13, 6, false, '{11}'),
  (14, 14, 6, false, '{13}'),
  (15, 15, 7, false, '{13}'),
  (16, 16, 7, false, '{14,15}'),
  (17, 17, 7, false, '{16}'),
  (18, 18, 7, false, '{17}'),
  (21, 19, 7, false, '{18}'),
  (19, 20, 8, false, '{16}'),
  (22, 21, 8, false, '{19,21}'),
  (23, 22, 8, false, '{22}'),
  (24, 23, 8, true, '{22}'),
  (25, 24, 8, true, '{22}'),
  (27, 25, 8, false, '{23}'),
  (20, 26, 9, false, '{14}'),
  (26, 27, 9, false, '{21}'),
  (28, 28, 9, false, '{27}'),
  (29, 29, 9, false, '{20}'),
  (30, 30, 9, false, '{28}'),
  (31, 31, 9, false, '{30}')
on conflict (n) do update set ord = excluded.ord, stage = excluded.stage, optional = excluded.optional, deps = excluded.deps;

-- ---------------------------------------------------------------------------
-- Value helpers. Dates follow JavaScript's reading of the same strings: a date-only value is
-- UTC midnight; arithmetic is in UTC; months clamp at month end (as src/lib/logic.ts now does).
-- ---------------------------------------------------------------------------

-- A non-empty JSON string, else null (JavaScript: typeof v === "string" && v !== "").
create or replace function public.lpl_str(v jsonb) returns text
  language sql immutable parallel safe as $$
  select case when jsonb_typeof(v) = 'string' and v #>> '{}' <> '' then v #>> '{}' end
$$;

-- A parseable instant, else null. Date-only strings are UTC midnight; an instant without a zone
-- is read as UTC; anything that is not a date is null rather than an error.
create or replace function public.lpl_ts(v text) returns timestamptz
  language plpgsql immutable parallel safe as $$
begin
  if v is null or v = '' then return null; end if;
  if v ~ '^\d{4}-\d{2}-\d{2}$' then return (v::date)::timestamp at time zone 'UTC'; end if;
  if v ~ '^\d{4}-\d{2}-\d{2}[T ][0-9:.]+(Z|[+-]\d{2}(:?\d{2})?)$' then return v::timestamptz; end if;
  if v ~ '^\d{4}-\d{2}-\d{2}[T ][0-9:.]+$' then return v::timestamp at time zone 'UTC'; end if;
  return null;
exception when others then
  return null;
end $$;

create or replace function public.lpl_add_days(t timestamptz, n integer) returns timestamptz
  language sql immutable parallel safe as $$ select ((t at time zone 'UTC') + make_interval(days => n)) at time zone 'UTC' $$;

create or replace function public.lpl_add_months(t timestamptz, n integer) returns timestamptz
  language sql immutable parallel safe as $$ select ((t at time zone 'UTC') + make_interval(months => n)) at time zone 'UTC' $$;

-- Whole days until `due`, rounded up (JavaScript: Math.ceil((due - now) / 86400000)).
create or replace function public.lpl_days_until(due timestamptz, now_ts timestamptz) returns integer
  language sql immutable parallel safe as $$ select ceil(extract(epoch from (due - now_ts)) / 86400)::integer $$;

-- "Now" for derived state. Tests pin it with set_config('lpl.now', …, true); nothing else sets it.
create or replace function public.lpl_now() returns timestamptz
  language sql stable parallel safe as $$ select coalesce(nullif(current_setting('lpl.now', true), '')::timestamptz, now()) $$;

-- ---------------------------------------------------------------------------
-- Summary columns
-- ---------------------------------------------------------------------------

alter table public.cases
  add column if not exists student_name            text,
  add column if not exists student_email           text,
  add column if not exists created_at              timestamptz,
  add column if not exists data_updated_at         timestamptz,
  add column if not exists current_step            smallint,
  add column if not exists stage                   smallint,
  add column if not exists progress_done           smallint,
  add column if not exists progress_applicable     smallint,
  add column if not exists progress_pct            smallint,
  add column if not exists gate_pending            smallint,
  add column if not exists gate_pending_at         timestamptz,
  add column if not exists gate_pending_round      integer,
  add column if not exists gate_returned           smallint,
  add column if not exists docs_uploaded           integer,
  add column if not exists docs_accepted           integer,
  add column if not exists docs_rejected           integer,
  add column if not exists profile_submitted       boolean,
  add column if not exists cis_start_at            timestamptz,
  add column if not exists cis2_from               timestamptz,
  add column if not exists offer_lapse_at          timestamptz,
  add column if not exists arrival_at              timestamptz,
  add column if not exists hold_review_at          timestamptz,
  add column if not exists retention_anchor_at     timestamptz,
  add column if not exists retention_kind          text,
  add column if not exists disposed                boolean,
  add column if not exists legal_hold              boolean,
  add column if not exists last_event_at           timestamptz,
  add column if not exists last_event_by           text,
  add column if not exists destination             text,
  add column if not exists channel                 text,
  add column if not exists exit_code               text,
  add column if not exists done_mask               integer,
  add column if not exists visa_granted            boolean,
  add column if not exists cis_sent_at             timestamptz,
  add column if not exists offer_decided_at        timestamptz,
  add column if not exists profile_started         boolean,
  add column if not exists consent_yes             boolean,
  add column if not exists transfers_total         integer,
  add column if not exists transfers_unsafeguarded integer,
  -- Index-only helpers (not part of the summary contract): a clock is running; the case may
  -- need someone (a clock, a gate, documents or a profile to review); the searchable text.
  add column if not exists has_clock               boolean,
  add column if not exists needs_look              boolean,
  add column if not exists search_text             text;
-- The list orders as plain columns, never null: a COALESCE in a keyset condition is not
-- leakproof, so under row-level security it could not use the index (see case_filter).
alter table public.cases
  add column if not exists list_at timestamptz generated always as (coalesce(data_updated_at, '-infinity'::timestamptz)) stored,
  add column if not exists gate_at timestamptz generated always as (coalesce(gate_pending_at, 'infinity'::timestamptz)) stored;
comment on column public.cases.stage is 'Derived by case_derive() from data on every write (summary of the case for lists and dashboards); never written by a client.';

-- The summary, from the document. Mirrors summarizeCase() in src/lib/summary.ts.
create or replace function public.case_summarize(inout c public.cases)
  language plpgsql stable set search_path = public as $$
declare
  d  jsonb := c.data;
  st jsonb := coalesce(case when jsonb_typeof(c.data -> 'steps') = 'object' then c.data -> 'steps' end, '{}'::jsonb);
  gates jsonb := coalesce(case when jsonb_typeof(c.data -> 'gates') = 'array' then c.data -> 'gates' end, '[]'::jsonb);
  docs jsonb := coalesce(case when jsonb_typeof(c.data -> 'documents') = 'array' then c.data -> 'documents' end, '[]'::jsonb);
  trs jsonb := coalesce(case when jsonb_typeof(c.data -> 'transfers') = 'array' then c.data -> 'transfers' end, '[]'::jsonb);
  g int; l jsonb;
  s2 jsonb := st -> '2'; s3 jsonb := st -> '3'; s4 jsonb := st -> '4'; s5 jsonb := st -> '5'; s13 jsonb := st -> '13';
  s14 jsonb := st -> '14'; s27 jsonb := st -> '27'; s30 jsonb := st -> '30'; s31 jsonb := st -> '31';
  s1 jsonb := st -> '1'; s6 jsonb := st -> '6';
begin
  c.student_name     := coalesce(d -> 'student' ->> 'name', '');
  c.student_email    := coalesce(d -> 'student' ->> 'email', '');
  c.created_at       := public.lpl_ts(public.lpl_str(d -> 'createdAt'));
  c.data_updated_at  := public.lpl_ts(public.lpl_str(d -> 'updatedAt'));

  -- Current step: the first required step, in process order, not yet done or skipped whose
  -- dependencies are all done or skipped.
  select sd.n into c.current_step from public.case_step_defs sd
   where not sd.optional
     and coalesce(st -> sd.n::text ->> 'status', 'pending') not in ('done', 'na')
     and not exists (select 1 from unnest(sd.deps) dep where coalesce(st -> dep::text ->> 'status', 'pending') not in ('done', 'na'))
   order by sd.ord limit 1;
  c.stage := coalesce((select sd.stage from public.case_step_defs sd where sd.n = c.current_step), 9);

  select count(*) filter (where coalesce(st -> sd.n::text ->> 'status', 'pending') = 'done'),
         count(*) filter (where coalesce(st -> sd.n::text ->> 'status', 'pending') <> 'na'),
         coalesce(sum(case when coalesce(st -> sd.n::text ->> 'status', 'pending') = 'done' then 1 << (sd.n - 1) else 0 end), 0)
    into c.progress_done, c.progress_applicable, c.done_mask
    from public.case_step_defs sd;
  c.progress_pct := case when c.progress_applicable > 0 then round(c.progress_done::numeric * 100 / c.progress_applicable) else 0 end;

  -- Gates: the latest round of each; a returned round not yet addressed, or a pending one.
  c.gate_pending := null; c.gate_pending_at := null; c.gate_pending_round := null; c.gate_returned := null;
  foreach g in array array[16, 19] loop
    select e into l from jsonb_array_elements(gates) with ordinality t(e, i)
     where jsonb_typeof(e) = 'object' and e ->> 'gate' = g::text
     order by coalesce(case when jsonb_typeof(e -> 'round') = 'number' then (e ->> 'round')::numeric end, 0) desc, i
     limit 1;
    continue when l is null;
    if l ->> 'status' = 'returned' and coalesce(l ->> 'addressedAt', '') = '' then
      c.gate_returned := coalesce(c.gate_returned, g);
    elsif l ->> 'status' = 'pending' and c.gate_pending is null then
      c.gate_pending := g;
      c.gate_pending_at := public.lpl_ts(public.lpl_str(l -> 'submittedAt'));
      c.gate_pending_round := case when jsonb_typeof(l -> 'round') = 'number' then (l ->> 'round')::numeric::integer end;
    end if;
  end loop;

  select count(*) filter (where e ->> 'status' = 'uploaded'), count(*) filter (where e ->> 'status' = 'accepted'), count(*) filter (where e ->> 'status' = 'rejected')
    into c.docs_uploaded, c.docs_accepted, c.docs_rejected from jsonb_array_elements(docs) e;

  c.profile_submitted := coalesce(public.lpl_str(s2 -> 'studentSubmittedAt'), '') <> '' and coalesce(s2 ->> 'status', 'pending') <> 'done';
  c.cis_start_at      := case when s3 ->> 'status' = 'done' then public.lpl_ts(public.lpl_str(s3 -> 'completedAt')) end;
  c.cis2_from         := case when coalesce(s5 ->> 'status', 'pending') = 'pending' then public.lpl_ts(public.lpl_str(s5 -> 'values' -> 'requestedDate')) end;
  c.offer_lapse_at    := public.lpl_ts(public.lpl_str(s13 -> 'values' -> 'offerLapseDate'));
  c.arrival_at        := public.lpl_ts(public.lpl_str(s30 -> 'values' -> 'arrivalDate'));
  c.hold_review_at    := public.lpl_ts(public.lpl_str(d -> 'hold' -> 'reviewDate'));

  c.retention_kind := case c.status when 'exited' then 'exited' when 'completed' then 'completed' when 'hold' then 'dormant' when 'deferred' then 'dormant' end;
  c.retention_anchor_at := case c.status
    when 'exited' then coalesce(public.lpl_ts(public.lpl_str(d -> 'exit' -> 'at')), c.data_updated_at)
    when 'completed' then coalesce(public.lpl_ts(public.lpl_str(s31 -> 'completedAt')), c.data_updated_at)
    when 'hold' then c.data_updated_at
    when 'deferred' then c.data_updated_at
  end;
  c.disposed   := coalesce(jsonb_typeof(d -> 'disposal'), 'null') <> 'null';
  c.legal_hold := coalesce(jsonb_typeof(d -> 'legalHold'), 'null') <> 'null';
  c.last_event_at := public.lpl_ts(public.lpl_str(d -> 'events' -> 0 -> 'at'));
  c.last_event_by := d -> 'events' -> 0 ->> 'by';

  c.destination := coalesce(
    public.lpl_str(s14 -> 'values' -> 'country'),
    case when jsonb_typeof(s6 -> 'values' -> 'countries') = 'array' and jsonb_array_length(s6 -> 'values' -> 'countries') > 0
      then case jsonb_typeof(s6 -> 'values' -> 'countries' -> 0) when 'string' then s6 -> 'values' -> 'countries' ->> 0 else (s6 -> 'values' -> 'countries' -> 0)::text end end,
    case when jsonb_typeof(s2 -> 'values' -> 'destinations') = 'array' and jsonb_array_length(s2 -> 'values' -> 'destinations') > 0
      then case jsonb_typeof(s2 -> 'values' -> 'destinations' -> 0) when 'string' then s2 -> 'values' -> 'destinations' ->> 0 else (s2 -> 'values' -> 'destinations' -> 0)::text end end,
    public.lpl_str(s1 -> 'values' -> 'preferredDestination'),
    'Undecided');
  c.channel := coalesce(public.lpl_str(s1 -> 'values' -> 'source'), 'Unknown');
  c.exit_code := case when c.status = 'exited' then coalesce(d -> 'exit' ->> 'code', 'Other') end;
  c.visa_granted := coalesce(s27 ->> 'status' = 'done' and jsonb_typeof(s27 -> 'values' -> 'outcome') = 'string' and s27 -> 'values' ->> 'outcome' = 'Granted', false);
  c.cis_sent_at := case when s4 ->> 'status' = 'done' then coalesce(public.lpl_ts(public.lpl_str(s4 -> 'values' -> 'cisSentDate')), public.lpl_ts(public.lpl_str(s4 -> 'completedAt'))) end;
  c.offer_decided_at := case when s14 ->> 'status' = 'done' then coalesce(public.lpl_ts(public.lpl_str(s14 -> 'values' -> 'acceptedDate')), public.lpl_ts(public.lpl_str(s14 -> 'completedAt'))) end;
  c.profile_started := coalesce(not c.disposed and jsonb_typeof(s2 -> 'values') = 'object' and exists (select 1 from jsonb_object_keys(s2 -> 'values')), false);
  c.consent_yes := coalesce(jsonb_typeof(s2 -> 'values' -> 'consent') = 'string' and s2 -> 'values' ->> 'consent' = 'Yes', false);
  c.transfers_total := jsonb_array_length(trs);
  c.transfers_unsafeguarded := (select count(*) from jsonb_array_elements(trs) e where e ->> 'safeguard' = 'None recorded');

  -- Exactly the conditions under which case_state starts each clock.
  c.has_clock := c.status = 'open' and (
       (c.cis_start_at is not null and c.done_mask & 8 = 0)
    or c.cis2_from is not null
    or (c.offer_lapse_at is not null and c.done_mask & 8192 = 0)
    or (c.arrival_at is not null and c.done_mask & 536870912 <> 0 and c.done_mask & 1073741824 = 0));
  c.needs_look := c.status = 'open' and (c.has_clock or c.gate_pending is not null or c.gate_returned is not null or c.docs_uploaded > 0 or c.profile_submitted);
  c.search_text := lower(concat_ws(' ', c.ref, c.student_name, c.student_email, c.destination));
end $$;

-- case_derive (v6.1) now also fills the summary.
create or replace function public.case_derive() returns trigger
  language plpgsql set search_path = public as $$
begin
  if new.data is null or jsonb_typeof(new.data) <> 'object' then
    raise exception 'A case must be a JSON object' using errcode = 'P0001';
  end if;
  if new.data ->> 'id' is distinct from new.id or new.data ->> 'ref' is distinct from new.ref then
    raise exception 'Case identity in the document does not match the record' using errcode = 'P0001';
  end if;
  new.counsellor_id   := nullif(new.data ->> 'counsellorId', '');
  new.student_user_id := nullif(new.data ->> 'studentUserId', '');
  new.status          := coalesce(nullif(new.data ->> 'status', ''), 'open');
  if new.status not in ('open', 'hold', 'deferred', 'exited', 'completed') then
    raise exception 'Unknown case status %', new.status using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    new.rev := 1;
  elsif public.is_system_caller() then
    if new.rev is not distinct from old.rev then new.rev := old.rev + 1; end if;
  elsif new.rev is distinct from old.rev + 1 then
    raise exception 'This case was changed by someone else while you were working on it. Your change was not saved; reload to see the latest version.'
      using errcode = 'PT409', hint = 'stale_revision';
  end if;

  new.updated_at := now();
  new.data := jsonb_set(new.data, '{rev}', to_jsonb(new.rev));
  new := public.case_summarize(new);
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- What the summary means now: clocks, attention, retention and severity under the configured
-- service levels. Mirrors evaluateCase() in src/lib/summary.ts. A set-based view (no per-row
-- function calls), evaluated under the caller's own row-level security.
--
-- Written as nested subqueries, not WITH, so the planner flattens it into the caller: a page
-- ordered by an indexed key reads its fifty rows from the index and evaluates only those.
-- (A WITH inside a view keeps the view opaque, and every page would evaluate every case.)
-- Service levels and "now" are uncorrelated sub-selects, evaluated once per statement.
-- ---------------------------------------------------------------------------

-- An integer from the organisation's configuration, else the fallback.
create or replace function public.org_number(path text[], fallback integer) returns integer
  language sql stable parallel safe set search_path = public as $$
  select coalesce((select (o.config #>> path)::numeric::integer from public.org_config o where o.id = 'org'), fallback)
$$;

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
    least(k.cis_days, k.cis2_days, k.offer_days, k.fu_days) as worst_days
  from (
    select c.*, v.cfg_offer_days, v.cfg_ret_warn, v.now_ts,
      case when c.status = 'open' and c.cis_start_at is not null and c.done_mask & 8 = 0
        then public.lpl_days_until(public.lpl_add_days(c.cis_start_at, v.cfg_cis_days), v.now_ts) end as cis_days,
      case when c.status = 'open' and c.cis2_from is not null
        then public.lpl_days_until(public.lpl_add_days(c.cis2_from, v.cfg_cis_days), v.now_ts) end as cis2_days,
      case when c.status = 'open' and c.offer_lapse_at is not null and c.done_mask & 8192 = 0
        then public.lpl_days_until(c.offer_lapse_at, v.now_ts) end as offer_days,
      case when c.status = 'open' and c.arrival_at is not null and c.done_mask & 536870912 <> 0 and c.done_mask & 1073741824 = 0
        then public.lpl_days_until(public.lpl_add_months(c.arrival_at, v.cfg_fu_months), v.now_ts) end as fu_days,
      case when c.retention_anchor_at is not null
        then public.lpl_add_months(c.retention_anchor_at, case c.retention_kind when 'exited' then v.cfg_ret_exited when 'completed' then v.cfg_ret_completed else v.cfg_ret_dormant end) end as retention_due_at,
      (c.status in ('hold', 'deferred') and c.hold_review_at is not null and public.lpl_days_until(c.hold_review_at, v.now_ts) < 0) as hold_review_due
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
        (select public.lpl_now())                                     as now_ts) v
  ) k
) s;
comment on view public.case_state is 'Cases with their clocks, attention and retention evaluated now (see src/lib/summary.ts evaluateCase). security_invoker: the caller''s row-level security applies.';
revoke all on public.case_state from anon;
grant select on public.case_state to authenticated;

-- ---------------------------------------------------------------------------
-- Change versions: a counter per topic, bumped once per writing statement. Polling reads four
-- integers instead of scanning every case the caller can see.
-- ---------------------------------------------------------------------------

create table if not exists public.change_log (
  topic   text primary key,
  version bigint not null default 0,
  at      timestamptz not null default now()
);
alter table public.change_log enable row level security;
drop policy if exists change_log_read on public.change_log;
create policy change_log_read on public.change_log for select to authenticated using (true);
revoke all on public.change_log from anon, authenticated;
grant select on public.change_log to authenticated;
insert into public.change_log (topic) values ('cases'), ('users'), ('config'), ('prompts') on conflict do nothing;

create or replace function public.bump_change_log() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  update public.change_log set version = version + 1, at = now() where topic = tg_argv[0];
  return null;
end $$;
drop trigger if exists cases_changed on public.cases;
create trigger cases_changed after insert or update or delete or truncate on public.cases for each statement execute function public.bump_change_log('cases');
drop trigger if exists app_users_changed on public.app_users;
create trigger app_users_changed after insert or update or delete or truncate on public.app_users for each statement execute function public.bump_change_log('users');
drop trigger if exists org_config_changed on public.org_config;
create trigger org_config_changed after insert or update or delete or truncate on public.org_config for each statement execute function public.bump_change_log('config');
drop trigger if exists prompts_changed on public.prompts;
create trigger prompts_changed after insert or update or delete or truncate on public.prompts for each statement execute function public.bump_change_log('prompts');

create or replace function public.change_versions() returns jsonb
  language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_object_agg(topic, version), '{}'::jsonb) from public.change_log
$$;

-- The v5 probe scanned every visible case on every poll; it now reads the counters.
create or replace function public.workspace_version() returns text
  language sql stable security invoker set search_path = public as $$
  select md5(coalesce(string_agg(topic || ':' || version, ',' order by topic), '')) from public.change_log
$$;

-- ---------------------------------------------------------------------------
-- Transfer register: one row per cross-border transfer, kept in step with the case document so
-- the register can be paged without opening every case.
-- ---------------------------------------------------------------------------

create table if not exists public.case_transfers (
  case_id            text not null references public.cases(id) on delete cascade,
  transfer_id        text not null,
  case_ref           text not null,
  at                 timestamptz,
  step               integer,
  recipient          text,
  recipient_type     text,
  recipient_approved boolean,
  country            text,
  data_categories    text[],
  lawful_basis       text,
  safeguard          text,
  note               text,
  by_name            text,
  primary key (case_id, transfer_id)
);
-- The register's order as a plain column: a COALESCE in a condition is not leakproof, so a
-- keyset seek written over one could not use the index under row-level security.
alter table public.case_transfers add column if not exists sort_at timestamptz generated always as (coalesce(at, '-infinity'::timestamptz)) stored;
drop index if exists public.case_transfers_at_idx;
create index if not exists case_transfers_register_idx on public.case_transfers (sort_at desc, case_id collate "C" desc, transfer_id collate "C" desc);
alter table public.case_transfers enable row level security;
drop policy if exists case_transfers_read on public.case_transfers;
-- Readable with dataprotection.read for a case the reader can see. A reader who sees every case
-- is answered without the per-row lookup (every transfer belongs to a case: the foreign key).
create policy case_transfers_read on public.case_transfers for select to authenticated using (
  (select public.app_can('dataprotection.read')) and (
    ((select public.app_can('case.read')) and (select public.current_case_scope()) = 'all')
    or exists (select 1 from public.cases c where c.id = case_transfers.case_id)));
revoke all on public.case_transfers from anon, authenticated;
grant select on public.case_transfers to authenticated;
comment on table public.case_transfers is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Cross-border transfer register, maintained from cases.data by trigger; read-only for every application role.';

create or replace function public.sync_case_transfers() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.data -> 'transfers' is not distinct from old.data -> 'transfers' and new.ref = old.ref then return null; end if;
  delete from public.case_transfers where case_id = new.id;
  insert into public.case_transfers (case_id, transfer_id, case_ref, at, step, recipient, recipient_type, recipient_approved, country, data_categories, lawful_basis, safeguard, note, by_name)
  select new.id, coalesce(e ->> 'id', i::text), new.ref, public.lpl_ts(public.lpl_str(e -> 'at')),
         case when jsonb_typeof(e -> 'step') = 'number' then (e ->> 'step')::numeric::integer end,
         e ->> 'recipient', e ->> 'recipientType',
         case when jsonb_typeof(e -> 'recipientApproved') = 'boolean' then (e ->> 'recipientApproved')::boolean end,
         e ->> 'country',
         case when jsonb_typeof(e -> 'dataCategories') = 'array' then array(select jsonb_array_elements_text(e -> 'dataCategories')) end,
         e ->> 'lawfulBasis', e ->> 'safeguard', e ->> 'note', e ->> 'byName'
    from jsonb_array_elements(case when jsonb_typeof(new.data -> 'transfers') = 'array' then new.data -> 'transfers' else '[]'::jsonb end) with ordinality t(e, i)
  on conflict (case_id, transfer_id) do nothing;
  return null;
end $$;
drop trigger if exists cases_transfers_sync on public.cases;
create trigger cases_transfers_sync after insert or update on public.cases for each row execute function public.sync_case_transfers();

-- ---------------------------------------------------------------------------
-- Gate register: one row per gate submission (financial verification, step 16; visa file,
-- step 19), kept in step with the case document, so the approvals queue, the decision
-- history and approval statistics are read without opening every case.
-- ---------------------------------------------------------------------------

create table if not exists public.case_gates (
  case_id       text not null references public.cases(id) on delete cascade,
  gate_id       text not null,
  case_ref      text not null,
  gate          smallint,
  round         integer,
  status        text,
  submitted_at  timestamptz,
  submitted_by  text,
  decided_at    timestamptz,
  decided_by    text,
  suggestions   text,
  addressed_at  timestamptz,
  primary key (case_id, gate_id)
);
alter table public.case_gates
  add column if not exists sort_decided   timestamptz generated always as (coalesce(decided_at, '-infinity'::timestamptz)) stored,
  add column if not exists sort_submitted timestamptz generated always as (coalesce(submitted_at, 'infinity'::timestamptz)) stored;
create index if not exists case_gates_decided_idx on public.case_gates (sort_decided desc, case_id collate "C" desc, gate_id collate "C" desc) where status in ('approved', 'returned');
create index if not exists case_gates_pending_idx on public.case_gates (sort_submitted, case_id collate "C", gate_id collate "C") where status = 'pending';
alter table public.case_gates enable row level security;
drop policy if exists case_gates_read on public.case_gates;
-- Readable exactly when the case is (the gates are part of the case document).
create policy case_gates_read on public.case_gates for select to authenticated using (
  ((select public.app_can('case.read')) and (select public.current_case_scope()) = 'all')
  or exists (select 1 from public.cases c where c.id = case_gates.case_id));
revoke all on public.case_gates from anon, authenticated;
grant select on public.case_gates to authenticated;
comment on table public.case_gates is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Gate submission register, maintained from cases.data by trigger; read-only for every application role.';

create or replace function public.sync_case_gates() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.data -> 'gates' is not distinct from old.data -> 'gates' and new.ref = old.ref then return null; end if;
  delete from public.case_gates where case_id = new.id;
  insert into public.case_gates (case_id, gate_id, case_ref, gate, round, status, submitted_at, submitted_by, decided_at, decided_by, suggestions, addressed_at)
  select new.id, coalesce(e ->> 'id', i::text), new.ref,
         case when jsonb_typeof(e -> 'gate') = 'number' then (e ->> 'gate')::numeric::smallint end,
         case when jsonb_typeof(e -> 'round') = 'number' then (e ->> 'round')::numeric::integer end,
         e ->> 'status', public.lpl_ts(public.lpl_str(e -> 'submittedAt')), e ->> 'submittedBy',
         public.lpl_ts(public.lpl_str(e -> 'decidedAt')), e ->> 'decidedBy', e ->> 'suggestions', public.lpl_ts(public.lpl_str(e -> 'addressedAt'))
    from jsonb_array_elements(case when jsonb_typeof(new.data -> 'gates') = 'array' then new.data -> 'gates' else '[]'::jsonb end) with ordinality t(e, i)
   where jsonb_typeof(e) = 'object'
  on conflict (case_id, gate_id) do nothing;
  return null;
end $$;
drop trigger if exists cases_gates_sync on public.cases;
create trigger cases_gates_sync after insert or update on public.cases for each row execute function public.sync_case_gates();

-- One page of the register. p.status: "pending" (oldest submission first) or "decided"
-- (default; newest decision first). p.gate: 16 | 19. Keyset: p.after = the last row's cursor.
drop function if exists public.gates_page(jsonb);
create function public.gates_page(p jsonb) returns table (
  case_id text, gate_id text, case_ref text, gate smallint, round integer, status text, submitted_at timestamptz, submitted_by text,
  decided_at timestamptz, decided_by text, suggestions text, addressed_at timestamptz, cursor jsonb)
  language plpgsql stable security invoker set search_path = public set enable_sort = off set jit = off as $$
declare
  pending boolean := p ->> 'status' = 'pending';
  w text[] := array[case when p ->> 'status' = 'pending' then $s$g.status = 'pending'$s$ else $s$g.status in ('approved', 'returned')$s$ end];
begin
  if jsonb_typeof(p -> 'gate') = 'number' then w := w || format('g.gate = %s', (p ->> 'gate')::smallint); end if;
  if jsonb_typeof(p -> 'after') = 'object' then
    w := w || format('(g.%s, g.case_id collate "C", g.gate_id collate "C") %s (%L::timestamptz, %L, %L)', case when pending then 'sort_submitted' else 'sort_decided' end,
      case when pending then '>' else '<' end, (p -> 'after' ->> 'at')::timestamptz, p -> 'after' ->> 'case', p -> 'after' ->> 'gate');
  end if;
  return query execute format($f$
    select g.case_id, g.gate_id, g.case_ref, g.gate, g.round, g.status, g.submitted_at, g.submitted_by, g.decided_at, g.decided_by, g.suggestions, g.addressed_at,
           jsonb_build_object('at', g.%1$s, 'case', g.case_id, 'gate', g.gate_id)
      from public.case_gates g
     where %2$s
     order by g.%1$s %3$s, g.case_id collate "C" %3$s, g.gate_id collate "C" %3$s
     limit %4$s$f$,
    case when pending then 'sort_submitted' else 'sort_decided' end, array_to_string(w, ' and '),
    case when pending then 'asc' else 'desc' end, least(greatest(coalesce((p ->> 'limit')::integer, 50), 1), 200));
end $$;

-- Approval statistics over the gates the caller may see.
create or replace function public.gate_stats() returns jsonb
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

-- The Go server's refresher (service role) keeps the shared dashboard warm, so no reader waits
-- for a large organisation's computation. Returns the milliseconds spent (0 when fresh).
create or replace function public.dashboard_refresh() returns integer
  language plpgsql volatile security definer set search_path = public as $$
declare
  c record; cv bigint; fv bigint; t0 timestamptz := clock_timestamp(); body jsonb; ms integer;
begin
  select version into cv from public.change_log where topic = 'cases';
  select version into fv from public.change_log where topic = 'config';
  select * into c from public.dashboard_cache where scope = 'all';
  if found and c.cases_v = cv and c.config_v = fv and c.computed_at > now() - interval '4 minutes' then return 0; end if;
  perform pg_advisory_xact_lock(hashtext('lpl.dashboard_shared'));
  body := public.dashboard_compute('all', null, now());
  ms := (extract(epoch from clock_timestamp() - t0) * 1000)::int;
  insert into public.dashboard_cache (scope, cases_v, config_v, computed_at, compute_ms, body)
  values ('all', cv, fv, now(), ms, body)
  on conflict (scope) do update set cases_v = excluded.cases_v, config_v = excluded.config_v, computed_at = excluded.computed_at,
    compute_ms = excluded.compute_ms, body = excluded.body;
  return greatest(ms, 1);
end $$;
revoke all on function public.dashboard_refresh() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.dashboard_refresh() to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes for the paged reads. Each list order has an index in exactly its sort expression
-- and direction, so a page is an index range read however deep the cursor.
-- ---------------------------------------------------------------------------

drop index if exists public.cases_updated_idx;
drop index if exists public.cases_created_idx;
drop index if exists public.cases_status_stage_idx;
drop index if exists public.cases_gate_pending_idx;
-- The case list: open cases first, most recently updated first.
-- Text tie-breaks compare in "C" (code point) order everywhere: the same in every database,
-- whatever its default collation, and the same as src/lib/queries.ts.
create index if not exists cases_list_idx on public.cases ((status = 'open') desc, list_at desc, id collate "C" desc);
-- The same order within one status, one counsellor, or one stage of the open pipeline.
create index if not exists cases_status_list_idx on public.cases (status, list_at desc, id collate "C" desc);
create index if not exists cases_counsellor_list_idx on public.cases (counsellor_id, (status = 'open') desc, list_at desc, id collate "C" desc);
create index if not exists cases_stage_list_idx on public.cases (stage, list_at desc, id collate "C" desc) where status = 'open';
-- Open cases that may need someone: the attention queue, clocks, documents and profiles.
create index if not exists cases_look_idx on public.cases (list_at desc, id collate "C" desc) where needs_look;
-- The Team Leader queue: pending gates, oldest submission first.
create index if not exists cases_gate_queue_idx on public.cases (gate_at, id collate "C") where status = 'open' and gate_pending is not null;
-- Hold reviews and retention anchors, for the attention and retention prefilters.
create index if not exists cases_hold_review_idx on public.cases (hold_review_at) where status in ('hold', 'deferred');
create index if not exists cases_retention_idx on public.cases (retention_kind, retention_anchor_at) where retention_kind is not null;

-- Substring search on reference, name, email and destination: a trigram index, wherever
-- pg_trgm lives (Supabase keeps extensions in schema "extensions").
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
drop index if exists public.cases_search_idx;
do $$
declare ns text;
begin
  select n.nspname into ns from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  execute format('create index if not exists cases_search_text_idx on public.cases using gin (search_text %I.gin_trgm_ops)', ns);
end $$;

-- ---------------------------------------------------------------------------
-- Paged reads. Each takes one JSON argument so filters can grow without changing the
-- function's signature, runs with the caller's rights (row-level security decides what comes
-- back), never returns the case document, and pages by keyset rather than offset so page
-- 1,000 costs what page 1 costs.
-- ---------------------------------------------------------------------------

-- Row-level security and the planner. A policy is a security barrier: a condition in the
-- query may run before it (and so drive an index) only if every function in it is leakproof.
-- Comparisons of columns with constants are; JSON accessors, LIKE and most functions are not.
-- So the paged reads never compare a column with an expression over the request: they
-- validate the request and write each value into the statement as a quoted literal (format
-- %L), which also keeps the statement free of injection.

-- What the current user may see, as a predicate: exactly the cases_read policy. The paged
-- reads repeat it beside the policy (the planner cannot use an index through the policy's OR
-- of scopes); case_search_ids, which reads the search index directly, relies on it.
create or replace function public.case_visibility_sql() returns text
  language sql stable set search_path = public as $$
  select case
    when not coalesce(public.app_can('case.read'), false) then 'false'
    when public.current_case_scope() = 'all' then 'true'
    when public.current_case_scope() = 'assigned' then format('counsellor_id = %L', public.current_app_user_id())
    when public.current_case_scope() = 'own' then format('student_user_id = %L', public.current_app_user_id())
    else 'false' end
$$;

-- The LIKE pattern for a substring search: lower case, wildcards escaped.
create or replace function public.lpl_like_pattern(q text) returns text
  language sql immutable parallel safe as $$
  select '%' || replace(replace(replace(lower(q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

-- Up to `cap` ids of cases the caller may see whose reference, name, email or destination
-- contains q, from the trigram index. LIKE is not leakproof, so under the policy the index
-- could never be used; this reads the index as the owner and applies the caller's visibility
-- itself. It returns ids only, and only ids the caller could read anyway.
create or replace function public.case_search_ids(q text, cap integer) returns setof text
  language plpgsql stable security definer set search_path = public set jit = off as $$
begin
  if coalesce(q, '') = '' then return; end if;
  return query execute format('select id from public.cases where %s and search_text like %L limit %s',
    public.case_visibility_sql(), public.lpl_like_pattern(q), least(greatest(coalesce(cap, 1), 1), 1001));
end $$;

-- The WHERE clause shared by cases_page and cases_count. Filters on what a case means now
-- (clocks, severity, retention) are paired with a superset condition on stored columns that an
-- index can answer, so the evaluation runs over the cases that could match, not every case.
--   q          substring of reference, name, email or destination
--   status     ["open", …]                     stage       1..9 (open cases)
--   counsellor id, or "none"                    ids         [case id, …]
--   attention  true: anything flagged (severity other than none)
--   severity   ["bad" | "warn" | "info" | "none", …]
--   clock      "breached" | "due" (breached or due soon)
--   gate       "pending" | "returned"          docs, profile, hold_review  true
--   retention  ["none" | "scheduled" | "due_soon" | "overdue" | "held" | "disposed", …]
drop function if exists public.case_filter_sql(jsonb);
drop function if exists public.case_filter(jsonb);
-- by_index: false when a selective search produced a short list of ids, which is best fetched
-- and sorted; otherwise the list orders are read from their index (see cases_page).
create function public.case_filter(p jsonb, out where_sql text, out by_index boolean)
  language plpgsql stable set search_path = public as $$
declare
  w text[] := array['true'];
  pre text[] := '{}';
  r text;
  ids text[];
  now_ts timestamptz := public.lpl_now();
  -- A retention due date on or before T: add_months() clamps to month end, which moves a date
  -- back by at most three days, so the anchor is at most T minus the period plus four days.
  ret_due constant text := '(not disposed and not legal_hold and ('
    || '(retention_kind = ''exited'' and retention_anchor_at <= %1$L::timestamptz)'
    || ' or (retention_kind = ''completed'' and retention_anchor_at <= %2$L::timestamptz)'
    || ' or (retention_kind = ''dormant'' and retention_anchor_at <= %3$L::timestamptz)))';
  ret_exited int := public.org_number('{retention,exitedMonths}', 24);
  ret_completed int := public.org_number('{retention,completedMonths}', 84);
  ret_dormant int := public.org_number('{retention,dormantMonths}', 18);
  t_overdue timestamptz := now_ts - interval '1 day';
  t_due timestamptz := now_ts + make_interval(days => greatest(public.org_number('{retention,warnDays}', 30), 0));
  overdue_sql text;
begin
  by_index := true;
  overdue_sql := format(ret_due, public.lpl_add_months(t_overdue, -ret_exited) + interval '4 days',
    public.lpl_add_months(t_overdue, -ret_completed) + interval '4 days', public.lpl_add_months(t_overdue, -ret_dormant) + interval '4 days');
  if coalesce(p ->> 'q', '') <> '' then
    -- A selective search (three or more characters, at most 1,000 matches) goes through the
    -- trigram index; a broad one is a filter on the list order, where matches are dense
    -- enough that a page fills after a short walk.
    if length(p ->> 'q') >= 3 then ids := array(select public.case_search_ids(p ->> 'q', 1001)); end if;
    if ids is not null and cardinality(ids) <= 1000 then
      w := w || format('id = any (%L::text[])', ids);
      by_index := false;
    else
      w := w || format('search_text like %L', public.lpl_like_pattern(p ->> 'q'));
    end if;
  end if;
  if jsonb_typeof(p -> 'status') = 'array' and jsonb_array_length(p -> 'status') = 1 then
    w := w || format('status = %L', p -> 'status' ->> 0);
  elsif jsonb_typeof(p -> 'status') = 'array' then
    w := w || format('status = any (%L::text[])', array(select jsonb_array_elements_text(p -> 'status')));
  end if;
  if jsonb_typeof(p -> 'stage') = 'number' then w := w || format('status = ''open'' and stage = %s', (p ->> 'stage')::smallint); end if;
  if p ->> 'counsellor' = 'none' then w := w || text 'counsellor_id is null';
  elsif coalesce(p ->> 'counsellor', '') <> '' then w := w || format('counsellor_id = %L', p ->> 'counsellor');
  end if;
  if jsonb_typeof(p -> 'ids') = 'array' then
    w := w || format('id = any (%L::text[])', array(select jsonb_array_elements_text(p -> 'ids')));
    by_index := false;
  end if;

  if (p ->> 'attention')::boolean is true then
    w := w || format('(needs_look or (status in (''hold'', ''deferred'') and hold_review_at <= %L::timestamptz) or %s)', t_overdue, overdue_sql)
           || text 'severity_rank < 3';
  end if;
  if jsonb_typeof(p -> 'severity') = 'array' then
    w := w || format('severity_rank = any (%L::int[])', array(select case x when 'bad' then 0 when 'warn' then 1 when 'info' then 2 else 3 end from jsonb_array_elements_text(p -> 'severity') x));
  end if;
  if p ->> 'clock' = 'breached' then w := w || text 'needs_look and has_clock' || text 'breached > 0';
  elsif p ->> 'clock' = 'due' then w := w || text 'needs_look and has_clock' || text '(breached > 0 or due_soon > 0)';
  end if;
  if p ->> 'gate' = 'pending' then w := w || text 'status = ''open'' and gate_pending is not null';
  elsif p ->> 'gate' = 'returned' then w := w || text 'needs_look and gate_returned is not null';
  end if;
  if (p ->> 'hold_review')::boolean is true then
    w := w || format('status in (''hold'', ''deferred'') and hold_review_at <= %L::timestamptz', t_overdue);
  end if;
  if (p ->> 'docs')::boolean is true then w := w || text 'needs_look and docs_uploaded > 0'; end if;
  if (p ->> 'profile')::boolean is true then w := w || text 'needs_look and profile_submitted'; end if;
  if jsonb_typeof(p -> 'retention') = 'array' then
    for r in select jsonb_array_elements_text(p -> 'retention') loop
      pre := pre || case r
        when 'disposed' then text 'disposed'
        when 'held'     then text '(legal_hold and not disposed)'
        when 'none'     then text '(retention_anchor_at is null and not disposed and not legal_hold)'
        when 'overdue'  then overdue_sql
        when 'due_soon' then format(ret_due, public.lpl_add_months(t_due, -ret_exited) + interval '4 days',
                              public.lpl_add_months(t_due, -ret_completed) + interval '4 days', public.lpl_add_months(t_due, -ret_dormant) + interval '4 days')
        else null end;  -- "scheduled" (or anything else) has no useful superset
    end loop;
    if pre <> '{}' and array_position(pre, null) is null then w := w || ('(' || array_to_string(pre, ' or ') || ')'); end if;
    w := w || format('retention = any (%L::text[])', array(select jsonb_array_elements_text(p -> 'retention')));
  end if;
  where_sql := array_to_string(w, ' and ');
end $$;

-- Sort keys, in order. Each is non-null (sentinels) and typed; id breaks ties. "updated" puts
-- open cases first unless the filter already fixes the status.
create or replace function public.case_sort_keys(p_sort text, p_one_status boolean) returns table (expr text, typ text, descending boolean)
  language sql immutable as $$
  select v.expr, v.typ, v.descending from (values
    ('updated',   1, '(status = ''open'')', 'boolean', true),
    ('updated',   2, 'list_at', 'timestamptz', true),
    ('gate',      1, 'gate_at', 'timestamptz', false),
    ('severity',  1, 'severity_rank', 'integer', false),
    ('severity',  2, 'list_at', 'timestamptz', true),
    ('urgency',   1, 'coalesce(worst_days, 2147483647)', 'integer', false),
    ('retention', 1, 'coalesce(retention_due_at, ''infinity''::timestamptz)', 'timestamptz', false)
  ) v(sort, pos, expr, typ, descending)
  where v.sort = coalesce(nullif(p_sort, ''), 'updated')
    and not (p_one_status and v.expr = '(status = ''open'')')
  order by pos
$$;

-- One page of cases, as summaries. p: the filters above, plus
--   sort   "updated" (default) | "gate" | "severity" | "urgency" | "retention"
--   dir    "asc" | "desc": reverses the order
--   limit  1..200 (default 50)          after  the cursor of the last row of the previous page
--   now    pins "now" (tests)
drop function if exists public.cases_page(jsonb);
drop function if exists public.case_sort_keys(text);
create function public.cases_page(p jsonb) returns table (
  id text, ref text, status text, counsellor_id text, student_user_id text, student_name text, student_email text,
  created_at timestamptz, updated_at timestamptz, current_step smallint, stage smallint,
  progress_done smallint, progress_applicable smallint, progress_pct smallint,
  gate_pending smallint, gate_pending_at timestamptz, gate_pending_round integer, gate_returned smallint,
  docs_uploaded integer, docs_accepted integer, docs_rejected integer, profile_submitted boolean,
  cis_start_at timestamptz, cis2_from timestamptz, offer_lapse_at timestamptz, arrival_at timestamptz, hold_review_at timestamptz,
  retention_anchor_at timestamptz, retention_kind text, disposed boolean, legal_hold boolean,
  last_event_at timestamptz, last_event_by text, destination text, channel text, exit_code text, done_mask integer, visa_granted boolean,
  cis_sent_at timestamptz, offer_decided_at timestamptz, profile_started boolean, consent_yes boolean,
  transfers_total integer, transfers_unsafeguarded integer,
  breached integer, due_soon integer, severity_rank integer, retention text, retention_due_at timestamptz, worst_days integer, cursor jsonb)
  -- JIT compiles for the planner's worst case; a fifty-row page pays ~100 ms for nothing.
  language plpgsql stable security invoker set search_path = public set jit = off as $$
declare
  k record; keys text[] := '{}'; types text[] := '{}'; descs boolean[] := '{}';
  sort text := coalesce(nullif(p ->> 'sort', ''), 'updated');
  flip boolean := coalesce(p ->> 'dir', '') = case when sort = 'updated' then 'asc' else 'desc' end;
  one_status boolean := coalesce(jsonb_typeof(p -> 'status') = 'array' and jsonb_array_length(p -> 'status') = 1, false) or coalesce(jsonb_typeof(p -> 'stage') = 'number', false);
  lim integer := least(greatest(coalesce((p ->> 'limit')::integer, 50), 1), 200);
  after jsonb := p -> 'after';
  uniform boolean; id_desc boolean; after_id text;
  ord text[] := '{}'; seek text := ''; eqs text := ''; i integer; cur text[] := '{}'; lhs text[] := '{}'; rhs text[] := '{}';
  -- The list orders ("updated", "gate") are index orders. The policy's OR of scopes makes the
  -- planner think almost no row is visible, and so prefer to collect and sort; for these
  -- orders it must walk the index instead, so sorting is disabled for this one statement. A
  -- selective search hands over a short list of ids, which is best fetched and sorted.
  f record;
  prior_sort text := current_setting('enable_sort');
begin
  if coalesce(p ->> 'now', '') <> '' then perform set_config('lpl.now', (p ->> 'now')::timestamptz::text, true); end if;
  for k in select * from public.case_sort_keys(sort, one_status) loop
    keys := keys || k.expr; types := types || k.typ; descs := descs || (k.descending <> flip);
  end loop;
  if keys = '{}' then raise exception 'Unknown sort %', sort using errcode = '22023'; end if;
  -- When every key runs one way, id runs that way too and the seek is one row comparison (an
  -- index range); otherwise id ascends and the seek is expanded key by key.
  uniform := (select bool_and(d) = bool_or(d) from unnest(descs) d);
  id_desc := uniform and descs[1];
  for i in 1 .. array_length(keys, 1) loop
    ord := ord || (keys[i] || case when descs[i] then ' desc' else ' asc' end);
    cur := cur || format('to_jsonb(%s)', keys[i]);
  end loop;
  ord := ord || case when id_desc then 'id collate "C" desc' else 'id collate "C" asc' end;

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
      seek := format(' and (%s, id collate "C") %s (%s, %L)', array_to_string(lhs, ', '), case when id_desc then '<' else '>' end, array_to_string(rhs, ', '), after_id);
    else
      for i in 1 .. array_length(keys, 1) loop
        seek := seek || format('%s(%s%s %s %s)', case when i > 1 then ' or ' else '' end, eqs, lhs[i], case when descs[i] then '<' else '>' end, rhs[i]);
        eqs := eqs || format('%s = %s and ', lhs[i], rhs[i]);
      end loop;
      seek := format(' and %s %s %s and (%s or (%s id collate "C" > %L))', lhs[1], case when descs[1] then '<=' else '>=' end, rhs[1], seek, eqs, after_id);
    end if;
  end if;

  f := public.case_filter(p);
  if sort in ('updated', 'gate') and f.by_index then perform set_config('enable_sort', 'off', true); end if;
  return query execute format($f$
    select id, ref, status, counsellor_id, student_user_id, student_name, student_email, created_at, data_updated_at, current_step, stage,
           progress_done, progress_applicable, progress_pct, gate_pending, gate_pending_at, gate_pending_round, gate_returned,
           docs_uploaded, docs_accepted, docs_rejected, profile_submitted, cis_start_at, cis2_from, offer_lapse_at, arrival_at, hold_review_at,
           retention_anchor_at, retention_kind, disposed, legal_hold, last_event_at, last_event_by, destination, channel, exit_code, done_mask, visa_granted,
           cis_sent_at, offer_decided_at, profile_started, consent_yes, transfers_total, transfers_unsafeguarded,
           breached, due_soon, severity_rank, retention, retention_due_at, worst_days,
           jsonb_build_object('k', jsonb_build_array(%s), 'id', id)
      from public.case_state
     where %s and %s%s
     order by %s
     limit %s$f$,
    array_to_string(cur, ', '), public.case_visibility_sql(), f.where_sql, seek, array_to_string(ord, ', '), lim);
  perform set_config('enable_sort', prior_sort, true);
end $$;

-- How many cases match, counted up to p.cap (default 10,000; at most 100,000) so a count
-- never costs more than a bounded scan. A result equal to the cap means "at least".
create or replace function public.cases_count(p jsonb) returns integer
  language plpgsql stable security invoker set search_path = public set jit = off as $$
declare n integer;
begin
  if coalesce(p ->> 'now', '') <> '' then perform set_config('lpl.now', (p ->> 'now')::timestamptz::text, true); end if;
  execute format('select count(*)::int from (select 1 from public.case_state where %s and %s limit %s) x',
    public.case_visibility_sql(), (public.case_filter(p)).where_sql, least(greatest(coalesce((p ->> 'cap')::integer, 10000), 1), 100000)) into n;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- The dashboard: the SQL twin of dashboardOf() in src/lib/summary.ts.
--
-- dashboard_compute aggregates the cases the calling role may see (row-level security applies:
-- it is security invoker, and any caller gets at most their own cases' figures). Every role
-- with the "all" case scope sees the same cases, so for them dashboard_summary serves one
-- shared, cached answer: recomputed when a case or the configuration changed, or after five
-- minutes (clocks move with time); and, where a computation is costly (a large organisation),
-- reused for up to a minute even across changes so that busy periods do not recompute on
-- every poll. The answer carries its computedAt.
-- ---------------------------------------------------------------------------

drop function if exists public.dashboard_compute(text, text, timestamptz);
create function public.dashboard_compute(p_scope text, p_me text, p_now timestamptz) returns jsonb
  language plpgsql stable security invoker set search_path = public set work_mem = '64MB' set jit = off as $$
declare
  cis_days int := public.org_number('{sla,cisDays}', 7);
  fu_months int := public.org_number('{sla,followUpMonths}', 3);
  out jsonb;
begin
  perform set_config('lpl.now', p_now::text, true);
  execute format($f$
  with s as materialized (
    select id, status, counsellor_id, stage, created_at, arrival_at, done_mask, visa_granted, destination, channel, exit_code,
           cis_start_at, cis_sent_at, offer_lapse_at, offer_decided_at, docs_uploaded, docs_accepted, docs_rejected,
           profile_started, consent_yes, transfers_total, transfers_unsafeguarded,
           breached, due_soon, severity_rank, retention, docs_to_review, gate_pending_now, gate_returned_now, profile_submitted_now,
           list_at, worst_days
      from public.case_state
     where %1$s
  ),
  months as (
    select to_char(date_trunc('month', %2$L::timestamptz at time zone 'Asia/Colombo') - make_interval(months => g), 'YYYY-MM') as month, g
      from generate_series(23, 0, -1) g
  ),
  totals as (
    select
      count(*) as total,
      count(*) filter (where status = 'open') as open_total,
      count(*) filter (where status = 'open' and counsellor_id is null) as unassigned,
      coalesce(sum(breached) filter (where status = 'open'), 0) as breached,
      coalesce(sum(due_soon) filter (where status = 'open'), 0) as due_soon,
      count(*) filter (where gate_pending_now is not null) as gates_pending,
      count(*) filter (where gate_returned_now is not null) as gates_returned,
      coalesce(sum(docs_to_review), 0) as docs_to_review,
      count(*) filter (where profile_submitted_now) as profile_submitted,
      count(*) filter (where created_at > %2$L::timestamptz - interval '720 hours') as last30,
      count(*) filter (where created_at <= %2$L::timestamptz - interval '720 hours' and created_at > %2$L::timestamptz - interval '1440 hours') as prev30,
      count(*) filter (where done_mask & 4 <> 0) as f3, count(*) filter (where done_mask & 1024 <> 0) as f11,
      count(*) filter (where done_mask & 4096 <> 0) as f13, count(*) filter (where done_mask & 131072 <> 0) as f18,
      count(*) filter (where done_mask & 4194304 <> 0) as f23, count(*) filter (where visa_granted) as granted,
      count(*) filter (where done_mask & 536870912 <> 0) as arrived,
      count(*) filter (where cis_start_at is not null and done_mask & 8 <> 0) as cis_total,
      count(*) filter (where cis_start_at is not null and done_mask & 8 <> 0 and cis_sent_at is not null
                         and cis_sent_at <= public.lpl_add_days(cis_start_at, %3$s) + interval '24 hours') as cis_met,
      count(*) filter (where offer_lapse_at is not null and done_mask & 8192 <> 0) as offer_total,
      count(*) filter (where offer_lapse_at is not null and done_mask & 8192 <> 0 and offer_decided_at is not null and offer_decided_at <= offer_lapse_at + interval '24 hours') as offer_met,
      count(*) filter (where arrival_at is not null and done_mask & 536870912 <> 0 and (public.lpl_add_months(arrival_at, %4$s) < %2$L::timestamptz or done_mask & 1073741824 <> 0)) as fu_total,
      count(*) filter (where arrival_at is not null and done_mask & 536870912 <> 0 and done_mask & 1073741824 <> 0) as fu_met,
      coalesce(sum(docs_uploaded), 0) as d_up, coalesce(sum(docs_accepted), 0) as d_acc, coalesce(sum(docs_rejected), 0) as d_rej,
      -- Math.round semantics: floor(x + 0.5).
      sum(floor(extract(epoch from (arrival_at - created_at)) / 86400 + 0.5)) filter (where arrival_at is not null and floor(extract(epoch from (arrival_at - created_at)) / 86400 + 0.5) >= 0) as lead_sum,
      count(*) filter (where arrival_at is not null and floor(extract(epoch from (arrival_at - created_at)) / 86400 + 0.5) >= 0) as lead_n,
      count(*) filter (where profile_started) as consent_total,
      count(*) filter (where profile_started and consent_yes) as consent_covered,
      coalesce(sum(transfers_total), 0) as transfers, coalesce(sum(transfers_unsafeguarded), 0) as unsafeguarded,
      count(*) filter (where status = 'hold') as st_hold, count(*) filter (where status = 'deferred') as st_deferred,
      count(*) filter (where status = 'exited') as st_exited, count(*) filter (where status = 'completed') as st_completed,
      count(*) filter (where retention = 'none') as r_none, count(*) filter (where retention = 'scheduled') as r_scheduled,
      count(*) filter (where retention = 'due_soon') as r_due_soon, count(*) filter (where retention = 'overdue') as r_overdue,
      count(*) filter (where retention = 'held') as r_held, count(*) filter (where retention = 'disposed') as r_disposed
    from s
  )
  select jsonb_build_object(
    'total', t.total,
    'status', jsonb_build_object('open', t.open_total, 'hold', t.st_hold, 'deferred', t.st_deferred, 'exited', t.st_exited, 'completed', t.st_completed),
    'open', jsonb_build_object('total', t.open_total, 'unassigned', t.unassigned, 'breached', t.breached, 'dueSoon', t.due_soon,
              'gatesPending', t.gates_pending, 'gatesReturned', t.gates_returned, 'docsToReview', t.docs_to_review, 'profileSubmitted', t.profile_submitted),
    'retention', jsonb_build_object('none', t.r_none, 'scheduled', t.r_scheduled, 'due_soon', t.r_due_soon, 'overdue', t.r_overdue, 'held', t.r_held, 'disposed', t.r_disposed),
    'byStage', (select jsonb_agg(jsonb_build_object('stage', g, 'open', coalesce(x.open, 0), 'bad', coalesce(x.bad, 0)) order by g)
                  from generate_series(1, 9) g
                  left join (select stage, count(*) as open, count(*) filter (where severity_rank = 0) as bad from s where status = 'open' group by stage) x on x.stage = g),
    'counsellors', coalesce((select jsonb_agg(jsonb_build_object('id', counsellor_id, 'open', n, 'gates', gates, 'docs', docs, 'bad', bad) order by n desc, counsellor_id collate "C")
                  from (select counsellor_id, count(*) as n, count(*) filter (where gate_pending_now is not null) as gates, coalesce(sum(docs_to_review), 0) as docs,
                               count(*) filter (where breached > 0 or gate_returned_now is not null) as bad
                          from s where status = 'open' and counsellor_id is not null group by counsellor_id) x), '[]'::jsonb),
    'enquiries', jsonb_build_object('last30', t.last30, 'prev30', t.prev30),
    'funnel', jsonb_build_array(
      jsonb_build_object('label', 'Enquiry', 'n', t.total), jsonb_build_object('label', 'Qualified', 'n', t.f3), jsonb_build_object('label', 'Application', 'n', t.f11),
      jsonb_build_object('label', 'Offer', 'n', t.f13), jsonb_build_object('label', 'Acceptance', 'n', t.f18), jsonb_build_object('label', 'Visa lodged', 'n', t.f23),
      jsonb_build_object('label', 'Visa granted', 'n', t.granted), jsonb_build_object('label', 'Arrived', 'n', t.arrived)),
    'volume', (select jsonb_agg(jsonb_build_object('month', m.month, 'enquiries', coalesce(e.n, 0), 'arrivals', coalesce(a.n, 0)) order by m.g desc)
                 from months m
                 left join (select to_char(created_at at time zone 'Asia/Colombo', 'YYYY-MM') as mo, count(*) as n from s
                             where created_at >= %2$L::timestamptz - interval '25 months' and created_at < %2$L::timestamptz + interval '1 month' group by 1) e on e.mo = m.month
                 left join (select to_char(arrival_at at time zone 'Asia/Colombo', 'YYYY-MM') as mo, count(*) as n from s
                             where arrival_at >= %2$L::timestamptz - interval '25 months' and arrival_at < %2$L::timestamptz + interval '1 month' group by 1) a on a.mo = m.month),
    'sla', jsonb_build_array(
      jsonb_build_object('id', 'cis', 'label', 'CIS within %3$s days', 'met', t.cis_met, 'total', t.cis_total),
      jsonb_build_object('id', 'offer', 'label', 'Offer decided before lapse', 'met', t.offer_met, 'total', t.offer_total),
      jsonb_build_object('id', 'followup', 'label', 'Follow-up at %4$s months', 'met', t.fu_met, 'total', t.fu_total)),
    'destinations', coalesce((select jsonb_agg(jsonb_build_object('label', destination, 'n', n) order by n desc, destination collate "C")
                    from (select destination, count(*) as n from s where status <> 'exited' group by destination order by n desc, destination collate "C" limit 8) x), '[]'::jsonb),
    'channels', coalesce((select jsonb_agg(jsonb_build_object('label', channel, 'n', n) order by n desc, channel collate "C")
                    from (select channel, count(*) as n from s group by channel) x), '[]'::jsonb),
    'exits', coalesce((select jsonb_agg(jsonb_build_object('label', exit_code, 'n', n) order by n desc, exit_code collate "C")
                    from (select exit_code, count(*) as n from s where exit_code is not null group by exit_code) x), '[]'::jsonb),
    'docs', jsonb_build_object('uploaded', t.d_up, 'accepted', t.d_acc, 'rejected', t.d_rej,
              'reworkPct', case when t.d_acc + t.d_rej > 0 then floor(t.d_rej::numeric * 100 / (t.d_acc + t.d_rej) + 0.5)::int else 0 end),
    'leadDays', case when t.lead_n > 0 then floor(t.lead_sum / t.lead_n + 0.5)::int end,
    'compliance', jsonb_build_object('consentCovered', t.consent_covered, 'consentTotal', t.consent_total,
              'consentPct', case when t.consent_total > 0 then floor(t.consent_covered::numeric * 100 / t.consent_total + 0.5)::int else 100 end,
              'transfers', t.transfers, 'unsafeguarded', t.unsafeguarded),
    -- The heads of the two queues a home screen shows, so it needs no scan of its own: what
    -- needs someone (worst first, then most recently updated) and breached clocks (most
    -- overdue first). Ids only; the page reads their summaries by id.
    'attention', coalesce((select jsonb_agg(id order by severity_rank, list_at desc, id collate "C")
                    from (select id, severity_rank, list_at from s where severity_rank < 3 order by severity_rank, list_at desc, id collate "C" limit 25) x), '[]'::jsonb),
    'urgent', coalesce((select jsonb_agg(id order by worst_days, id collate "C")
                    from (select id, worst_days from s where status = 'open' and breached > 0 order by worst_days, id collate "C" limit 25) x), '[]'::jsonb)
  ) from totals t$f$,
    case p_scope when 'all' then 'true'
                 when 'assigned' then format('counsellor_id = %L', p_me)
                 when 'own' then format('student_user_id = %L', p_me)
                 else 'false' end,
    p_now, cis_days, fu_months) into out;
  return out;
end $$;

-- The shared answer for the "all" scope. Only the owner reads or writes it.
create table if not exists public.dashboard_cache (
  scope        text primary key,
  cases_v      bigint not null,
  config_v     bigint not null,
  computed_at  timestamptz not null,
  compute_ms   integer not null,
  body         jsonb not null
);
alter table public.dashboard_cache enable row level security;
revoke all on public.dashboard_cache from public, anon, authenticated;
comment on table public.dashboard_cache is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. The shared dashboard for roles that see every case; written only by dashboard_shared().';

create or replace function public.dashboard_shared() returns jsonb
  language plpgsql volatile security definer set search_path = public as $$
declare
  c record; cv bigint; fv bigint; t0 timestamptz; body jsonb;
begin
  -- Only for callers who could read every case themselves: what is computed here without
  -- row-level security is then exactly what the policy would have shown them.
  if not (coalesce(public.app_can('case.read'), false) and public.current_case_scope() = 'all') then
    raise exception 'The shared dashboard is for roles that see every case' using errcode = '42501';
  end if;
  select version into cv from public.change_log where topic = 'cases';
  select version into fv from public.change_log where topic = 'config';
  select * into c from public.dashboard_cache where scope = 'all';
  if found and ((c.cases_v = cv and c.config_v = fv and c.computed_at > now() - interval '5 minutes')
                or (c.compute_ms > 250 and c.computed_at > now() - interval '1 minute')) then
    return c.body || jsonb_build_object('computedAt', c.computed_at);
  end if;
  -- One computation at a time: a caller that finds one running waits, then reuses its answer.
  perform pg_advisory_xact_lock(hashtext('lpl.dashboard_shared'));
  select * into c from public.dashboard_cache where scope = 'all';
  if found and c.cases_v = cv and c.config_v = fv and c.computed_at > clock_timestamp() - interval '5 seconds' then
    return c.body || jsonb_build_object('computedAt', c.computed_at);
  end if;
  t0 := clock_timestamp();
  body := public.dashboard_compute('all', null, now());
  insert into public.dashboard_cache (scope, cases_v, config_v, computed_at, compute_ms, body)
  values ('all', cv, fv, now(), (extract(epoch from clock_timestamp() - t0) * 1000)::int, body)
  on conflict (scope) do update set cases_v = excluded.cases_v, config_v = excluded.config_v, computed_at = excluded.computed_at,
    compute_ms = excluded.compute_ms, body = excluded.body;
  return body || jsonb_build_object('computedAt', now());
end $$;

-- The dashboard for the caller. p.now pins "now" (tests), which bypasses the shared answer.
drop function if exists public.dashboard_summary(jsonb);
create function public.dashboard_summary(p jsonb) returns jsonb
  language plpgsql volatile security invoker set search_path = public as $$
begin
  if coalesce(p ->> 'now', '') = '' and coalesce(public.app_can('case.read'), false) and public.current_case_scope() = 'all' then
    return public.dashboard_shared();
  end if;
  return public.dashboard_compute(coalesce(public.current_case_scope(), 'none'), public.current_app_user_id(),
    coalesce(nullif(p ->> 'now', '')::timestamptz, now())) || jsonb_build_object('computedAt', now());
end $$;

-- One page of the transfer register, newest first. Filters: q (recipient, country, case
-- reference), safeguard ("none" = no safeguard recorded), type. Keyset by (at, case, transfer).
drop function if exists public.transfers_page(jsonb);
create function public.transfers_page(p jsonb) returns table (
  case_id text, transfer_id text, case_ref text, at timestamptz, step integer, recipient text, recipient_type text, recipient_approved boolean,
  country text, data_categories text[], lawful_basis text, safeguard text, note text, by_name text, cursor jsonb)
  language plpgsql stable security invoker set search_path = public
  -- An index order, read fifty rows at a time: nothing is sorted (see cases_page).
  set enable_sort = off set jit = off as $$
declare w text[] := array['true'];
begin
  if coalesce(p ->> 'q', '') <> '' then
    w := w || format($s$lower(coalesce(t.recipient, '') || ' ' || coalesce(t.country, '') || ' ' || t.case_ref) like %L$s$, public.lpl_like_pattern(p ->> 'q'));
  end if;
  if p ->> 'safeguard' = 'none' then w := w || text $s$t.safeguard = 'None recorded'$s$; end if;
  if coalesce(p ->> 'type', '') <> '' then w := w || format('t.recipient_type = %L', p ->> 'type'); end if;
  if jsonb_typeof(p -> 'after') = 'object' then
    w := w || format('(t.sort_at, t.case_id collate "C", t.transfer_id collate "C") < (%L::timestamptz, %L, %L)',
      (p -> 'after' ->> 'at')::timestamptz, p -> 'after' ->> 'case', p -> 'after' ->> 'transfer');
  end if;
  return query execute format($f$
    select t.case_id, t.transfer_id, t.case_ref, t.at, t.step, t.recipient, t.recipient_type, t.recipient_approved, t.country, t.data_categories,
           t.lawful_basis, t.safeguard, t.note, t.by_name,
           jsonb_build_object('at', t.sort_at, 'case', t.case_id, 'transfer', t.transfer_id)
      from public.case_transfers t
     where %s
     order by t.sort_at desc, t.case_id collate "C" desc, t.transfer_id collate "C" desc
     limit %s$f$, array_to_string(w, ' and '), least(greatest(coalesce((p ->> 'limit')::integer, 50), 1), 200));
end $$;

-- One page of profiles. Filters: role ("staff" = every role but student), q (name or email),
-- active. Keyset by (name_key, id). Row-level security on app_users decides what is seen.
alter table public.app_users add column if not exists name_key text generated always as (lower(name)) stored;
drop index if exists public.app_users_role_name_idx;
drop index if exists public.app_users_name_idx;
create index if not exists app_users_role_name_idx on public.app_users (role, name_key collate "C", id collate "C");
create index if not exists app_users_name_idx on public.app_users (name_key collate "C", id collate "C");
do $$
declare ns text;
begin
  select n.nspname into ns from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  drop index if exists public.app_users_search_idx;
  execute format('create index if not exists app_users_search_text_idx on public.app_users using gin ((lower(name || '' '' || email)) %I.gin_trgm_ops)', ns);
end $$;

-- Up to `cap` ids of profiles whose name or email contains q, from the trigram index, for
-- callers who may read every profile (staff.read); nobody else is answered. See
-- case_search_ids for why this reads the index as the owner.
create or replace function public.user_search_ids(q text, cap integer) returns setof text
  language plpgsql stable security definer set search_path = public set jit = off as $$
begin
  if coalesce(q, '') = '' or not coalesce(public.app_can('staff.read'), false) then return; end if;
  return query execute format('select id from public.app_users where lower(name || '' '' || email) like %L limit %s',
    public.lpl_like_pattern(q), least(greatest(coalesce(cap, 1), 1), 1001));
end $$;

drop function if exists public.users_page(jsonb);
create function public.users_page(p jsonb) returns table (
  id text, email text, name text, phone text, branch text, role text, active boolean, created_at timestamptz, created_by text,
  last_sign_in_at timestamptz, has_sign_in boolean, cursor jsonb)
  language plpgsql stable security invoker set search_path = public set jit = off as $$
declare
  w text[] := array['true'];
  ids text[];
  prior_sort text := current_setting('enable_sort');
begin
  if p ->> 'role' = 'staff' then w := w || text $s$u.role <> 'student'$s$;
  elsif coalesce(p ->> 'role', '') <> '' then w := w || format('u.role = %L', p ->> 'role');
  end if;
  if coalesce(p ->> 'q', '') <> '' then
    if length(p ->> 'q') >= 3 and coalesce(public.app_can('staff.read'), false) then ids := array(select public.user_search_ids(p ->> 'q', 1001)); end if;
    if ids is not null and cardinality(ids) <= 1000 then
      w := w || format('u.id = any (%L::text[])', ids);
    else
      w := w || format($s$lower(u.name || ' ' || u.email) like %L$s$, public.lpl_like_pattern(p ->> 'q'));
    end if;
  end if;
  if jsonb_typeof(p -> 'active') = 'boolean' then w := w || format('u.active = %L', (p ->> 'active')::boolean); end if;
  if jsonb_typeof(p -> 'after') = 'object' then
    w := w || format('(u.name_key collate "C", u.id collate "C") > (%L, %L)', p -> 'after' ->> 'name', p -> 'after' ->> 'id');
  end if;
  -- Name order is an index order unless a search handed over a list of ids (see cases_page).
  if ids is null then perform set_config('enable_sort', 'off', true); end if;
  return query execute format($f$
    select u.id, u.email, u.name, u.phone, u.branch, u.role, u.active, u.created_at, u.created_by, u.last_sign_in_at, u.auth_id is not null,
           jsonb_build_object('name', u.name_key, 'id', u.id)
      from public.app_users u
     where %s
     order by u.name_key collate "C", u.id collate "C"
     limit %s$f$, array_to_string(w, ' and '), least(greatest(coalesce((p ->> 'limit')::integer, 50), 1), 200));
  perform set_config('enable_sort', prior_sort, true);
end $$;

-- The reads are for signed-in users. The helpers run with the caller's rights (case_summarize
-- also fires inside case_derive for the system roles), so they stay executable by everyone;
-- none of them is on the HTTP contract.
revoke all on function public.cases_page(jsonb), public.cases_count(jsonb), public.dashboard_summary(jsonb), public.transfers_page(jsonb),
  public.users_page(jsonb), public.change_versions(), public.dashboard_compute(text, text, timestamptz), public.dashboard_shared(),
  public.case_search_ids(text, integer), public.user_search_ids(text, integer), public.gates_page(jsonb), public.gate_stats() from public, anon;
grant execute on function public.cases_page(jsonb), public.cases_count(jsonb), public.dashboard_summary(jsonb), public.transfers_page(jsonb),
  public.users_page(jsonb), public.change_versions(), public.dashboard_compute(text, text, timestamptz), public.dashboard_shared(),
  public.case_search_ids(text, integer), public.user_search_ids(text, integer), public.gates_page(jsonb), public.gate_stats() to authenticated;
grant execute on function public.case_summarize(public.cases), public.case_filter(jsonb), public.case_sort_keys(text, boolean),
  public.case_visibility_sql(), public.org_number(text[], integer), public.lpl_like_pattern(text),
  public.lpl_str(jsonb), public.lpl_ts(text), public.lpl_add_days(timestamptz, integer), public.lpl_add_months(timestamptz, integer),
  public.lpl_days_until(timestamptz, timestamptz), public.lpl_now() to public;

-- ---------------------------------------------------------------------------
-- Backfill, once: derive the summary for every existing case and index its transfers.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.schema_migrations where version = '20260925000300') then return; end if;
  -- As the migration's own role: the revision moves (open browser copies reload), guards stand aside.
  update public.cases set data = data;
  insert into public.case_transfers (case_id, transfer_id, case_ref, at, step, recipient, recipient_type, recipient_approved, country, data_categories, lawful_basis, safeguard, note, by_name)
  select c.id, coalesce(e ->> 'id', i::text), c.ref, public.lpl_ts(public.lpl_str(e -> 'at')),
         case when jsonb_typeof(e -> 'step') = 'number' then (e ->> 'step')::numeric::integer end,
         e ->> 'recipient', e ->> 'recipientType',
         case when jsonb_typeof(e -> 'recipientApproved') = 'boolean' then (e ->> 'recipientApproved')::boolean end,
         e ->> 'country',
         case when jsonb_typeof(e -> 'dataCategories') = 'array' then array(select jsonb_array_elements_text(e -> 'dataCategories')) end,
         e ->> 'lawfulBasis', e ->> 'safeguard', e ->> 'note', e ->> 'byName'
    from public.cases c, jsonb_array_elements(case when jsonb_typeof(c.data -> 'transfers') = 'array' then c.data -> 'transfers' else '[]'::jsonb end) with ordinality t(e, i)
  on conflict (case_id, transfer_id) do nothing;
  insert into public.case_gates (case_id, gate_id, case_ref, gate, round, status, submitted_at, submitted_by, decided_at, decided_by, suggestions, addressed_at)
  select c.id, coalesce(e ->> 'id', i::text), c.ref,
         case when jsonb_typeof(e -> 'gate') = 'number' then (e ->> 'gate')::numeric::smallint end,
         case when jsonb_typeof(e -> 'round') = 'number' then (e ->> 'round')::numeric::integer end,
         e ->> 'status', public.lpl_ts(public.lpl_str(e -> 'submittedAt')), e ->> 'submittedBy',
         public.lpl_ts(public.lpl_str(e -> 'decidedAt')), e ->> 'decidedBy', e ->> 'suggestions', public.lpl_ts(public.lpl_str(e -> 'addressedAt'))
    from public.cases c, jsonb_array_elements(case when jsonb_typeof(c.data -> 'gates') = 'array' then c.data -> 'gates' else '[]'::jsonb end) with ordinality t(e, i)
   where jsonb_typeof(e) = 'object'
  on conflict (case_id, gate_id) do nothing;
end $$;

insert into public.schema_migrations (version, name) values ('20260925000300', 'v6_case_index') on conflict (version) do nothing;

commit;
