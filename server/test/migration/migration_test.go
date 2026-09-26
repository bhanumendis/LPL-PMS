// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
//
// Migration validation. Three properties, each against real Postgres:
//
//  1. Upgrade: a database built from the v4 and v5 migrations and holding v5-shaped data
//     reaches v6 with its data migrated correctly (the v5 administrator becomes SUPER ADMIN,
//     the stored permission matrix is rewritten for the new ADMIN role).
//  2. Idempotency: running every migration again changes nothing, and a data migration never
//     runs twice (an ADMIN created after the upgrade is not promoted by a re-run).
//  3. Equivalence: the upgraded catalogue is identical to a fresh install from schema.sql —
//     tables, columns, constraints, indexes, policies, functions, triggers, views and grants.
//
// Needs TEST_DATABASE_URL (a role that may create databases); skipped otherwise.
package migration

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

var root = filepath.Join("..", "..", "..")

func migrationFiles(t *testing.T) []string {
	t.Helper()
	files, err := filepath.Glob(filepath.Join(root, "supabase", "migrations", "*.sql"))
	if err != nil || len(files) < 3 {
		t.Fatalf("migrations: %v %v", files, err)
	}
	sort.Strings(files)
	return files
}

func exec(t *testing.T, ctx context.Context, conn *pgx.Conn, sql string) {
	t.Helper()
	results, err := conn.PgConn().Exec(ctx, sql).ReadAll()
	if err == nil {
		for _, r := range results {
			if r.Err != nil {
				err = r.Err
				break
			}
		}
	}
	if err != nil {
		t.Fatalf("exec: %v\n%.300s", err, sql)
	}
}

func applyFile(t *testing.T, ctx context.Context, conn *pgx.Conn, file string) {
	t.Helper()
	b, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	exec(t, ctx, conn, string(b))
}

// freshDB creates an empty database and returns a connection to it; it is dropped at the end.
func freshDB(t *testing.T, ctx context.Context, admin *pgx.Conn, dsn, name string) *pgx.Conn {
	t.Helper()
	exec(t, ctx, admin, fmt.Sprintf("drop database if exists %s with (force)", name))
	exec(t, ctx, admin, "create database "+name)
	t.Cleanup(func() {
		_, _ = admin.Exec(context.Background(), fmt.Sprintf("drop database if exists %s with (force)", name))
	})
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	conn, err := pgx.Connect(ctx, u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close(context.Background()) })
	applyFile(t, ctx, conn, filepath.Join(root, "server", "test", "sql", "auth_shim.sql"))
	return conn
}

const v5Data = `
-- v5 bootstrap: the first sign-up's trigger creates the administrator profile.
insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ('owner@gmail.com', '{"name":"Owner"}', now());
insert into public.app_users (id, auth_id, email, name, role, active) values
  ('u-tl', null, 'tl@lyceum.lk', 'Team Leader', 'team_leader', true),
  ('u-c', null, 'c@lyceum.lk', 'Counsellor', 'counsellor', true);
update public.org_config set config = '{
  "orgName": "LPL",
  "permissions": {
    "case.read":       ["admin", "team_leader", "counsellor", "student"],
    "case.delete":     ["admin", "team_leader"],
    "gate.write":      ["admin", "team_leader"],
    "settings.delete": ["admin"],
    "prompt.view":     ["admin"],
    "role.write":      ["admin"]
  },
  "caseScope": {"admin": "all", "team_leader": "all", "counsellor": "assigned", "student": "own"}
}'::jsonb where id = 'org';
insert into public.org_config (id, config) select 'org', '{}'::jsonb where not exists (select 1 from public.org_config);
`

