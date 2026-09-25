// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"

	"lpl-api/internal/gotrue"
)

const fnPath = "/functions/v1/admin-users"

func profileRow(authID any) fakeRow {
	return fakeRow{vals: []any{"u1", "Someone@Example.com", "Some One", "", authID, true}}
}

func decode(t *testing.T, body string) map[string]string {
	t.Helper()
	var m map[string]string
	if err := json.Unmarshal([]byte(body), &m); err != nil {
		t.Fatalf("not a JSON object: %s", body)
	}
	return m
}

func TestAdminUsersPreconditions(t *testing.T) {
	e := newEnv(t)
	rec := e.do(http.MethodGet, fnPath, "admin-token", "", nil)
	if rec.Code != 405 || decode(t, rec.Body.String())["error"] != "Method not allowed" {
		t.Fatalf("GET: %d %s", rec.Code, rec.Body.String())
	}
	rec = e.do(http.MethodPost, fnPath, "", `{"action":"create","app_user_id":"u1"}`, nil)
	if rec.Code != 401 || decode(t, rec.Body.String())["error"] != "Sign in required." {
		t.Fatalf("no bearer: %d %s", rec.Code, rec.Body.String())
	}
	rec = e.do(http.MethodPost, fnPath, "admin-token", `{`, nil)
	if rec.Code != 400 || decode(t, rec.Body.String())["error"] != "Invalid JSON body." {
		t.Fatalf("bad json: %d %s", rec.Code, rec.Body.String())
	}
	rec = e.do(http.MethodPost, fnPath, "admin-token", `{"action":"create"}`, nil)
	if rec.Code != 400 || decode(t, rec.Body.String())["error"] != "app_user_id is required." {
		t.Fatalf("no id: %d %s", rec.Code, rec.Body.String())
	}
	if len(e.ex.calls) != 0 {
		t.Fatalf("preconditions must not reach the database: %v", e.ex.calls)
	}
}

func TestAdminUsersPermission(t *testing.T) {
	e := newEnv(t)
	// The anon key as bearer is a valid credential without a role: 403, as the function answered.
	rec := e.do(http.MethodPost, fnPath, "anon-key", `{"action":"create","app_user_id":"u1"}`, nil)
	if rec.Code != 403 || decode(t, rec.Body.String())["error"] != "This action requires the account.write permission." {
		t.Fatalf("anon: %d %s", rec.Code, rec.Body.String())
	}
	// A forged token also answers 403 rather than 401.
	rec = e.do(http.MethodPost, fnPath, "forged", `{"action":"deactivate","app_user_id":"u1"}`, nil)
	if rec.Code != 403 || decode(t, rec.Body.String())["error"] != "This action requires the account.delete permission." {
		t.Fatalf("forged: %d %s", rec.Code, rec.Body.String())
	}
	// app_can says no.
	e.ex.rows = []fakeRow{{vals: []any{false, true}}}
	rec = e.do(http.MethodPost, fnPath, "student-token", `{"action":"create","app_user_id":"u1"}`, nil)
	if rec.Code != 403 {
		t.Fatalf("denied: %d %s", rec.Code, rec.Body.String())
	}
	if e.ex.calls[0].SQL != "select public.app_can($1::text), public.can_manage_account($2::text)" || e.ex.calls[0].Args[0] != "account.write" || e.ex.calls[0].Args[1] != "u1" {
		t.Fatalf("permission query %+v", e.ex.calls[0])
	}
	if e.runner.users[0].Sub != studentSub {
		t.Fatalf("app_can must run under the caller's claims: %+v", e.runner.users[0])
	}
}

// Holding account.write is not enough to touch an administrator's sign-in.
func TestAdminUsersPrivilegedTargetNeedsSuperAdmin(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{vals: []any{true, false}}}
	rec := e.do(http.MethodPost, fnPath, "admin-token", `{"action":"set_password","app_user_id":"root","password":"Password123!"}`, nil)
	if rec.Code != 403 || decode(t, rec.Body.String())["error"] != "Only a SUPER ADMIN may manage administrator accounts." {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	if len(e.gotrue.passwords) != 0 || e.runner.system != 0 {
		t.Fatal("no identity work may happen for a refused target")
	}
}

