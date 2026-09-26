// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package httpapi

import (
	"net/http"
	"strings"
	"testing"

	"lpl-api/internal/schema"
)

func TestSelectRowsHappy(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{vals: []any{2, `[{"id":"a"},{"id":"b"}]`}}}
	rec := e.do(http.MethodGet, "/rest/v1/cases?select=*&order=updated_at.desc", "admin-token", "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != `[{"id":"a"},{"id":"b"}]` {
		t.Fatalf("body %s", rec.Body.String())
	}
	if rec.Header().Get("Content-Range") != "0-1/*" || !strings.HasPrefix(rec.Header().Get("Content-Type"), "application/json") {
		t.Fatalf("headers %v", rec.Header())
	}
	if len(e.runner.users) != 1 || e.runner.users[0].Role != "authenticated" || e.runner.users[0].Sub != adminSub {
		t.Fatalf("principal %+v", e.runner.users)
	}
	mustContain(t, e.ex.calls[0].SQL, `from "public"."cases" order by "updated_at" desc) t`)
}

func TestSelectEmptyCollection(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{vals: []any{0, "[]"}}}
	rec := e.do(http.MethodGet, "/rest/v1/audit?select=*&order=at.desc&limit=600", "admin-token", "", nil)
	if rec.Code != 200 || rec.Body.String() != "[]" || rec.Header().Get("Content-Range") != "*/*" {
		t.Fatalf("%d %s %v", rec.Code, rec.Body.String(), rec.Header())
	}
	mustContain(t, e.ex.calls[0].SQL, `order by "at" desc limit 600`)
}

func TestSelectFilterArgsAreTyped(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{vals: []any{1, `[{"id":"u1"}]`}}}
	rec := e.do(http.MethodGet, "/rest/v1/app_users?select=*&auth_id=eq."+adminSub, "admin-token", "", nil)
	if rec.Code != 200 {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	mustContain(t, e.ex.calls[0].SQL, `where "auth_id" = $1::uuid`)
	if e.ex.calls[0].Args[0] != adminSub {
		t.Fatalf("args %v", e.ex.calls[0].Args)
	}
}

func TestSelectRefusals(t *testing.T) {
	e := newEnv(t)
	cases := []struct {
		target string
		status int
		code   string
	}{
		{"/rest/v1/nothere?select=*", 404, "PGRST205"},
		{"/rest/v1/cases?select=id", 400, "PGRST100"},
		{"/rest/v1/cases?bogus=eq.1", 400, "42703"},
	}
	for _, c := range cases {
		rec := e.do(http.MethodGet, c.target, "admin-token", "", nil)
		if rec.Code != c.status {
			t.Errorf("%s: %d %s", c.target, rec.Code, rec.Body.String())
		}
		mustContain(t, rec.Body.String(), `"code":"`+c.code+`"`)
	}
	if len(e.ex.calls) != 0 {
		t.Fatalf("refusals must not reach the database: %v", e.ex.calls)
	}
}

func TestGatewayApikey(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodGet, "/rest/v1/cases", "admin-token", "", map[string]string{"apikey": ""})
	if rec.Code != 401 {
		t.Fatalf("missing apikey: %d", rec.Code)
	}
	mustContain(t, rec.Body.String(), "No API key found in request")
	rec = e.do(http.MethodGet, "/rest/v1/cases", "admin-token", "", map[string]string{"apikey": "wrong"})
	if rec.Code != 401 {
		t.Fatalf("wrong apikey: %d", rec.Code)
	}
	mustContain(t, rec.Body.String(), "Invalid API key")
	// The query-string form the gateway also accepts.
	e.ex.rows = []fakeRow{{vals: []any{0, "[]"}}}
	rec = e.do(http.MethodGet, "/rest/v1/cases?apikey=anon-key", "admin-token", "", map[string]string{"apikey": ""})
	if rec.Code != 200 {
		t.Fatalf("query apikey: %d %s", rec.Code, rec.Body.String())
	}
}

func TestTokenRefusals(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodGet, "/rest/v1/cases", "forged", "", nil)
	if rec.Code != 401 {
		t.Fatalf("forged token: %d", rec.Code)
	}
	mustContain(t, rec.Body.String(), `"code":"PGRST301"`)
	mustContain(t, rec.Body.String(), "JWSError JWSInvalidSignature")
	rec = e.do(http.MethodGet, "/rest/v1/cases", "service-token", "", nil)
	if rec.Code != 401 {
		t.Fatalf("service role must be refused on the public listener: %d", rec.Code)
	}
}

