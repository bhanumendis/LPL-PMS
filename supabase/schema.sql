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
-- Migrations included: 20260901000000, 20260912000000, 20260925000100, 20260925000200

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

commit;
