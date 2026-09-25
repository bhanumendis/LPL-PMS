// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
// Integration suite: lpl-api in front of a real Postgres running supabase/schema.sql.
//
// Set TEST_DATABASE_URL (and optionally TEST_JWT_SECRET) to run it. The suite applies the
// test auth shim and the schema itself (both idempotent), so a fresh `postgres:16` container
// is enough. It proves the properties the façade exists to preserve: the role/claims
// plumbing, row-level security by scope, the JSON guard trigger's rules and messages,
// database-side audit attribution, and the account-administration flow.
package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"lpl-api/internal/auth"
	"lpl-api/internal/config"
	"lpl-api/internal/contract"
	"lpl-api/internal/db"
	"lpl-api/internal/gotrue"
	"lpl-api/internal/httpapi"
)

var (
	pool   *db.Pool
	base   string
	secret string
)

func TestMain(m *testing.M) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		fmt.Println("integration: TEST_DATABASE_URL not set, skipping")
		os.Exit(0)
	}
	secret = os.Getenv("TEST_JWT_SECRET")
	if secret == "" {
		secret = "integration-test-secret-at-least-32-characters"
	}
	ctx := context.Background()
	for _, f := range []string{filepath.Join("..", "sql", "auth_shim.sql"), filepath.Join("..", "..", "..", "supabase", "schema.sql")} {
		if err := applySQL(ctx, dsn, f); err != nil {
			fmt.Println("integration: apply", f, ":", err)
			os.Exit(1)
		}
	}
	var err error
	pool, err = db.Open(ctx, dsn, 4, false, "service_role")
	if err != nil {
		fmt.Println("integration: open:", err)
		os.Exit(1)
	}
	srv, err := httpapi.New(httpapi.Deps{
		Config: config.Config{
			AnonKey: "anon-key", ServiceRoleKey: "service-key", GoTrueURL: "http://gotrue.invalid",
			MaxBodyBytes: 10 << 20, RequestTimeout: 30 * time.Second, CORSAllowOrigin: "*",
		},
		Runner:   pool,
		Resolver: auth.NewVerifier("anon-key", secret, "", 0),
		GoTrue:   &fakeGoTrue{pool: pool},
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		fmt.Println("integration: server:", err)
		os.Exit(1)
	}
	ts := httptest.NewServer(srv.Handler())
	base = ts.URL
	code := m.Run()
	ts.Close()
	pool.Close()
	os.Exit(code)
}

func applySQL(ctx context.Context, dsn, file string) error {
	sqlText, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return err
	}
	defer conn.Close(ctx)
	results, err := conn.PgConn().Exec(ctx, string(sqlText)).ReadAll()
	if err != nil {
		return err
	}
	for _, r := range results {
		if r.Err != nil {
			return r.Err
		}
	}
	return nil
}

// fakeGoTrue stands in for GoTrue's admin API by doing what GoTrue does to the database:
// insert into auth.users, which fires handle_new_auth_user and links the profile.
type fakeGoTrue struct{ pool *db.Pool }

func (f *fakeGoTrue) CreateUser(ctx context.Context, req gotrue.CreateUserRequest) (string, error) {
	app, _ := json.Marshal(req.AppMetadata)
	user, _ := json.Marshal(req.UserMetadata)
	var id string
	err := f.pool.WithSystem(ctx, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx,
			"insert into auth.users (email, raw_app_meta_data, raw_user_meta_data, email_confirmed_at) values ($1::text, $2::jsonb, $3::jsonb, now()) returning id::text",
			req.Email, string(app), string(user)).Scan(&id)
	})
	return id, err
}

func (f *fakeGoTrue) UpdatePassword(context.Context, string, string) error { return nil }

func (f *fakeGoTrue) SetBanDuration(ctx context.Context, id, d string) error {
	return f.pool.WithSystem(ctx, func(ctx context.Context, ex db.Executor) error {
		if d == "none" {
			_, err := ex.Exec(ctx, "update auth.users set banned_until = null where id = $1::uuid", id)
			return err
		}
		_, err := ex.Exec(ctx, "update auth.users set banned_until = now() + interval '100 years' where id = $1::uuid", id)
		return err
	})
}

// ---------- fixtures ----------

func system(t *testing.T, fn func(ctx context.Context, ex db.Executor) error) {
	t.Helper()
	if err := pool.WithSystem(context.Background(), fn); err != nil {
		t.Fatal(err)
	}
}