func TestAdminUsersProfileLookup(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{vals: []any{true, true}}, {err: pgx.ErrNoRows}}
	rec := e.do(http.MethodPost, fnPath, "admin-token", `{"action":"create","app_user_id":"u9","password":"Password123!"}`, nil)
	if rec.Code != 404 || decode(t, rec.Body.String())["error"] != "No profile with that id. Create the profile first." {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
	if e.runner.system != 1 {
		t.Fatalf("profile lookup must run as the system caller: %d", e.runner.system)
	}
	e.ex.rows = []fakeRow{{vals: []any{true, true}}, {err: pgErr("XX000", "boom")}}
	rec = e.do(http.MethodPost, fnPath, "admin-token", `{"action":"create","app_user_id":"u9","password":"Password123!"}`, nil)
	if rec.Code != 500 || strings.Contains(rec.Body.String(), "boom") {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}

func TestAdminUsersCreate(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{vals: []any{true, true}}, profileRow("existing")}
	rec := e.do(http.MethodPost, fnPath, "admin-token", `{"action":"create","app_user_id":"u1","password":"Password123!"}`, nil)
	if rec.Code != 409 || decode(t, rec.Body.String())["error"] != "This profile already has a sign-in." {
		t.Fatalf("already: %d %s", rec.Code, rec.Body.String())
	}

	e.ex.rows = []fakeRow{{vals: []any{true, true}}, profileRow(nil)}
	rec = e.do(http.MethodPost, fnPath, "admin-token", `{"action":"create","app_user_id":"u1","password":"short"}`, nil)
	if rec.Code != 400 || decode(t, rec.Body.String())["error"] != "Use at least 10 characters." {
		t.Fatalf("weak: %d %s", rec.Code, rec.Body.String())
	}

	e.ex.rows = []fakeRow{{vals: []any{true, true}}, profileRow(nil)}
	e.ex.calls = nil
	rec = e.do(http.MethodPost, fnPath, "admin-token", `{"action":"create","app_user_id":"u1","password":"Password123!","email":"ignored","name":"ignored"}`, nil)
	if rec.Code != 200 || decode(t, rec.Body.String())["auth_id"] != e.gotrue.createID {
		t.Fatalf("create: %d %s", rec.Code, rec.Body.String())
	}
	req := e.gotrue.created[0]
	if req.Email != "someone@example.com" || req.Password != "Password123!" || !req.EmailConfirm {
		t.Fatalf("createUser request %+v", req)
	}
	if req.AppMetadata["provisioned"] != "admin-users" || req.AppMetadata["app_user_id"] != "u1" || req.UserMetadata["name"] != "Some One" || req.UserMetadata["phone"] != "" {
		t.Fatalf("metadata %+v", req)
	}
	link := e.ex.calls[len(e.ex.calls)-1]
	if link.SQL != "update public.app_users set auth_id = $1::uuid where id = $2::text and auth_id is null" || link.Args[0] != e.gotrue.createID || link.Args[1] != "u1" {
		t.Fatalf("link %+v", link)
	}

	e.ex.rows = []fakeRow{{vals: []any{true, true}}, profileRow(nil)}
	e.gotrue.err = &gotrue.Error{Status: 422, Message: "User already registered"}
	rec = e.do(http.MethodPost, fnPath, "admin-token", `{"action":"create","app_user_id":"u1","password":"Password123!"}`, nil)
	if rec.Code != 400 || decode(t, rec.Body.String())["error"] != "User already registered" {
		t.Fatalf("gotrue error: %d %s", rec.Code, rec.Body.String())
	}
	e.gotrue.err = nil

	e.ex.rows = []fakeRow{{vals: []any{true, true}}, profileRow(nil)}
	e.ex.execErr = pgErr("23503", "insert or update on table \"app_users\" violates foreign key constraint")
	rec = e.do(http.MethodPost, fnPath, "admin-token", `{"action":"create","app_user_id":"u1","password":"Password123!"}`, nil)
	if rec.Code != 500 || strings.Contains(rec.Body.String(), "foreign key") || !strings.Contains(rec.Body.String(), "could not be linked") {
		t.Fatalf("link error: %d %s", rec.Code, rec.Body.String())
	}
}

