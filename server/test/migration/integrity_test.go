// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
//
// The data integrity report (scripts/db/integrity-report.sql), run with psql as the Migrate
// database workflow runs it, against a database at v4, then v5 with v5-shaped data, then v6:
//
//   - on clean data it finds nothing it should not (the v5 administrator outside lyceum.lk is
//     reported before the upgrade and in the Group IT review after it);
//   - every defect planted afterwards is found, by the check meant for it, with its id;
//   - the data is byte for byte the same after every run (the report is read only);
//   - no email, name or phone number reaches its output;
//   - a finding that would make a migration fail makes the run fail.
//
// Needs TEST_DATABASE_URL (a role that may create databases) and psql; skipped otherwise, except
// in CI, where a missing psql fails.
package migration

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"net/url"
	"os"
	osexec "os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

type finding struct {
	severity string
	found    int
	ids      string
}

type reportRun struct {
	findings map[string]finding
	output   string
	exitCode int
}

func runReport(t *testing.T, dsn string) reportRun {
	t.Helper()
	cmd := osexec.Command("psql", dsn, "-X", "-v", "csv=1", "-f", filepath.Join(root, "scripts", "db", "integrity-report.sql"))
	var stdout, stderr bytes.Buffer
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	run := reportRun{findings: map[string]finding{}, output: stdout.String() + stderr.String()}
	var exit *osexec.ExitError
	if errors.As(err, &exit) {
		run.exitCode = exit.ExitCode()
	} else if err != nil {
		t.Fatalf("psql: %v", err)
	}
	r := csv.NewReader(strings.NewReader(stdout.String()))
	r.FieldsPerRecord = -1
	rows, err := r.ReadAll()
	if err != nil {
		t.Fatalf("report output is not CSV: %v\n%s", err, run.output)
	}
	for _, row := range rows {
		if len(row) != 6 || row[0] == "code" {
			continue
		}
		n, err := strconv.Atoi(row[4])
		if err != nil {
			t.Fatalf("found %q: %v", row[4], err)
		}
		run.findings[row[0]] = finding{severity: row[1], found: n, ids: row[5]}
	}
	if len(run.findings) == 0 {
		t.Fatalf("the report printed no findings table\n%s", run.output)
	}
	return run
}

// snapshot is a digest of every row of every table the report reads.
func snapshot(t *testing.T, ctx context.Context, conn *pgx.Conn) string {
	t.Helper()
	rows, err := conn.Query(ctx, `select format('%I.%I', schemaname, tablename) from pg_tables
		where schemaname = 'public' or (schemaname = 'auth' and tablename = 'users') order by 1`)
	if err != nil {
		t.Fatal(err)
	}
	tables, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		t.Fatal(err)
	}
	var b strings.Builder
	for _, tbl := range tables {
		var digest string
		if err := conn.QueryRow(ctx, fmt.Sprintf("select '%[1]s ' || md5(coalesce(string_agg(t::text, '|' order by t::text), '')) from %[1]s t", tbl)).Scan(&digest); err != nil {
			t.Fatal(err)
		}
		b.WriteString(digest + "\n")
	}
	return b.String()
}

// report runs the report and checks what every run must hold: nothing changed, nothing personal
// printed.
func report(t *testing.T, ctx context.Context, conn *pgx.Conn, dsn string, personal []string) reportRun {
	t.Helper()
	before := snapshot(t, ctx, conn)
	run := runReport(t, dsn)
	if after := snapshot(t, ctx, conn); after != before {
		t.Fatalf("the report changed the data")
	}
	for _, p := range personal {
		if strings.Contains(strings.ToLower(run.output), strings.ToLower(p)) {
			t.Errorf("the report printed personal data %q", p)
		}
	}
	return run
}

