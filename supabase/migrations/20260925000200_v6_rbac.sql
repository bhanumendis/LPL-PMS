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
