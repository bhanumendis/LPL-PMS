-- Lyceum Placements — Placement Management System
-- Copyright © Bhanu Mendis - LGH IT
--
-- v6.5 — attribution. Idempotent.
--
-- The catalogue comments carry the backend attribution ("Copyright © Bhanu Mendis - LGH IT").
-- The v4 and v5 files now write it for a fresh install; a database upgraded from v5 recorded
-- those versions as applied, so it receives the same comments here.

comment on table public.org_config          is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Organisation settings, permission matrix, case scope and standing processors.';
comment on table public.app_users           is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Staff and student profiles linked to auth.users.';
comment on table public.cases               is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. One row per student case; the full record is in data.';
comment on table public.audit               is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Append-only, database-attributed activity log.';
comment on table public.prompts             is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Prompt Engineer Workspace templates (SUPER ADMIN only).';
comment on table public.permission_defaults is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Standard permission model fallback.';
comment on table public.notifications is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Per-recipient notifications written by database triggers.';
comment on table public.push_subscriptions is 'Lyceum Placements — Placement Management System. Copyright © Bhanu Mendis - LGH IT. Web Push subscriptions, one row per device.';

insert into public.schema_migrations (version, name) values ('20260925000500', 'v6_attribution') on conflict (version) do nothing;