// expect checks the named findings and that every other finding of severity "blocks migration"
// or "fix before go-live" found nothing.
func expect(t *testing.T, stage string, run reportRun, want map[string][]string) {
	t.Helper()
	for code, f := range run.findings {
		ids, wanted := want[code]
		switch {
		case wanted && f.found == 0:
			t.Errorf("%s: %s found nothing", stage, code)
		case wanted:
			for _, id := range ids {
				if !strings.Contains(" "+f.ids+" ", " "+id+" ") {
					t.Errorf("%s: %s lists %q, not %q", stage, code, f.ids, id)
				}
			}
		case f.found != 0 && f.severity != "review":
			t.Errorf("%s: %s (%s) found %d: %s", stage, code, f.severity, f.found, f.ids)
		}
	}
	for code := range want {
		if _, ok := run.findings[code]; !ok {
			t.Errorf("%s: no check %s in the report", stage, code)
		}
	}
}

func dbURL(t *testing.T, dsn, name string) string {
	t.Helper()
	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	u.Path = "/" + name
	return u.String()
}

const cleanData = `
set session_replication_role = replica;
insert into public.app_users (id, email, name, phone, role, active) values ('u-s', 'student.one@mail.lk', 'Student One', '0771234567', 'student', true);
insert into public.cases (id, ref, status, counsellor_id, student_user_id, data) values ('case-1', 'LPL-2026-0001', 'open', 'u-c', 'u-s',
  '{"id":"case-1","ref":"LPL-2026-0001","status":"open","counsellorId":"u-c","studentUserId":"u-s",
    "student":{"name":"Student One","email":"student.one@mail.lk","phone":"0771234567"},
    "steps":{"1":{"status":"done"},"2":{"status":"pending"}},"documents":[{"id":"d1","status":"uploaded"}],
    "gates":[{"id":"g1","gate":16,"round":1,"status":"pending"}],"transfers":[{"id":"t1"}],"events":[],
    "createdAt":"2026-09-01T10:00:00Z","updatedAt":"2026-09-02T10:00:00.000Z","rev":0}');
insert into public.audit (id, actor_id, actor_name, actor_role, action) select 'a-1', id, name, role, 'session.signin' from public.app_users where email = 'owner@gmail.com';
set session_replication_role = origin;
`

