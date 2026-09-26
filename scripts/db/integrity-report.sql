-- Lyceum Placements — Placement Management System
-- Copyright © Bhanu Mendis - LGH IT
--
-- Data integrity report: orphans, duplicates, values outside their sets, unreadable or
-- impossible timestamps, role and permission consistency, and test or demonstration data.
-- Run it against production before migrating (the Migrate database workflow runs it on every
-- dry run and before applying) and again afterwards.
--
--   psql "$DATABASE_URL" -X -f scripts/db/integrity-report.sql            # a report to read
--   psql "$DATABASE_URL" -X -v csv=1 -f scripts/db/integrity-report.sql   # the same as CSV
--
-- It changes nothing: it runs in one READ ONLY transaction (the server refuses any write) and
-- rolls it back. It prints record ids and counts, never a name, email or phone number, so its
-- output can sit in a workflow log. A finding is not a reason to delete anything: each one is
-- for a person to judge (docs/OPERATIONS.md, "Data integrity").
--
-- Severity: "blocks migration" would make a pending migration fail, and the report then exits
-- non-zero; "fix before go-live" breaks a screen, a permission or a delivery; "review" is for
-- a person to classify (test and demonstration data, expected leftovers).
--
-- Works on a v4, v5 or v6 database: checks on tables a version does not have are skipped.

\set ON_ERROR_STOP on
\set QUIET on
begin transaction isolation level repeatable read, read only;
set local statement_timeout = '10min';

select to_regclass('public.notifications') is not null as has_v5,
       to_regclass('public.super_admin_review') is not null as has_v6,
       exists (select 1 from public.app_users
                where role not in ('super_admin', 'admin', 'team_leader', 'counsellor', 'student')) as blocks_migration
\gset

\if :{?csv}
\pset format csv
\else
\pset format aligned
\pset border 2
\pset null ''
\echo 'Lyceum Placements · data integrity report · read only, ids and counts only'
select now()::timestamptz(0) as "taken at", current_database() as database,
       case when :'has_v6'::boolean then 'v6' when :'has_v5'::boolean then 'v5' else 'v4' end as schema;
\pset title 'Profiles, sign-ins, cases, audit, configuration, test and demonstration data'
\endif