func TestAnonRunsAsAnon(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{err: pgErr("42501", "permission denied for table cases")}}
	rec := e.do(http.MethodGet, "/rest/v1/cases", "anon-key", "", nil)
	if rec.Code != 401 {
		t.Fatalf("anon RLS refusal maps to 401: %d %s", rec.Code, rec.Body.String())
	}
	if !e.runner.users[0].Anonymous {
		t.Fatalf("principal %+v", e.runner.users[0])
	}
	e.ex.rows = []fakeRow{{err: pgErr("42501", "permission denied for table cases")}}
	rec = e.do(http.MethodGet, "/rest/v1/cases", "admin-token", "", nil)
	if rec.Code != 403 {
		t.Fatalf("authenticated RLS refusal maps to 403: %d", rec.Code)
	}
	mustContain(t, rec.Body.String(), "permission denied for table cases")
}

func TestUpsertHappy(t *testing.T) {
	e := newEnv(t)
	body := `[{"id":"c1","ref":"LPL-2026-0001","data":{"steps":{"2":{"status":"pending","values":{}}}}}]`
	rec := e.do(http.MethodPost, "/rest/v1/cases?on_conflict=id", "admin-token", body,
		map[string]string{"Prefer": "return=minimal,resolution=merge-duplicates"})
	if rec.Code != http.StatusCreated || rec.Body.Len() != 0 {
		t.Fatalf("%d %q", rec.Code, rec.Body.String())
	}
	if rec.Header().Get("Content-Range") != "*/*" {
		t.Fatalf("headers %v", rec.Header())
	}
	want := `insert into "public"."cases" ("data", "id", "ref") select "data", "id", "ref" from json_populate_recordset(null::"public"."cases", $1::json) on conflict ("id") do update set "data" = excluded."data", "ref" = excluded."ref"`
	if e.ex.calls[0].SQL != want {
		t.Fatalf("sql\n got %s\nwant %s", e.ex.calls[0].SQL, want)
	}
	if e.ex.calls[0].Args[0] != body {
		t.Fatalf("payload must pass through untouched: %v", e.ex.calls[0].Args[0])
	}
}

func TestUpsertSingleObjectIsWrapped(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodPost, "/rest/v1/org_config?on_conflict=id", "admin-token", `{"id":"org","config":{"rev":1}}`,
		map[string]string{"Prefer": "return=minimal,resolution=merge-duplicates"})
	if rec.Code != 201 {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	if e.ex.calls[0].Args[0] != `[{"id":"org","config":{"rev":1}}]` {
		t.Fatalf("payload %v", e.ex.calls[0].Args[0])
	}
}

func TestUpsertEmptyArrayIsANoOp(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodPost, "/rest/v1/cases?on_conflict=id", "admin-token", "[]", map[string]string{"Prefer": "return=minimal,resolution=merge-duplicates"})
	if rec.Code != 201 || len(e.ex.calls) != 0 {
		t.Fatalf("%d calls=%v", rec.Code, e.ex.calls)
	}
}

func TestUpsertRefusals(t *testing.T) {
	e := newEnv(t)
	cases := []struct {
		body, prefer, want string
	}{
		{`[{"id":"c1","nothere":1}]`, "return=minimal,resolution=merge-duplicates", `"code":"PGRST204"`},
		{`[{"id":"c1"},{"ref":"x"}]`, "return=minimal,resolution=merge-duplicates", "All object keys must match"},
		{`[{"id":"c1"}]`, "return=representation", "return=minimal only"},
		{`not json`, "return=minimal", `"code":"PGRST102"`},
		{``, "return=minimal", `"code":"PGRST102"`},
	}
	for _, c := range cases {
		rec := e.do(http.MethodPost, "/rest/v1/cases?on_conflict=id", "admin-token", c.body, map[string]string{"Prefer": c.prefer})
		if rec.Code != 400 {
			t.Errorf("%s: %d %s", c.body, rec.Code, rec.Body.String())
		}
		mustContain(t, rec.Body.String(), c.want)
	}
	if len(e.ex.calls) != 0 {
		t.Fatalf("refusals must not reach the database: %v", e.ex.calls)
	}
}

func TestUpsertPassesTriggerMessagesThrough(t *testing.T) {
	e := newEnv(t)
	e.ex.execErr = pgErr("P0001", "Gate decisions require the gate.write permission")
	rec := e.do(http.MethodPost, "/rest/v1/cases?on_conflict=id", "student-token", `[{"id":"c1","data":{}}]`,
		map[string]string{"Prefer": "return=minimal,resolution=merge-duplicates"})
	if rec.Code != 400 {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	if rec.Body.String() != `{"code":"P0001","details":null,"hint":null,"message":"Gate decisions require the gate.write permission"}`+"\n" {
		t.Fatalf("envelope %s", rec.Body.String())
	}
}

func TestPatchHappy(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodPatch, "/rest/v1/app_users?id=eq.u1", "student-token", `{"last_sign_in_at":"2026-09-11T10:00:00.000Z"}`,
		map[string]string{"Prefer": "return=minimal"})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	want := `update "public"."app_users" as t set "last_sign_in_at" = p."last_sign_in_at" from json_populate_record(null::"public"."app_users", $1::json) as p where t."id" = $2::text`
	if e.ex.calls[0].SQL != want {
		t.Fatalf("sql\n got %s\nwant %s", e.ex.calls[0].SQL, want)
	}
	if e.ex.calls[0].Args[0] != `{"last_sign_in_at":"2026-09-11T10:00:00.000Z"}` || e.ex.calls[0].Args[1] != "u1" {
		t.Fatalf("args %v", e.ex.calls[0].Args)
	}
}