func reset(t *testing.T) {
	t.Helper()
	system(t, func(ctx context.Context, ex db.Executor) error {
		for _, stmt := range []string{
			"truncate public.cases, public.audit, public.prompts, public.org_config, public.app_users",
			"delete from auth.users",
			"select setval('public.case_ref_seq', 1, false)",
			// A fresh database carries the organisation row (v6 write path).
			"insert into public.org_config (id, config) values ('org', '{}'::jsonb)",
		} {
			if _, err := ex.Exec(ctx, stmt); err != nil {
				return err
			}
		}
		return nil
	})
}

type identity struct{ AppID, AuthID, Token string }

func mintToken(t *testing.T, authID string) string {
	t.Helper()
	tok, err := auth.SignHS256(map[string]any{"role": "authenticated", "sub": authID, "aud": "authenticated", "exp": time.Now().Add(time.Hour).Unix()}, []byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

// bootstrapAdmin performs the first sign-up as GoTrue would: an auth.users row with no
// app_metadata on an empty project. The trigger creates the Administrator profile.
func bootstrapAdmin(t *testing.T) identity {
	t.Helper()
	var id identity
	system(t, func(ctx context.Context, ex db.Executor) error {
		if err := ex.QueryRow(ctx, `insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ('admin@test.local', '{"name":"Admin"}'::jsonb, now()) returning id::text`).Scan(&id.AuthID); err != nil {
			return err
		}
		return ex.QueryRow(ctx, "select id from public.app_users where auth_id = $1::uuid", id.AuthID).Scan(&id.AppID)
	})
	id.Token = mintToken(t, id.AuthID)
	return id
}

// provision creates a profile and then the identity the admin-users function would create,
// so the trigger's provisioned path links the two.
func provision(t *testing.T, role, email, name string) identity {
	t.Helper()
	var id identity
	system(t, func(ctx context.Context, ex db.Executor) error {
		if err := ex.QueryRow(ctx,
			"insert into public.app_users (id, email, name, role, active, created_at) values (gen_random_uuid()::text, $1::text, $2::text, $3::text, true, now()) returning id",
			email, name, role).Scan(&id.AppID); err != nil {
			return err
		}
		meta := fmt.Sprintf(`{"provisioned":"admin-users","app_user_id":%q}`, id.AppID)
		return ex.QueryRow(ctx,
			"insert into auth.users (email, raw_app_meta_data, email_confirmed_at) values ($1::text, $2::jsonb, now()) returning id::text",
			email, meta).Scan(&id.AuthID)
	})
	id.Token = mintToken(t, id.AuthID)
	return id
}

func caseJSON(id, ref, counsellorID, studentID string) string {
	return fmt.Sprintf(`{"id":%q,"ref":%q,"studentUserId":%q,"student":{"name":"Test Student","email":"student@test.local","phone":"0770000000"},"counsellorId":%q,"assignedAt":"2026-09-01T00:00:00.000Z","status":"open","steps":{"1":{"status":"done","values":{"source":"Walk-in"},"completedAt":"2026-09-01T00:00:00.000Z","completedBy":%q},"2":{"status":"pending","values":{"fullName":"Test Student"}}},"documents":[],"gates":[{"id":"g1","gate":16,"round":1,"submittedAt":"2026-09-02T00:00:00.000Z","submittedBy":%q,"status":"pending"}],"events":[],"transfers":[],"createdAt":"2026-09-01T00:00:00.000Z","updatedAt":"2026-09-01T00:00:00.000Z","rev":1}`,
		id, ref, studentID, counsellorID, counsellorID, counsellorID)
}

func insertCase(t *testing.T, id, ref, counsellorID, studentID string) {
	t.Helper()
	system(t, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx,
			"insert into public.cases (id, ref, status, counsellor_id, student_user_id, rev, updated_at, data) values ($1::text, $2::text, 'open', nullif($3::text, ''), nullif($4::text, ''), 1, '2026-09-01T00:00:00Z', $5::jsonb)",
			id, ref, counsellorID, studentID, caseJSON(id, ref, counsellorID, studentID))
		return err
	})
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func loadCaseData(t *testing.T, id string) map[string]any {
	t.Helper()
	var raw string
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select data::text from public.cases where id = $1::text", id).Scan(&raw)
	})
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		t.Fatal(err)
	}
	return m
}

// ---------- HTTP ----------

type reply struct {
	Status int
	Body   string
	Header http.Header
}