with
u as (select id, auth_id, lower(btrim(email)) as email, split_part(lower(btrim(email)), '@', 2) as domain, role, active from public.app_users),
c as (select id, ref, status, counsellor_id, student_user_id, updated_at, data from public.cases),
iso(re) as (values ('^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)?)?$')),
testdomain(re) as (values ('^(example\.(com|net|org)|test\.local|.*\.(test|invalid|example|localhost))$')),
arr as (
  select c.id as case_id, k.kind, e
    from c
   cross join (values ('gates'), ('transfers'), ('documents')) k(kind)
   cross join lateral jsonb_array_elements(case when jsonb_typeof(c.data -> k.kind) = 'array' then c.data -> k.kind else '[]'::jsonb end) e
),
steps as (
  select c.id as case_id, s.value
    from c cross join lateral jsonb_each(case when jsonb_typeof(c.data -> 'steps') = 'object' then c.data -> 'steps' else '{}'::jsonb end) s
),
dup_arr as (
  select case_id, kind from arr
   where jsonb_typeof(e) = 'object' and coalesce(e ->> 'id', '') <> ''
   group by case_id, kind, e ->> 'id' having count(*) > 1
),
checks(code, sev, area, finding, ids) as (
  -- Profiles and sign-ins
  select 'I1', 1, 'profiles', 'Role outside super_admin, admin, team_leader, counsellor, student (the v6 role check refuses the migration)',
         array(select id from u where role not in ('super_admin', 'admin', 'team_leader', 'counsellor', 'student'))
  union all select 'I3', 3, 'profiles', 'Sign-in with no profile: it authenticates but reaches nothing (ids are auth.users ids)',
         array(select a.id::text from auth.users a where not exists (select 1 from u where u.auth_id = a.id))
  union all select 'I4', 2, 'profiles', 'Email shared by two or more profiles, ignoring case and spaces',
         array(select u.id from u where u.email in (select email from u group by email having count(*) > 1))
  union all select 'I5', 2, 'profiles', 'Email differs from the linked sign-in''s email',
         array(select u.id from u join auth.users a on a.id = u.auth_id where lower(btrim(coalesce(a.email, ''))) <> u.email)
  union all select 'I6', 3, 'profiles', 'v5 administrator outside lyceum.lk: the upgrade makes them SUPER ADMIN, listed for Group IT review',
         array(select id from u where not :'has_v6'::boolean and role = 'admin' and domain <> 'lyceum.lk')
  union all select 'I7', 2, 'profiles', 'No active administrator holds the system (SUPER ADMIN in v6, admin before)',
         case when exists (select 1 from u where active and role = case when :'has_v6'::boolean then 'super_admin' else 'admin' end)
              then '{}'::text[] else array['(none)'] end
  union all select 'I8', 2, 'profiles', 'Deactivated profile still counsellor of open cases (ids are cases)',
         array(select c.id from c join u on u.id = c.counsellor_id where not u.active and c.status = 'open')
  -- Cases
  union all select 'C1', 2, 'cases', 'Counsellor is not a profile',
         array(select c.id from c where c.counsellor_id is not null and not exists (select 1 from u where u.id = c.counsellor_id))
  union all select 'C2', 2, 'cases', 'Counsellor is a student profile',
         array(select c.id from c join u on u.id = c.counsellor_id where u.role = 'student')
  union all select 'C3', 2, 'cases', 'Student sign-in is not a profile',
         array(select c.id from c where c.student_user_id is not null and not exists (select 1 from u where u.id = c.student_user_id))
  union all select 'C4', 2, 'cases', 'Student sign-in is a staff profile',
         array(select c.id from c join u on u.id = c.student_user_id where u.role <> 'student')
  union all select 'C5', 3, 'cases', 'Student profile on more than one open case (ids are profiles)',
         array(select student_user_id from c where status = 'open' and student_user_id is not null group by student_user_id having count(*) > 1)
  union all select 'C6', 2, 'cases', 'Status outside open, hold, deferred, exited, completed',
         array(select id from c where status not in ('open', 'hold', 'deferred', 'exited', 'completed'))
  union all select 'C7', 2, 'cases', 'Reference shared by two or more cases, ignoring case and spaces',
         array(select id from c where lower(btrim(ref)) in (select lower(btrim(ref)) from c group by 1 having count(*) > 1))
  union all select 'C8', 2, 'cases', 'Document disagrees with its row (id, ref, status, counsellor or student sign-in)',
         array(select id from c where jsonb_typeof(data) = 'object' and (
           data ->> 'id' is distinct from id or data ->> 'ref' is distinct from ref or data ->> 'status' is distinct from status
           or nullif(data ->> 'counsellorId', '') is distinct from counsellor_id or nullif(data ->> 'studentUserId', '') is distinct from student_user_id))
  union all select 'C9', 2, 'cases', 'Document is not an object, or has no student name',
         array(select id from c where jsonb_typeof(data) <> 'object' or coalesce(btrim(data -> 'student' ->> 'name'), '') = '')
  union all select 'C10', 2, 'cases', 'Created or updated date missing or not a date (lists and clocks read it as empty)',
         array(select id from c, iso where coalesce(data ->> 'createdAt', '') !~ iso.re or coalesce(data ->> 'updatedAt', '') !~ iso.re)
  union all select 'C11', 3, 'cases', 'Dated more than a day in the future',
         array(select id from c, iso where updated_at > now() + interval '1 day'
           or (data ->> 'createdAt' ~ iso.re and left(data ->> 'createdAt', 10) > to_char(now() + interval '1 day', 'YYYY-MM-DD'))
           or (data ->> 'updatedAt' ~ iso.re and left(data ->> 'updatedAt', 10) > to_char(now() + interval '1 day', 'YYYY-MM-DD')))
  union all select 'C12', 3, 'cases', 'Created after it was last updated',
         array(select id from c, iso where data ->> 'createdAt' ~ iso.re and data ->> 'updatedAt' ~ iso.re
           and left(data ->> 'createdAt', 10) > left(data ->> 'updatedAt', 10))
  union all select 'C13', 2, 'cases', 'Step state outside pending, done, na',
         array(select distinct case_id from steps where jsonb_typeof(value) <> 'object' or coalesce(value ->> 'status', '') not in ('pending', 'done', 'na'))
  union all select 'C14', 2, 'cases', 'Gate submission outside gates 16 and 19, or status outside pending, approved, returned',
         array(select distinct case_id from arr where kind = 'gates' and (jsonb_typeof(e) <> 'object'
           or coalesce(e ->> 'gate', '') not in ('16', '19') or coalesce(e ->> 'status', '') not in ('pending', 'approved', 'returned')))
  union all select 'C15', 2, 'cases', 'Two gate submissions share an id (the v6 gate register keeps one)',
         array(select distinct case_id from dup_arr where kind = 'gates')
  union all select 'C16', 2, 'cases', 'Two transfer records share an id (the v6 transfer register keeps one)',
         array(select distinct case_id from dup_arr where kind = 'transfers')
  union all select 'C17', 2, 'cases', 'Document entry with status outside uploaded, accepted, rejected',
         array(select distinct case_id from arr where kind = 'documents' and (jsonb_typeof(e) <> 'object'
           or coalesce(e ->> 'status', '') not in ('uploaded', 'accepted', 'rejected')))
  union all select 'C18', 2, 'cases', 'Two document entries share an id',
         array(select distinct case_id from dup_arr where kind = 'documents')
  -- Audit
  union all select 'A1', 3, 'audit', 'Entry dated more than a day in the future',
         array(select id from public.audit where at > now() + interval '1 day')
  union all select 'A2', 3, 'audit', 'Actor is no longer a profile (expected after a removal: the entry keeps name and role; ids are actors)',
         array(select distinct actor_id from public.audit a where not exists (select 1 from u where u.id = a.actor_id))
  -- Configuration
  union all select 'G1', 2, 'configuration', 'No organisation configuration row (org)',
         case when exists (select 1 from public.org_config where id = 'org') then '{}'::text[] else array['org'] end
  union all select 'G2', 2, 'configuration', 'Stored permission cell names a role that does not exist (ids are cells)',
         array(select distinct p.key from public.org_config o
                 cross join lateral jsonb_each(case when jsonb_typeof(o.config -> 'permissions') = 'object' then o.config -> 'permissions' else '{}'::jsonb end) p
                 cross join lateral jsonb_array_elements_text(case when jsonb_typeof(p.value) = 'array' then p.value else '[]'::jsonb end) r
                where r not in ('super_admin', 'admin', 'team_leader', 'counsellor', 'student'))
  union all select 'G3', 2, 'configuration', 'Standard permission cell names a role that does not exist (ids are cells)',
         array(select perm from public.permission_defaults
                where exists (select 1 from unnest(roles) r where r not in ('super_admin', 'admin', 'team_leader', 'counsellor', 'student')))
  -- Test and demonstration data (never removed automatically; see docs/OPERATIONS.md)
  union all select 'D1', 3, 'test data', 'v5 demonstration profile (id sample-…, or @lyceumplacements.demo / @student.demo)',
         array(select id from u where id like 'sample-%' or domain in ('lyceumplacements.demo', 'student.demo'))
  union all select 'D2', 3, 'test data', 'v5 demonstration case (id sample-…, or a student at @student.demo)',
         array(select id from c where id like 'sample-%' or lower(btrim(data -> 'student' ->> 'email')) like '%@student.demo')
  union all select 'D3', 3, 'test data', 'v5 demonstration audit entry (id or actor sample-…)',
         array(select id from public.audit where id like 'sample-%' or actor_id like 'sample-%')
  union all select 'D4', 3, 'test data', 'Profile on a reserved test domain (example.com, *.test, *.invalid, test.local …)',
         array(select id from u, testdomain where domain ~ testdomain.re)
  union all select 'D5', 3, 'test data', 'Case whose student email is on a reserved test domain',
         array(select id from c, testdomain where split_part(lower(btrim(data -> 'student' ->> 'email')), '@', 2) ~ testdomain.re)
)
select code, case sev when 1 then 'blocks migration' when 2 then 'fix before go-live' else 'review' end as severity,
       area, finding, cardinality(ids) as found, array_to_string((select array_agg(x order by x) from unnest(ids) x)[1:5], ' ') as "first ids"
  from checks
 order by sev, (cardinality(ids) = 0), code;