// One defect per check, each with an id the report must name. Planted with triggers off, as a
// hand edit or an older release would have left them.
const defects = `
set session_replication_role = replica;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a3', 'ghost.signin@mail.lk'),
  ('00000000-0000-0000-0000-0000000000a5', 'linked.other@mail.lk');
insert into public.app_users (id, auth_id, email, name, role, active) values
  ('p-dup1', null, 'Dup.Person@mail.lk', 'Dup One', 'counsellor', true),
  ('p-dup2', null, ' dup.person@mail.lk', 'Dup Two', 'counsellor', true),
  ('p-off', null, 'off.counsellor@mail.lk', 'Off Counsellor', 'counsellor', false),
  ('p-mismatch', '00000000-0000-0000-0000-0000000000a5', 'linked.self@mail.lk', 'Mis Match', 'counsellor', true),
  ('sample-u1', null, 'demo.person@lyceumplacements.demo', 'Demo Person', 'counsellor', true),
  ('p-test', null, 'tester@example.com', 'Tess Ter', 'counsellor', true);
insert into public.cases (id, ref, status, counsellor_id, student_user_id, data)
select v.id, v.ref, v.status, v.cid, v.sid,
       (select data from public.cases where id = 'case-1')
       || jsonb_build_object('id', v.id, 'ref', v.ref, 'status', v.status, 'counsellorId', v.cid, 'studentUserId', v.sid)
       || v.patch::jsonb
  from (values
    ('case-i8',  'LPL-I8',   'open',  'p-off',  'u-s',           '{}'),
    ('case-c1',  'LPL-C1',   'open',  'nobody', null,            '{}'),
    ('case-c2',  'LPL-C2',   'open',  'u-s',    null,            '{}'),
    ('case-c3',  'LPL-C3',   'open',  'u-c',    'ghost-student', '{}'),
    ('case-c4',  'LPL-C4',   'open',  'u-c',    'u-c',           '{}'),
    ('case-c6',  'LPL-C6',   'bogus', 'u-c',    null,            '{}'),
    ('case-c7a', 'LPL-DUP',  'open',  'u-c',    null,            '{}'),
    ('case-c7b', ' lpl-dup', 'open',  'u-c',    null,            '{}'),
    ('case-c8',  'LPL-C8',   'open',  'u-c',    null,            '{"id":"other-id"}'),
    ('case-c9',  'LPL-C9',   'open',  'u-c',    null,            '{"student":{"email":"nameless@mail.lk"}}'),
    ('case-c10', 'LPL-C10',  'open',  'u-c',    null,            '{"createdAt":"yesterday"}'),
    ('case-c11', 'LPL-C11',  'open',  'u-c',    null,            '{"createdAt":"2999-01-01T00:00:00Z","updatedAt":"2999-01-02T00:00:00Z"}'),
    ('case-c12', 'LPL-C12',  'open',  'u-c',    null,            '{"createdAt":"2026-09-10T00:00:00Z","updatedAt":"2026-09-01T00:00:00Z"}'),
    ('case-c13', 'LPL-C13',  'open',  'u-c',    null,            '{"steps":{"1":{"status":"skipped"}}}'),
    ('case-c14', 'LPL-C14',  'open',  'u-c',    null,            '{"gates":[{"id":"g1","gate":17,"status":"pending"}]}'),
    ('case-c15', 'LPL-C15',  'open',  'u-c',    null,            '{"gates":[{"id":"g1","gate":16,"status":"returned"},{"id":"g1","gate":16,"status":"pending"}]}'),
    ('case-c16', 'LPL-C16',  'open',  'u-c',    null,            '{"transfers":[{"id":"t1"},{"id":"t1"}]}'),
    ('case-c17', 'LPL-C17',  'open',  'u-c',    null,            '{"documents":[{"id":"d1","status":"lost"}]}'),
    ('case-c18', 'LPL-C18',  'open',  'u-c',    null,            '{"documents":[{"id":"d1","status":"uploaded"},{"id":"d1","status":"accepted"}]}'),
    ('sample-c1','LPL-D2',   'open',  'u-c',    null,            '{}'),
    ('case-d5',  'LPL-D5',   'open',  'u-c',    null,            '{"student":{"name":"Dee Five","email":"dee@example.org"}}')
  ) v(id, ref, status, cid, sid, patch);
update public.cases set data = data || '{"student":{"name":"Demo Student","email":"demo.student@student.demo"}}' where id = 'sample-c1';
insert into public.audit (id, at, actor_id, actor_name, actor_role, action)
select 'a-future', now() + interval '10 days', id, name, role, 'x' from public.app_users where email = 'owner@gmail.com'
union all select 'a-gone', now(), 'gone-actor', 'Gone', 'counsellor', 'x'
union all select 'sample-a1', now(), id, name, role, 'x' from public.app_users where email = 'owner@gmail.com';
update public.org_config set config = config || jsonb_build_object('permissions', coalesce(config -> 'permissions', '{}'::jsonb) || '{"case.read":["wizard"]}') where id = 'org';
insert into public.permission_defaults (perm, roles) values ('zz.test', '{wizard}');
insert into public.notifications (recipient_id, type, title, case_id) values ('nobody-r', 't', 'x', null), ('u-c', 't', 'x', 'deleted-case');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values
  ('nobody-p', 'https://push.invalid/1', 'k', 'a'), ('p-off', 'https://push.invalid/2', 'k', 'a');
set session_replication_role = origin;
`

var personalData = []string{
	"owner@gmail.com", "tl@lyceum.lk", "c@lyceum.lk", "student.one@mail.lk", "0771234567", "Student One",
	"ghost.signin@mail.lk", "linked.other@mail.lk", "dup.person@mail.lk", "off.counsellor@mail.lk", "Off Counsellor",
	"linked.self@mail.lk", "demo.person@lyceumplacements.demo", "Demo Person", "tester@example.com", "Tess Ter",
	"nameless@mail.lk", "dee@example.org", "Dee Five", "demo.student@student.demo", "Demo Student",
}