func call(t *testing.T, method, path, token, body string, headers map[string]string) reply {
	t.Helper()
	var rdr io.Reader
	if body != "" {
		rdr = strings.NewReader(body)
	}
	req, err := http.NewRequest(method, base+path, rdr)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("apikey", "anon-key")
	if token == "" {
		token = "anon-key"
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	b, _ := io.ReadAll(res.Body)
	return reply{Status: res.StatusCode, Body: string(b), Header: res.Header}
}

// insert is what src/lib/server.ts sends for a new row: a plain POST, no upsert.
func insert(t *testing.T, table, token, body string) reply {
	t.Helper()
	return call(t, http.MethodPost, "/rest/v1/"+table, token, body, map[string]string{"Prefer": "return=minimal"})
}

// patch is what src/lib/server.ts sends for a changed row.
func patch(t *testing.T, table, filter, token, body string) reply {
	t.Helper()
	return call(t, http.MethodPatch, "/rest/v1/"+table+"?"+filter, token, body, map[string]string{"Prefer": "return=minimal"})
}

// casePatch is a raw PATCH of a case (what a hand-crafted API call would send).
func casePatch(rev int, data map[string]any) string {
	data["rev"] = rev
	b, _ := json.Marshal(map[string]any{"rev": rev, "data": data})
	return string(b)
}

// saveCase is what saveCases sends: the save_case RPC with the next revision.
func saveCase(t *testing.T, token, id string, rev int, data map[string]any) reply {
	t.Helper()
	data["rev"] = rev
	b, _ := json.Marshal(map[string]any{"p_id": id, "p_rev": rev, "p_data": data})
	return rpc(t, "save_case", token, string(b))
}

func rpc(t *testing.T, fn, token, body string) reply {
	t.Helper()
	if body == "" {
		body = "{}"
	}
	return call(t, http.MethodPost, "/rest/v1/rpc/"+fn, token, body, nil)
}

func rowsOf(t *testing.T, body string) []map[string]any {
	t.Helper()
	var rows []map[string]any
	if err := json.Unmarshal([]byte(body), &rows); err != nil {
		t.Fatalf("not a JSON array: %s", body)
	}
	return rows
}

func expect(t *testing.T, r reply, status int, contains string) {
	t.Helper()
	if r.Status != status {
		t.Fatalf("status %d, want %d: %s", r.Status, status, r.Body)
	}
	if contains != "" && !strings.Contains(r.Body, contains) {
		t.Fatalf("body %q does not contain %q", r.Body, contains)
	}
}

// ---------- tests ----------

func TestBootstrap(t *testing.T) {
	reset(t)
	expect(t, rpc(t, "needs_bootstrap", "", ""), 200, "true")
	admin := bootstrapAdmin(t)
	expect(t, rpc(t, "needs_bootstrap", "", ""), 200, "false")
	r := call(t, http.MethodGet, "/rest/v1/app_users?select=*&auth_id=eq."+admin.AuthID, admin.Token, "", nil)
	expect(t, r, 200, `"role":"admin"`)
	if rows := rowsOf(t, r.Body); len(rows) != 1 || rows[0]["id"] != admin.AppID || rows[0]["email"] != "admin@test.local" {
		t.Fatalf("profile %v", rows)
	}
	if r.Header.Get("Content-Range") != "0-0/*" {
		t.Fatalf("content-range %q", r.Header.Get("Content-Range"))
	}
}

// defaultPermissions transcribes DEFAULT_PERMISSIONS from src/lib/rbac.ts. If this test
// fails, the TypeScript matrix and permission_defaults in schema.sql have drifted apart.
var defaultPermissions = map[string][]string{
	"case.view": {"admin", "team_leader", "counsellor", "student"}, "case.read": {"admin", "team_leader", "counsellor", "student"},
	"case.write": {"admin", "team_leader", "counsellor", "student"}, "case.delete": {"admin"}, "case.download": {"admin", "team_leader", "counsellor"},
	"sensitive.view": {"admin", "team_leader", "counsellor", "student"}, "sensitive.read": {"admin", "team_leader", "counsellor"}, "sensitive.write": {"admin", "team_leader", "counsellor", "student"},
	"assignment.view": {"admin", "team_leader", "counsellor", "student"}, "assignment.write": {"admin", "team_leader"},
	"document.view": {"admin", "team_leader", "counsellor", "student"}, "document.read": {"admin", "team_leader", "counsellor", "student"},
	"document.write": {"admin", "counsellor", "student"}, "document.delete": {"admin"}, "document.download": {"admin", "team_leader", "counsellor", "student"},
	"review.view": {"admin", "team_leader", "counsellor", "student"}, "review.write": {"admin", "team_leader", "counsellor"},
	"gate.view": {"admin", "team_leader", "counsellor"}, "gate.read": {"admin", "team_leader", "counsellor"}, "gate.write": {"admin", "team_leader"},
	"escalation.view": {"admin", "team_leader"}, "escalation.read": {"admin", "team_leader"},
	"analytics.view": {"admin", "team_leader"}, "analytics.read": {"admin", "team_leader"}, "analytics.download": {"admin", "team_leader"},
	"staff.view": {"admin", "team_leader", "counsellor"}, "staff.read": {"admin", "team_leader"}, "staff.write": {"admin"}, "staff.delete": {"admin"}, "staff.download": {"admin"},
	"account.write": {"admin"}, "account.delete": {"admin"},
	"role.view": {"admin"}, "role.read": {"admin"}, "role.write": {"admin"},
	"audit.view": {"admin", "team_leader"}, "audit.read": {"admin", "team_leader"}, "audit.download": {"admin"},
	"settings.view": {"admin"}, "settings.read": {"admin"}, "settings.write": {"admin"}, "settings.delete": {"admin"},
	"dataprotection.view": {"admin", "team_leader"}, "dataprotection.read": {"admin", "team_leader"}, "dataprotection.write": {"admin", "team_leader"},
	"dataprotection.delete": {"admin"}, "dataprotection.download": {"admin", "team_leader"},
	"prompt.view": {"admin"}, "prompt.read": {"admin"}, "prompt.write": {"admin"}, "prompt.delete": {"admin"}, "prompt.download": {"admin"},
}

func TestPermissionMatrixMatchesTypeScriptDefaults(t *testing.T) {
	reset(t)
	ids := map[string]identity{
		"admin":       bootstrapAdmin(t),
		"team_leader": provision(t, "team_leader", "tl@test.local", "Team Leader"),
		"counsellor":  provision(t, "counsellor", "c@test.local", "Counsellor"),
		"student":     provision(t, "student", "s@test.local", "Student"),
	}
	if len(defaultPermissions) != 52 {
		t.Fatalf("expected 52 cells, have %d", len(defaultPermissions))
	}
	for perm, roles := range defaultPermissions {
		for role, id := range ids {
			want := "false"
			for _, r := range roles {
				if r == role {
					want = "true"
				}
			}
			r := rpc(t, "app_can", id.Token, fmt.Sprintf(`{"perm":%q}`, perm))
			if r.Status != 200 || r.Body != want {
				t.Errorf("app_can(%s) as %s: got %d %q, want %s", perm, role, r.Status, r.Body, want)
			}
		}
	}
	// Anonymous callers hold nothing (functions are executable by PUBLIC; the answer is false).
	if r := rpc(t, "app_can", "", `{"perm":"case.view"}`); r.Status != 200 || r.Body != "false" {
		t.Fatalf("anon app_can: %d %s", r.Status, r.Body)
	}
}

func TestCaseVisibilityFollowsScope(t *testing.T) {
	reset(t)
	admin := bootstrapAdmin(t)
	c1 := provision(t, "counsellor", "c1@test.local", "Counsellor One")
	c2 := provision(t, "counsellor", "c2@test.local", "Counsellor Two")
	s := provision(t, "student", "s@test.local", "Student")
	insertCase(t, "case-a", "LPL-2026-0001", c1.AppID, s.AppID)
	insertCase(t, "case-b", "LPL-2026-0002", c2.AppID, "")

	list := func(tok string) []map[string]any {
		r := call(t, http.MethodGet, "/rest/v1/cases?select=*&order=updated_at.desc", tok, "", nil)
		expect(t, r, 200, "")
		return rowsOf(t, r.Body)
	}
	if rows := list(admin.Token); len(rows) != 2 {
		t.Fatalf("admin sees %d", len(rows))
	}
	if rows := list(c1.Token); len(rows) != 1 || rows[0]["id"] != "case-a" {
		t.Fatalf("counsellor one sees %v", rows)
	}
	if rows := list(s.Token); len(rows) != 1 || rows[0]["id"] != "case-a" {
		t.Fatalf("student sees %v", rows)
	}
	data, ok := list(c1.Token)[0]["data"].(map[string]any)
	if !ok || data["ref"] != "LPL-2026-0001" {
		t.Fatalf("jsonb document must come back as JSON: %v", data)
	}
	if r := call(t, http.MethodGet, "/rest/v1/cases?select=*", "", "", nil); r.Status != 401 {
		t.Fatalf("anon: %d %s", r.Status, r.Body)
	}
	if r := call(t, http.MethodGet, "/rest/v1/cases?select=*", "not-a-token", "", nil); r.Status != 401 {
		t.Fatalf("forged: %d %s", r.Status, r.Body)
	}
}

func TestStudentGuardInsideTheCaseDocument(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	c := provision(t, "counsellor", "c@test.local", "Counsellor")
	s := provision(t, "student", "s@test.local", "Student")
	insertCase(t, "case-a", "LPL-2026-0001", c.AppID, s.AppID)

	// A student may not move the case status.
	data := loadCaseData(t, "case-a")
	data["status"] = "hold"
	r := patch(t, "cases", "id=eq.case-a", s.Token, casePatch(2, data))
	expect(t, r, 400, "Students may only update their own details and documents")

	// A student may supply step-2 answers and record the submission.
	data = loadCaseData(t, "case-a")
	steps := data["steps"].(map[string]any)
	step2 := steps["2"].(map[string]any)
	step2["values"] = map[string]any{"fullName": "Test Student", "school": "Test School"}
	step2["studentSubmittedAt"] = "2026-09-03T00:00:00.000Z"
	data["events"] = []any{map[string]any{"id": "e1", "at": "2026-09-03T00:00:00.000Z", "by": s.AppID, "byName": "Student", "type": "student", "text": "Student submitted profile details", "step": 2}}
	r = patch(t, "cases", "id=eq.case-a", s.Token, casePatch(2, data))
	expect(t, r, 204, "")
	after := loadCaseData(t, "case-a")
	if after["steps"].(map[string]any)["2"].(map[string]any)["values"].(map[string]any)["school"] != "Test School" {
		t.Fatalf("step 2 not saved: %v", after["steps"])
	}

	// An event attributed to someone else is refused.
	data = loadCaseData(t, "case-a")
	data["events"] = append([]any{map[string]any{"id": "e2", "at": "2026-09-04T00:00:00.000Z", "by": c.AppID, "byName": "Counsellor", "type": "student", "text": "forged"}}, data["events"].([]any)...)
	r = patch(t, "cases", "id=eq.case-a", s.Token, casePatch(3, data))
	expect(t, r, 400, "Events must be recorded as yourself")
}

func TestGateDecisionNeedsGateWrite(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	tl := provision(t, "team_leader", "tl@test.local", "Team Leader")
	c := provision(t, "counsellor", "c@test.local", "Counsellor")
	s := provision(t, "student", "s@test.local", "Student")
	insertCase(t, "case-a", "LPL-2026-0001", c.AppID, s.AppID)

	decide := func(by identity) map[string]any {
		data := loadCaseData(t, "case-a")
		gate := data["gates"].([]any)[0].(map[string]any)
		gate["status"] = "approved"
		gate["decidedAt"] = "2026-09-05T00:00:00.000Z"
		gate["decidedBy"] = by.AppID
		return data
	}
	r := patch(t, "cases", "id=eq.case-a", c.Token, casePatch(2, decide(c)))
	expect(t, r, 400, "Gate decisions require the gate.write permission")
	if r.Header.Get("Content-Type") != "application/json; charset=utf-8" {
		t.Fatalf("content-type %q", r.Header.Get("Content-Type"))
	}
	r = patch(t, "cases", "id=eq.case-a", tl.Token, casePatch(2, decide(tl)))
	expect(t, r, 204, "")
	if loadCaseData(t, "case-a")["gates"].([]any)[0].(map[string]any)["status"] != "approved" {
		t.Fatal("gate not approved")
	}
}

func TestAuditRowsAreAttributedByTheDatabase(t *testing.T) {
	reset(t)
	admin := bootstrapAdmin(t)
	s := provision(t, "student", "s@test.local", "Student")
	r := insert(t, "audit", s.Token, `[{"id":"a1","at":"2020-01-01T00:00:00.000Z","actor_id":"forged","actor_name":"Forged","actor_role":"admin","action":"Profile submitted","target":"LPL-2026-0001","detail":null}]`)
	expect(t, r, 201, "")
	r = call(t, http.MethodGet, "/rest/v1/audit?select=*&order=at.desc&limit=600", admin.Token, "", nil)
	expect(t, r, 200, "")
	rows := rowsOf(t, r.Body)
	if len(rows) != 1 || rows[0]["actor_id"] != s.AppID || rows[0]["actor_name"] != "Student" || rows[0]["actor_role"] != "student" {
		t.Fatalf("attribution %v", rows)
	}
	if at, _ := rows[0]["at"].(string); strings.HasPrefix(at, "2020") {
		t.Fatalf("timestamp must be the database's, got %s", at)
	}
	// The student may not read the log back.
	r = call(t, http.MethodGet, "/rest/v1/audit?select=*", s.Token, "", nil)
	expect(t, r, 200, "")
	if len(rowsOf(t, r.Body)) != 0 {
		t.Fatal("audit.read is not a student cell")
	}
}

func TestNextCaseRefAndWorkspaceVersion(t *testing.T) {
	reset(t)
	admin := bootstrapAdmin(t)
	c := provision(t, "counsellor", "c@test.local", "Counsellor")
	r := rpc(t, "next_case_ref", c.Token, `{"prefix":"LPL"}`)
	expect(t, r, 200, "")
	if !regexp.MustCompile(`^"LPL-\d{4}-0001"$`).MatchString(r.Body) {
		t.Fatalf("ref %s", r.Body)
	}
	if r := rpc(t, "next_case_ref", c.Token, `{"prefix":""}`); !strings.HasSuffix(r.Body, `-0002"`) {
		t.Fatalf("sequence: %s", r.Body)
	}
	// A deactivated profile has no role, so the function refuses.
	system(t, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, "update public.app_users set active = false where id = $1::text", c.AppID)
		return err
	})
	r = rpc(t, "next_case_ref", c.Token, `{"prefix":"LPL"}`)
	expect(t, r, 400, "Opening a case requires the case.write permission")

	v1 := rpc(t, "workspace_version", admin.Token, "")
	expect(t, v1, 200, "")
	insertCase(t, "case-a", "LPL-2026-0001", "", "")
	v2 := rpc(t, "workspace_version", admin.Token, "")
	if v1.Body == v2.Body || len(v2.Body) != 34 {
		t.Fatalf("version must move: %s -> %s", v1.Body, v2.Body)
	}
}