func TestAdminUsersSetPassword(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{vals: []any{true, true}}, profileRow(nil)}
	rec := e.do(http.MethodPost, fnPath, "admin-token", `{"action":"set_password","app_user_id":"u1","password":"Password123!"}`, nil)
	if rec.Code != 409 || decode(t, rec.Body.String())["error"] != "This profile has no sign-in yet." {
		t.Fatalf("no sign-in: %d %s", rec.Code, rec.Body.String())
	}
	e.ex.rows = []fakeRow{{vals: []any{true, true}}, profileRow("auth-1")}
	rec = e.do(http.MethodPost, fnPath, "admin-token", `{"action":"set_password","app_user_id":"u1","password":"nosymbols"}`, nil)
	if rec.Code != 400 {
		t.Fatalf("weak: %d %s", rec.Code, rec.Body.String())
	}
	e.ex.rows = []fakeRow{{vals: []any{true, true}}, profileRow("auth-1")}
	rec = e.do(http.MethodPost, fnPath, "admin-token", `{"action":"set_password","app_user_id":"u1","password":"Password123!"}`, nil)
	if rec.Code != 200 || decode(t, rec.Body.String())["auth_id"] != "auth-1" || e.gotrue.passwords["auth-1"] != "Password123!" {
		t.Fatalf("set: %d %s %v", rec.Code, rec.Body.String(), e.gotrue.passwords)
	}
}

func TestAdminUsersActivation(t *testing.T) {
	e := newEnv(t)
	e.ex.rows = []fakeRow{{vals: []any{true, true}}, profileRow(nil)}
	rec := e.do(http.MethodPost, fnPath, "admin-token", `{"action":"deactivate","app_user_id":"u1"}`, nil)
	if rec.Code != 200 || decode(t, rec.Body.String())["auth_id"] != "" {
		t.Fatalf("no identity: %d %s", rec.Code, rec.Body.String())
	}
	if e.ex.calls[0].Args[0] != "account.delete" {
		t.Fatalf("needed permission %v", e.ex.calls[0].Args)
	}
	e.ex.rows = []fakeRow{{vals: []any{true, true}}, profileRow("auth-1")}
	rec = e.do(http.MethodPost, fnPath, "admin-token", `{"action":"deactivate","app_user_id":"u1"}`, nil)
	if rec.Code != 200 || e.gotrue.bans["auth-1"] != "876000h" {
		t.Fatalf("ban: %d %v", rec.Code, e.gotrue.bans)
	}
	e.ex.rows = []fakeRow{{vals: []any{true, true}}, profileRow("auth-1")}
	rec = e.do(http.MethodPost, fnPath, "admin-token", `{"action":"reactivate","app_user_id":"u1"}`, nil)
	if rec.Code != 200 || e.gotrue.bans["auth-1"] != "none" {
		t.Fatalf("unban: %d %v", rec.Code, e.gotrue.bans)
	}
	e.ex.rows = []fakeRow{{vals: []any{true, true}}, profileRow("auth-1")}
	rec = e.do(http.MethodPost, fnPath, "admin-token", `{"action":"explode","app_user_id":"u1"}`, nil)
	if rec.Code != 400 || decode(t, rec.Body.String())["error"] != "Unknown action." {
		t.Fatalf("unknown: %d %s", rec.Code, rec.Body.String())
	}
}

func TestAdminUsersWithoutGoTrue(t *testing.T) {
	e := newEnv(t, func(d *Deps) { d.GoTrue = nil })
	rec := e.do(http.MethodPost, fnPath, "admin-token", `{"action":"create","app_user_id":"u1"}`, nil)
	if rec.Code != 500 || decode(t, rec.Body.String())["error"] != "The function environment is incomplete." {
		t.Fatalf("%d %s", rec.Code, rec.Body.String())
	}
}