func TestPatchRefusals(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodPatch, "/rest/v1/app_users", "admin-token", `{"name":"x"}`, nil)
	if rec.Code != 400 {
		t.Fatalf("no filter: %d", rec.Code)
	}
	mustContain(t, rec.Body.String(), "requires at least one filter")
	rec = e.do(http.MethodPatch, "/rest/v1/app_users?id=eq.u1", "admin-token", `[{"name":"x"},{"name":"y"}]`, nil)
	if rec.Code != 400 {
		t.Fatalf("array: %d", rec.Code)
	}
	mustContain(t, rec.Body.String(), "single JSON object")
}

func TestDeleteHappyAndRefusal(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodDelete, "/rest/v1/cases?id=neq.__none__", "admin-token", "", map[string]string{"Prefer": "return=minimal"})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	if e.ex.calls[0].SQL != `delete from "public"."cases" where "id" <> $1::text` || e.ex.calls[0].Args[0] != "__none__" {
		t.Fatalf("%+v", e.ex.calls[0])
	}
	rec = e.do(http.MethodDelete, "/rest/v1/cases", "admin-token", "", nil)
	if rec.Code != 400 {
		t.Fatalf("no filter: %d", rec.Code)
	}
}

func TestUnsupportedMethod(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodPut, "/rest/v1/cases", "admin-token", "{}", nil)
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("%d", rec.Code)
	}
}

func TestPreflightNeedsNoApikey(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodOptions, "/rest/v1/cases", "", "", map[string]string{"apikey": "", "Origin": "null"})
	if rec.Code != http.StatusNoContent {
		t.Fatalf("%d", rec.Code)
	}
	h := rec.Header()
	if h.Get("Access-Control-Allow-Origin") != "*" || !strings.Contains(h.Get("Access-Control-Allow-Headers"), "apikey") || !strings.Contains(h.Get("Access-Control-Allow-Headers"), "prefer") {
		t.Fatalf("cors headers %v", h)
	}
}

func TestVersionNamesTheBuildWithoutAKey(t *testing.T) {
	rec := newEnv(t, func(d *Deps) { d.Revision = "abc123" }).do(http.MethodGet, "/version", "", "", map[string]string{"apikey": ""})
	if rec.Code != 200 || strings.TrimSpace(rec.Body.String()) != `{"revision":"abc123","schema":"`+schema.Required+`"}` {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	rec = newEnv(t).do(http.MethodGet, "/version", "", "", map[string]string{"apikey": ""})
	if !strings.Contains(rec.Body.String(), `"dev"`) {
		t.Fatalf("unset revision: %s", rec.Body.String())
	}
}

func TestHealthAndReadiness(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodGet, "/healthz", "", "", map[string]string{"apikey": ""})
	if rec.Code != 200 || rec.Body.String() != "ok" {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	e.ex.rows = []fakeRow{{vals: []any{true}}}
	rec = e.do(http.MethodGet, "/readyz", "", "", map[string]string{"apikey": ""})
	if rec.Code != 200 || rec.Body.String() != "ready" {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	// A database without this build's newest migration is not ready: the deploy smoke test
	// fails on it and the pipeline rolls the API back.
	e.ex.rows = []fakeRow{{vals: []any{false}}}
	rec = e.do(http.MethodGet, "/readyz", "", "", map[string]string{"apikey": ""})
	if rec.Code != 503 || !strings.Contains(rec.Body.String(), schema.Required) {
		t.Fatalf("schema behind: %d %s", rec.Code, rec.Body.String())
	}
	e.runner.systemErr = pgErr("08006", "connection failure")
	rec = e.do(http.MethodGet, "/readyz", "", "", map[string]string{"apikey": ""})
	if rec.Code != 503 || rec.Body.String() != "database unavailable" {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestAuthProxyIsMounted(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodPost, "/auth/v1/token?grant_type=password", "", `{"email":"a@b.c","password":"x"}`, nil)
	if rec.Code != 200 || rec.Body.String() != "proxied /auth/v1/token?grant_type=password" {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestRequestIDIsEchoed(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{vals: []any{0, "[]"}}}
	rec := e.do(http.MethodGet, "/rest/v1/cases", "admin-token", "", map[string]string{"X-Request-Id": "abc123"})
	if rec.Header().Get("X-Request-Id") != "abc123" {
		t.Fatalf("headers %v", rec.Header())
	}
}