func TestAdminUsersCreateLinksTheIdentity(t *testing.T) {
	reset(t)
	admin := bootstrapAdmin(t)
	c := provision(t, "counsellor", "c@test.local", "Counsellor")
	var newID string
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "insert into public.app_users (id, email, name, role, active, created_at) values (gen_random_uuid()::text, 'New@Test.local', 'New Person', 'counsellor', true, now()) returning id").Scan(&newID)
	})
	body := fmt.Sprintf(`{"action":"create","app_user_id":%q,"password":"Password123!"}`, newID)
	r := call(t, http.MethodPost, "/functions/v1/admin-users", c.Token, body, nil)
	expect(t, r, 403, "This action requires the account.write permission.")
	r = call(t, http.MethodPost, "/functions/v1/admin-users", admin.Token, body, nil)
	expect(t, r, 200, `"auth_id"`)
	var out map[string]string
	_ = json.Unmarshal([]byte(r.Body), &out)
	var linked string
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select auth_id::text from public.app_users where id = $1::text", newID).Scan(&linked)
	})
	if linked == "" || linked != out["auth_id"] {
		t.Fatalf("linked %q, returned %q", linked, out["auth_id"])
	}
	r = call(t, http.MethodPost, "/functions/v1/admin-users", admin.Token, body, nil)
	expect(t, r, 409, "This profile already has a sign-in.")
	r = call(t, http.MethodPost, "/functions/v1/admin-users", admin.Token, fmt.Sprintf(`{"action":"deactivate","app_user_id":%q}`, newID), nil)
	expect(t, r, 200, `"auth_id"`)
}

