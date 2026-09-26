// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT

// Package schema names the database schema this build was written and tested against.
//
// Every migration in supabase/migrations records its version in public.schema_migrations.
// lpl-api is ready (GET /readyz) only when the newest of them, Required, has been applied: an
// API deployed ahead of its migrations would fail at its first new query, so the deploy's smoke
// test fails instead and the pipeline rolls the API back. Migrations are additive, so an older
// API is always ready against a newer schema.
package schema

// Required is the newest migration in supabase/migrations. TestRequiredIsTheNewestMigration
// fails the build when a migration is added without moving it.
const Required = "20260926000100"
