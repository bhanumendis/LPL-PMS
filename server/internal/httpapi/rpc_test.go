// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package httpapi

import (
	"net/http"
	"testing"
)

func TestRPCNeedsBootstrapAsAnon(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{vals: []any{"true"}}}
	rec := e.do(http.MethodPost, "/rest/v1/rpc/needs_bootstrap", "anon-key", "{}", nil)
	if rec.Code != 200 || rec.Body.String() != "true" {
		t.Fatalf("%d %q", rec.Code, rec.Body.String())
	}
	if !e.runner.users[0].Anonymous {
		t.Fatalf("must run as anon: %+v", e.runner.users[0])
	}
	if e.ex.calls[0].SQL != `select to_json(public."needs_bootstrap"())::text` {
		t.Fatalf("sql %s", e.ex.calls[0].SQL)
	}
}

func TestRPCWithArgument(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{vals: []any{`"LPL-2026-0001"`}}}
	rec := e.do(http.MethodPost, "/rest/v1/rpc/next_case_ref", "admin-token", `{"prefix":"LPL"}`, nil)
	if rec.Code != 200 || rec.Body.String() != `"LPL-2026-0001"` {
		t.Fatalf("%d %q", rec.Code, rec.Body.String())
	}
	if e.ex.calls[0].SQL != `select to_json(public."next_case_ref"("prefix" => $1::text))::text` || e.ex.calls[0].Args[0] != "LPL" {
		t.Fatalf("%+v", e.ex.calls[0])
	}
}

func TestRPCNullResult(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{vals: []any{nil}}}
	rec := e.do(http.MethodPost, "/rest/v1/rpc/current_app_role", "admin-token", "{}", nil)
	if rec.Code != 200 || rec.Body.String() != "null" {
		t.Fatalf("%d %q", rec.Code, rec.Body.String())
	}
}

func TestRPCUnknownIs404(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodPost, "/rest/v1/rpc/nothere", "anon-key", "{}", nil)
	if rec.Code != 404 {
		t.Fatalf("%d", rec.Code)
	}
	mustContain(t, rec.Body.String(), `"code":"PGRST202"`)
	mustContain(t, rec.Body.String(), "Could not find the function public.nothere() in the schema cache")
	// A known function with the wrong arguments is also "not found", as PostgREST answers.
	rec = e.do(http.MethodPost, "/rest/v1/rpc/next_case_ref", "admin-token", `{"prefix":"LPL","extra":1}`, nil)
	if rec.Code != 404 {
		t.Fatalf("%d", rec.Code)
	}
	mustContain(t, rec.Body.String(), "public.next_case_ref(extra, prefix)")
	if len(e.ex.calls) != 0 {
		t.Fatalf("must not reach the database: %v", e.ex.calls)
	}
}

func TestRPCFunctionErrorIs400WithMessage(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{err: pgErr("P0001", "Opening a case requires the case.write permission")}}
	rec := e.do(http.MethodPost, "/rest/v1/rpc/next_case_ref", "student-token", `{"prefix":"LPL"}`, nil)
	if rec.Code != 400 {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	mustContain(t, rec.Body.String(), "Opening a case requires the case.write permission")
}

func TestRPCInvalidJSON(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodPost, "/rest/v1/rpc/needs_bootstrap", "anon-key", "{", nil)
	if rec.Code != 400 {
		t.Fatalf("%d", rec.Code)
	}
	mustContain(t, rec.Body.String(), `"code":"PGRST102"`)
}

func TestJSONScalar(t *testing.T) {
	for raw, want := range map[string]any{`"x"`: "x", `null`: nil, ``: nil, `12`: "12", `true`: "true", `{"a":1}`: `{"a":1}`} {
		got, err := jsonScalar([]byte(raw))
		if err != nil || got != want {
			t.Errorf("%s: got %v %v want %v", raw, got, err, want)
		}
	}
}