func TestOwnProfileTouchAndSilentDelete(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	c := provision(t, "counsellor", "c@test.local", "Counsellor")
	s := provision(t, "student", "s@test.local", "Student")
	insertCase(t, "case-a", "LPL-2026-0001", c.AppID, s.AppID)

	r := call(t, http.MethodPatch, "/rest/v1/app_users?id=eq."+s.AppID, s.Token, `{"last_sign_in_at":"2026-09-11T10:00:00.000Z"}`, map[string]string{"Prefer": "return=minimal"})
	expect(t, r, 204, "")
	var touched *string
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select last_sign_in_at::text from public.app_users where id = $1::text", s.AppID).Scan(&touched)
	})
	if touched == nil {
		t.Fatal("last_sign_in_at not written")
	}
	// A student may not change their own role: the guard trigger refuses.
	r = call(t, http.MethodPatch, "/rest/v1/app_users?id=eq."+s.AppID, s.Token, `{"role":"admin"}`, map[string]string{"Prefer": "return=minimal"})
	expect(t, r, 400, "Only an administrator may manage administrator profiles")

	// Without case.delete, DELETE matches no rows and answers 204, as under PostgREST.
	r = call(t, http.MethodDelete, "/rest/v1/cases?id=eq.case-a", c.Token, "", map[string]string{"Prefer": "return=minimal"})
	expect(t, r, 204, "")
	var n int
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select count(*)::int from public.cases").Scan(&n)
	})
	if n != 1 {
		t.Fatal("case must survive a delete by a role without case.delete")
	}
}