\if :has_v5
\if :{?csv}
\else
\pset title 'Notifications and push devices'
\endif
with u as (select id, active from public.app_users)
select code, case sev when 2 then 'fix before go-live' else 'review' end as severity, area, finding,
       cardinality(ids) as found, array_to_string((select array_agg(x order by x) from unnest(ids) x)[1:5], ' ') as "first ids"
  from (
    select 'N1' as code, 2 as sev, 'notifications' as area, 'Recipient is not a profile (ids are recipients)' as finding,
           array(select distinct recipient_id from public.notifications n where not exists (select 1 from u where u.id = n.recipient_id)) as ids
    union all select 'N2', 3, 'notifications', 'About a case that no longer exists (ids are cases)',
           array(select distinct case_id from public.notifications n where case_id is not null and not exists (select 1 from public.cases c where c.id = n.case_id))
    union all select 'N3', 2, 'push devices', 'Device of a profile that does not exist (ids are profiles)',
           array(select distinct user_id from public.push_subscriptions p where not exists (select 1 from u where u.id = p.user_id))
    union all select 'N4', 3, 'push devices', 'Live device of a deactivated profile (v6 sends it nothing; ids are profiles)',
           array(select distinct p.user_id from public.push_subscriptions p join u on u.id = p.user_id where p.revoked_at is null and not u.active)
  ) n
 order by sev, (cardinality(ids) = 0), code;
\endif

\if :has_v6
\if :{?csv}
\else
\pset title 'v6: Group IT'
\endif
select 'V1' as code, 'fix before go-live' as severity, 'profiles' as area,
       'SUPER ADMIN outside the Group IT domains (public.super_admin_review): add the domain or move the role' as finding,
       count(*) as found, array_to_string((array_agg(id order by id))[1:5], ' ') as "first ids"
  from public.super_admin_review;
\endif

rollback;

-- A blocking finding fails the run (psql exits 3), so the workflow stops before migrating.
\if :blocks_migration
do $$ begin raise exception 'integrity: finding I1 blocks a pending migration. Nothing was changed; resolve it, then migrate.'; end $$;
\endif