func TestIntegrityReport(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	if _, err := osexec.LookPath("psql"); err != nil {
		if os.Getenv("CI") != "" {
			t.Fatal("psql is required in CI")
		}
		t.Skip("psql not installed")
	}
	ctx := context.Background()
	admin, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer admin.Close(ctx)
	name := "lpl_integrity_" + fmt.Sprint(os.Getpid())
	db := freshDB(t, ctx, admin, dsn, name)
	url := dbURL(t, dsn, name)

	files := migrationFiles(t)
	apply := func(from, to string) {
		for _, f := range files {
			if base := filepath.Base(f); base >= from && base < to {
				applyFile(t, ctx, db, f)
			}
		}
	}

	// v4, empty: no notifications, no Group IT; the report still runs, and says that nobody
	// holds the system and there is no organisation row yet.
	apply("", "20260912")
	run := report(t, ctx, db, url, personalData)
	expect(t, "v4, empty", run, map[string][]string{"I7": nil, "G1": {"org"}})
	if _, ok := run.findings["N1"]; ok {
		t.Error("v4: the notification checks ran without a notifications table")
	}

	// v5 with v5-shaped data: the owner signed up with a personal address.
	apply("20260912", "20260925")
	exec(t, ctx, db, v5Data+cleanData)
	var owner string
	if err := db.QueryRow(ctx, "select id from public.app_users where email = 'owner@gmail.com'").Scan(&owner); err != nil {
		t.Fatal(err)
	}
	expect(t, "v5, clean", report(t, ctx, db, url, personalData), map[string][]string{"I6": {owner}})

	// v6: the owner is SUPER ADMIN outside the Group IT domains.
	apply("20260925", "99999999")
	run = report(t, ctx, db, url, personalData)
	expect(t, "v6, clean", run, map[string][]string{"V1": {owner}})
	if _, ok := run.findings["V1"]; !ok {
		t.Error("v6: the Group IT check did not run")
	}

	// Every planted defect is found by its check.
	exec(t, ctx, db, defects)
	expect(t, "v6, defects", report(t, ctx, db, url, personalData), map[string][]string{
		"I3": {"00000000-0000-0000-0000-0000000000a3"}, "I4": {"p-dup1", "p-dup2"}, "I5": {"p-mismatch"},
		"I8": {"case-i8"}, "C1": {"case-c1"}, "C2": {"case-c2"}, "C3": {"case-c3"}, "C4": {"case-c4"}, "C5": {"u-s"},
		"C6": {"case-c6"}, "C7": {"case-c7a", "case-c7b"}, "C8": {"case-c8"}, "C9": {"case-c9"}, "C10": {"case-c10"},
		"C11": {"case-c11"}, "C12": {"case-c12"}, "C13": {"case-c13"}, "C14": {"case-c14"}, "C15": {"case-c15"},
		"C16": {"case-c16"}, "C17": {"case-c17"}, "C18": {"case-c18"}, "A1": {"a-future"}, "A2": {"gone-actor"},
		"G2": {"case.read"}, "G3": {"zz.test"}, "D1": {"sample-u1"}, "D2": {"sample-c1"}, "D3": {"sample-a1"},
		"D4": {"p-test"}, "D5": {"case-d5"}, "N1": {"nobody-r"}, "N2": {"deleted-case"}, "N3": {"nobody-p"}, "N4": {"p-off"},
		"V1": {owner},
	})

	// Nobody holds the system and the organisation row is gone.
	exec(t, ctx, db, "set session_replication_role = replica; update public.app_users set active = false where role = 'super_admin'; delete from public.org_config; set session_replication_role = origin;")
	run = report(t, ctx, db, url, personalData)
	for _, code := range []string{"I7", "G1"} {
		if run.findings[code].found == 0 {
			t.Errorf("%s found nothing", code)
		}
	}
	if run.exitCode != 0 {
		t.Errorf("no finding blocks a migration, yet the report exited %d:\n%s", run.exitCode, run.output)
	}

	// A role the v6 role check refuses: the report fails, as the migration would.
	exec(t, ctx, db, "alter table public.app_users drop constraint app_users_role_check; update public.app_users set role = 'owner' where id = 'u-tl';")
	run = report(t, ctx, db, url, personalData)
	if run.findings["I1"].found != 1 || !strings.Contains(run.findings["I1"].ids, "u-tl") {
		t.Errorf("I1: %+v", run.findings["I1"])
	}
	if run.exitCode == 0 || !strings.Contains(run.output, "blocks a pending migration") {
		t.Errorf("a blocking finding must fail the run: exit %d\n%s", run.exitCode, run.output)
	}
}