func TestContractTablesMatchTheCatalogue(t *testing.T) {
	for name, tb := range contract.Tables {
		var cols []string
		system(t, func(ctx context.Context, ex db.Executor) error {
			return ex.QueryRow(ctx, "select coalesce(array_agg(column_name::text order by ordinal_position), '{}') from information_schema.columns where table_schema = 'public' and table_name = $1::text", name).Scan(&cols)
		})
		want := make([]string, len(tb.Columns))
		for i, c := range tb.Columns {
			want[i] = c.Name
		}
		if strings.Join(cols, ",") != strings.Join(want, ",") {
			t.Errorf("%s: catalogue %v, contract %v", name, cols, want)
		}
	}
}

// ---------- v6 write path ----------

// Every role writes the rows it is entitled to with the statements the client now sends.
// Under v5's upserts each of these was refused by the insert/select policies or the
// BEFORE INSERT guard even though the caller held the right permission.
func TestEveryRoleCanWriteWhatItShould(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	c := provision(t, "counsellor", "c@test.local", "Counsellor")
	s := provision(t, "student", "s@test.local", "Student")
	insertCase(t, "case-a", "LPL-2026-0001", c.AppID, s.AppID)

	for i, who := range []identity{c, s} {
		r := insert(t, "audit", who.Token, fmt.Sprintf(`[{"id":"w%d","at":"2026-09-01T00:00:00.000Z","actor_id":"x","actor_name":"x","actor_role":"x","action":"Signed in","target":null,"detail":null}]`, i))
		expect(t, r, 201, "")
	}
	// Own profile: contact details, no permission needed beyond being the owner.
	expect(t, patch(t, "app_users", "id=eq."+c.AppID, c.Token, `{"phone":"0771234567"}`), 204, "")
	expect(t, patch(t, "app_users", "id=eq."+s.AppID, s.Token, `{"name":"Student Renamed"}`), 204, "")
	// Someone else's profile: row-level security hides the row from the update, so nothing
	// changes (PostgREST answers 204 for a PATCH that matched nothing; the UI never offers it).
	expect(t, patch(t, "app_users", "id=eq."+s.AppID, c.Token, `{"name":"Hijacked"}`), 204, "")
	var name string
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select name from public.app_users where id = $1::text", s.AppID).Scan(&name)
	})
	if name != "Student Renamed" {
		t.Fatalf("another counsellor renamed the student: %q", name)
	}
	// A student saves their own case document through save_case.
	data := loadCaseData(t, "case-a")
	data["steps"].(map[string]any)["2"].(map[string]any)["values"] = map[string]any{"fullName": "Test Student", "school": "Royal"}
	expect(t, saveCase(t, s.Token, "case-a", 2, data), 200, "2")
}

