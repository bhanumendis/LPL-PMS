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

-- ---------------------------------------------------------------------------
-- v5 (12 September 2026): structured audit, notifications, push subscriptions.
-- Identical to supabase/migrations/20260912_notifications_audit.sql; projects already on v4
-- run that file alone.
-- ---------------------------------------------------------------------------

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
