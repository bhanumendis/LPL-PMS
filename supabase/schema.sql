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