// save_case reports a save that matched nothing instead of answering success.
func TestSaveCaseReportsNothingSaved(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	c := provision(t, "counsellor", "c@test.local", "Counsellor")
	c2 := provision(t, "counsellor", "c2@test.local", "Counsellor Two")
	insertCase(t, "case-a", "LPL-2026-0001", c.AppID, "")
	expect(t, saveCase(t, c2.Token, "case-a", 2, loadCaseData(t, "case-a")), 404, "no longer exists")
	expect(t, saveCase(t, c.Token, "case-zz", 2, loadCaseData(t, "case-a")), 404, "")
	expect(t, saveCase(t, c.Token, "case-a", 2, loadCaseData(t, "case-a")), 200, "")
	expect(t, saveCase(t, c.Token, "case-a", 2, loadCaseData(t, "case-a")), 409, "changed by someone else")
}

func TestStaleRevisionIsRefused(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	c := provision(t, "counsellor", "c@test.local", "Counsellor")
	insertCase(t, "case-a", "LPL-2026-0001", c.AppID, "")

	first := loadCaseData(t, "case-a")
	second := loadCaseData(t, "case-a")
	first["status"] = "hold"
	expect(t, patch(t, "cases", "id=eq.case-a", c.Token, casePatch(2, first)), 204, "")
	// The second writer started from revision 1 as well: refused, nothing written.
	second["status"] = "deferred"
	r := patch(t, "cases", "id=eq.case-a", c.Token, casePatch(2, second))
	expect(t, r, 409, "changed by someone else")
	if !strings.Contains(r.Body, `"hint":"stale_revision"`) {
		t.Fatalf("stale refusal must carry the hint: %s", r.Body)
	}
	// Skipping ahead is refused too.
	expect(t, patch(t, "cases", "id=eq.case-a", c.Token, casePatch(9, loadCaseData(t, "case-a"))), 409, "")
	after := loadCaseData(t, "case-a")
	if after["status"] != "hold" || after["rev"].(float64) != 2 {
		t.Fatalf("status %v rev %v, want hold and 2", after["status"], after["rev"])
	}
}