func TestUpgradeIdempotencyAndEquivalence(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	admin, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close(ctx)
	suffix := fmt.Sprint(os.Getpid())
	files := migrationFiles(t)

	// ---- 1. upgrade from v5 ----
	up := freshDB(t, ctx, admin, dsn, "lpl_upgrade_"+suffix)
	var v6 []string
	for _, f := range files {
		base := filepath.Base(f)
		if base < "20260925" {
			applyFile(t, ctx, up, f)
		} else {
			v6 = append(v6, f)
		}
	}
	// v5 had no organisation row until the first save; the seed creates one as the v5 app did.
	exec(t, ctx, up, "insert into public.org_config (id, config) values ('org', '{}'::jsonb) on conflict do nothing")
	exec(t, ctx, up, v5Data)
	for _, f := range v6 {
		applyFile(t, ctx, up, f)
	}

	var role string
	if err := up.QueryRow(ctx, "select role from public.app_users where email = 'owner@gmail.com'").Scan(&role); err != nil || role != "super_admin" {
		t.Fatalf("v5 administrator became %q (%v), want super_admin", role, err)
	}
	var review int
	if err := up.QueryRow(ctx, "select count(*)::int from public.super_admin_review").Scan(&review); err != nil || review != 1 {
		t.Fatalf("super_admin_review: %d %v (a gmail owner must be flagged for Group IT)", review, err)
	}
	var perms, scope string
	if err := up.QueryRow(ctx, "select (config->'permissions')::text, (config->'caseScope')::text from public.org_config where id = 'org'").Scan(&perms, &scope); err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{
		`"case.read": ["admin", "counsellor", "student", "team_leader"]`, // ADMIN holds case.read in v6
		`"case.delete": ["team_leader"]`,                                 // the old owner stripped; ADMIN does not delete
		`"gate.write": ["team_leader"]`,                                  // ADMIN does not decide gates by default
	} {
		if !strings.Contains(perms, want) {
			t.Errorf("stored matrix %s lacks %s", perms, want)
		}
	}
	for _, gone := range []string{"settings.delete", "prompt.view", "role.write"} {
		if strings.Contains(perms, `"`+gone+`"`) {
			t.Errorf("stored matrix still carries %s: %s", gone, perms)
		}
	}
	if !strings.Contains(scope, `"admin": "all"`) || strings.Contains(scope, "super_admin") {
		t.Errorf("case scope %s", scope)
	}

	// ---- 2. idempotency ----
	exec(t, ctx, up, "insert into public.app_users (id, email, name, role, active) values ('u-new-admin', 'na@lyceum.lk', 'New Admin', 'admin', true)")
	for _, f := range files {
		applyFile(t, ctx, up, f)
	}
	if err := up.QueryRow(ctx, "select role from public.app_users where id = 'u-new-admin'").Scan(&role); err != nil || role != "admin" {
		t.Fatalf("a re-run promoted an ADMIN to %q: the data migration ran twice", role)
	}
	var perms2 string
	if err := up.QueryRow(ctx, "select (config->'permissions')::text from public.org_config where id = 'org'").Scan(&perms2); err != nil || perms2 != perms {
		t.Fatalf("a re-run rewrote the matrix:\n%s\n%s", perms, perms2)
	}

	// ---- 3. equivalence with a fresh install ----
	fresh := freshDB(t, ctx, admin, dsn, "lpl_fresh_"+suffix)
	applyFile(t, ctx, fresh, filepath.Join(root, "supabase", "schema.sql"))
	a, b := catalogue(t, ctx, up), catalogue(t, ctx, fresh)
	if len(a) == 0 {
		t.Fatal("empty catalogue")
	}
	for k, v := range b {
		if a[k] != v {
			t.Errorf("fresh has %s = %.200s\n  upgraded has %.200s", k, v, a[k])
		}
	}
	for k := range a {
		if _, ok := b[k]; !ok {
			t.Errorf("only the upgraded database has %s", k)
		}
	}
}

// catalogue describes every object in schema public that the application depends on.
func catalogue(t *testing.T, ctx context.Context, conn *pgx.Conn) map[string]string {
	t.Helper()
	queries := map[string]string{
		"column": `select table_name || '.' || column_name, concat_ws(' ', ordinal_position, data_type, is_nullable, column_default)
		           from information_schema.columns where table_schema = 'public'`,
		"constraint": `select conrelid::regclass || '.' || conname, pg_get_constraintdef(oid) from pg_constraint where connamespace = 'public'::regnamespace`,
		"index":      `select indexname, indexdef from pg_indexes where schemaname = 'public'`,
		"policy":     `select tablename || '.' || policyname, concat_ws(' | ', cmd, roles::text, qual, with_check) from pg_policies where schemaname = 'public'`,
		"function": `select p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid)) from pg_proc p
		             where p.pronamespace = 'public'::regnamespace and p.prokind in ('f', 'p')`,
		"trigger":  `select tgrelid::regclass || '.' || tgname, pg_get_triggerdef(oid) from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'auth.%'`,
		"view":     `select viewname, md5(definition) from pg_views where schemaname = 'public'`,
		"grant":    `select table_name || ' ' || grantee || ' ' || privilege_type, 'yes' from information_schema.role_table_grants where table_schema = 'public'`,
		"routine":  `select routine_name || ' ' || grantee, privilege_type from information_schema.role_routine_grants where routine_schema = 'public'`,
		"rls":      `select relname, relrowsecurity::text from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`,
		"sequence": `select sequence_name, data_type from information_schema.sequences where sequence_schema = 'public'`,
	}
	out := map[string]string{}
	for kind, q := range queries {
		rows, err := conn.Query(ctx, q)
		if err != nil {
			t.Fatalf("%s: %v", kind, err)
		}
		for rows.Next() {
			var k, v *string
			if err := rows.Scan(&k, &v); err != nil {
				t.Fatal(err)
			}
			val := ""
			if v != nil {
				val = *v
			}
			key := kind + " " + *k
			if prev, dup := out[key]; dup {
				val = prev + "; " + val
			}
			out[key] = val
		}
		rows.Close()
	}
	return out
}
