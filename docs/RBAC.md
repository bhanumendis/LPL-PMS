# Roles and permissions

Developed by Bhanu Mendis - Group IT

Access is decided by the database, not by the browser: every table's row-level security
policy and every guard trigger in `supabase/schema.sql` asks `app_can('resource.action')` and
`current_case_scope()` for the signed-in user. The browser uses the same matrix
(`src/lib/rbac.ts`) only to decide what to show. A crafted request that the interface would
never send meets the same refusal (`server/test/integration/rbac_test.go`).

## Roles

| Role | Who | Case scope | In short |
|---|---|---|---|
| **SUPER ADMIN** | Group IT | all | The system owner. Holds every cell, including the locked ones. Only an account on a Group IT email domain may hold it. |
| **ADMIN** | Placement Team | all | Operational administration: cases, assignment, documents, staff profiles and sign-ins for non-administrator roles, operational settings, data protection, analytics, the audit log (read). |
| Team Leader | Team Leaders | all | Gate decisions (steps 16 and 19), escalations, analytics, data protection. |
| Counsellor | Counsellors | assigned | Their own caseload. |
| Student | Students | own | Their own case: profile, uploads, the two confirmations. |

## What ADMIN can never do

These cells are **locked**: no configuration can grant them to anyone but SUPER ADMIN, and the
database refuses a matrix that tries (`perm_is_locked()`, the `org_config` guard).

- `system.*` — system configuration, including the Web Push keys;
- `role.write` — changing the permission matrix or case scope;
- `prompt.*` — the Prompt Engineer Workspace.

And by rule, regardless of the matrix:

- only a SUPER ADMIN creates, changes, deactivates or resets an ADMIN or SUPER ADMIN account
  (`can_manage_account()`); an ADMIN manages Team Leader, Counsellor and Student accounts;
- nobody changes their own role or activation, and the last active SUPER ADMIN cannot be
  removed or demoted;
- SUPER ADMIN requires an email on a domain in `public.group_it_domains` (`lyceum.lk`),
  checked on every insert and update of a profile and at sign-up. The domain list is changed by
  Group IT through SQL only — no application role can write it.

**Outside the application entirely:** the Supabase dashboard, database credentials, the service
role key, the JWT secret, VAPID private key and every other secret. They live with Group IT
and the container host (`docs/OPERATIONS.md`, `docs/SECURITY.md`); no application role,
SUPER ADMIN included, can read them through the product.

## The standard matrix

SUPER ADMIN holds every cell and is not listed. "Own", "assigned" and "all" come from the case
scope above. Cells marked — are held by nobody but SUPER ADMIN.

| Resource | View | Read | Write | Delete | Download |
|---|---|---|---|---|---|
| Cases | all roles | all roles | all roles | — | Admin, Team Leader, Counsellor |
| Sensitive fields | all roles | Admin, Team Leader, Counsellor | all roles | | |
| Assignment | all roles | | Admin, Team Leader | | |
| Documents | all roles | all roles | Admin, Counsellor, Student | — | all roles |
| Reviews | all roles | | Admin, Team Leader, Counsellor | | |
| Gates | Admin, Team Leader, Counsellor | Admin, Team Leader, Counsellor | Team Leader | | |
| Escalations | Admin, Team Leader | Admin, Team Leader | | | |
| Analytics | Admin, Team Leader | Admin, Team Leader | | | Admin, Team Leader |
| Staff | Admin, Team Leader, Counsellor | Admin, Team Leader | Admin | — | Admin |
| Accounts (sign-ins) | | | Admin | Admin | |
| Roles and permissions | Admin | Admin | **locked** | | |
| Audit log | Admin, Team Leader | Admin, Team Leader | | | — |
| Data protection | Admin, Team Leader | Admin, Team Leader | Admin, Team Leader | — | Admin, Team Leader |
| Settings | Admin | Admin | Admin | | |
| System | **locked** | **locked** | **locked** | **locked** | |
| Prompts | **locked** | **locked** | **locked** | **locked** | **locked** |

The source of truth is `DEFAULT_PERMISSIONS` in `src/lib/rbac.ts` and `permission_defaults`
in the v6 RBAC migration; the integration suite checks the two agree cell for cell.

## Changing access

SUPER ADMIN edits the matrix and case scope in **People → Roles and permissions**. The page
shows locked cells as locked; the database would refuse them anyway. Every change is written
to the audit log with a field-level diff.

Settings are split by key so each needs its own cell: `permissions` and `caseScope` need
`role.write`, standing processors `dataprotection.write`, the push keys `system.write`, and
everything else `settings.write`.

## Upgrading from v5

v5 had one all-powerful `admin`. The v6 migration makes every existing `admin` a SUPER ADMIN
(nobody loses access) and the new ADMIN role starts empty: a SUPER ADMIN then moves Placement
Team accounts to ADMIN. A migrated SUPER ADMIN whose email is not on a Group IT domain keeps
working (the domain rule applies when a role or email changes, not on every save), and the
view `public.super_admin_review` lists such accounts for Group IT (SQL editor): move them to
ADMIN, or correct their email.