// The columns row-level security reads are derived from the document; a payload cannot
// set them to something the document does not say.
func TestDerivedColumnsFollowTheDocument(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	c := provision(t, "counsellor", "c@test.local", "Counsellor")
	s := provision(t, "student", "s@test.local", "Student")
	other := provision(t, "student", "o@test.local", "Other Student")
	insertCase(t, "case-a", "LPL-2026-0001", c.AppID, s.AppID)

	data := loadCaseData(t, "case-a")
	data["rev"] = 2
	body, _ := json.Marshal(map[string]any{"rev": 2, "data": data, "student_user_id": other.AppID, "status": "completed"})
	expect(t, patch(t, "cases", "id=eq.case-a", c.Token, string(body)), 204, "")
	var student, status string
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select student_user_id, status from public.cases where id = 'case-a'").Scan(&student, &status)
	})
	if student != s.AppID || status != "open" {
		t.Fatalf("columns must follow the document: student %s status %s", student, status)
	}
	// The other student still cannot see the case.
	r := call(t, http.MethodGet, "/rest/v1/cases?select=*", other.Token, "", nil)
	expect(t, r, 200, "")
	if n := len(rowsOf(t, r.Body)); n != 0 {
		t.Fatalf("forged link leaked the case: %d rows", n)
	}
	// A document whose identity disagrees with the row is refused.
	data = loadCaseData(t, "case-a")
	data["id"] = "case-b"
	expect(t, patch(t, "cases", "id=eq.case-a", c.Token, casePatch(3, data)), 400, "Case identity")
}

func TestCaseInsertFollowsScope(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	c := provision(t, "counsellor", "c@test.local", "Counsellor")
	c2 := provision(t, "counsellor", "c2@test.local", "Counsellor Two")
	mk := func(id, counsellor string) string {
		var doc map[string]any
		_ = json.Unmarshal([]byte(caseJSON(id, "LPL-2026-00"+id[len(id)-2:], counsellor, "")), &doc)
		b, _ := json.Marshal([]map[string]any{{"id": id, "ref": doc["ref"], "rev": 1, "data": doc}})
		return string(b)
	}
	expect(t, insert(t, "cases", c.Token, mk("case-01", c.AppID)), 201, "")
	expect(t, insert(t, "cases", c.Token, mk("case-02", c2.AppID)), 403, "")
	expect(t, insert(t, "cases", c.Token, mk("case-01", c.AppID)), 409, "")
}

// org_config is one document; each top-level key answers to its own permission, and a save
// that changes only processors needs only dataprotection.write.
func TestOrgConfigKeysAnswerToTheirOwnCell(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	tl := provision(t, "team_leader", "tl@test.local", "Team Leader")
	system(t, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, `update public.org_config set config = '{"orgName":"LPL","sla":{"cisDays":7}}'::jsonb where id = 'org'`)
		return err
	})
	expect(t, patch(t, "org_config", "id=eq.org", tl.Token, `{"config":{"orgName":"LPL","sla":{"cisDays":7},"processors":[{"id":"p1","name":"Host"}]}}`), 204, "")
	expect(t, patch(t, "org_config", "id=eq.org", tl.Token, `{"config":{"orgName":"LPL","sla":{"cisDays":3},"processors":[{"id":"p1","name":"Host"}]}}`), 400, "requires the settings.write permission")
}
