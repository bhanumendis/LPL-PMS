// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package httpapi

import (
	"net/url"
	"testing"

	"lpl-api/internal/contract"
)

func query(t *testing.T, table, raw string) contract.Query {
	t.Helper()
	v, _ := url.ParseQuery(raw)
	q, err := contract.ParseQuery(table, v)
	if err != nil {
		t.Fatal(err)
	}
	return q
}

func TestBuildSelectForClientQueries(t *testing.T) {
	cases := []struct {
		table, raw, want string
		args             []any
	}{
		{"org_config", "select=*", `select count(*)::int, coalesce(json_agg(row_to_json(t)), '[]'::json)::text from (select "id", "config", "updated_at" from "public"."org_config") t`, nil},
		{"cases", "select=*&order=updated_at.desc", `select count(*)::int, coalesce(json_agg(row_to_json(t)), '[]'::json)::text from (select "id", "ref", "status", "counsellor_id", "student_user_id", "rev", "updated_at", "data" from "public"."cases" order by "updated_at" desc) t`, nil},
		{"audit", "select=*&order=at.desc&limit=600", `select count(*)::int, coalesce(json_agg(row_to_json(t)), '[]'::json)::text from (select "id", "at", "actor_id", "actor_name", "actor_role", "action", "target", "detail", "event_type", "entity_type", "entity_id", "entity_label", "outcome", "source", "session_id", "summary", "changes", "meta" from "public"."audit" order by "at" desc limit 600) t`, nil},
		{"app_users", "select=*&auth_id=eq.abc", `select count(*)::int, coalesce(json_agg(row_to_json(t)), '[]'::json)::text from (select "id", "auth_id", "email", "name", "phone", "branch", "role", "active", "created_at", "created_by", "last_sign_in_at", "updated_at" from "public"."app_users" where "auth_id" = $1::uuid) t`, []any{"abc"}},
		{"app_users", "active=is.true&order=name.asc.nullslast&offset=5", `select count(*)::int, coalesce(json_agg(row_to_json(t)), '[]'::json)::text from (select "id", "auth_id", "email", "name", "phone", "branch", "role", "active", "created_at", "created_by", "last_sign_in_at", "updated_at" from "public"."app_users" where "active" is true order by "name" asc nulls last offset 5) t`, nil},
	}
	for _, c := range cases {
		got, args, err := buildSelect(query(t, c.table, c.raw))
		if err != nil {
			t.Fatalf("%s?%s: %v", c.table, c.raw, err)
		}
		if got != c.want {
			t.Errorf("%s?%s\n got %s\nwant %s", c.table, c.raw, got, c.want)
		}
		if len(args) != len(c.args) {
			t.Errorf("%s?%s: args %v want %v", c.table, c.raw, args, c.args)
		}
	}
}

func TestBuildUpsertVariants(t *testing.T) {
	cases := []struct {
		cols       []string
		onConflict []string
		resolution string
		want       string
	}{
		{[]string{"data", "id", "ref"}, []string{"id"}, "merge-duplicates",
			`insert into "public"."cases" ("data", "id", "ref") select "data", "id", "ref" from json_populate_recordset(null::"public"."cases", $1::json) on conflict ("id") do update set "data" = excluded."data", "ref" = excluded."ref"`},
		{[]string{"id"}, nil, "merge-duplicates",
			`insert into "public"."cases" ("id") select "id" from json_populate_recordset(null::"public"."cases", $1::json) on conflict ("id") do nothing`},
		{[]string{"id", "status"}, []string{"id"}, "ignore-duplicates",
			`insert into "public"."cases" ("id", "status") select "id", "status" from json_populate_recordset(null::"public"."cases", $1::json) on conflict ("id") do nothing`},
		{[]string{"id", "status"}, nil, "",
			`insert into "public"."cases" ("id", "status") select "id", "status" from json_populate_recordset(null::"public"."cases", $1::json)`},
	}
	for _, c := range cases {
		got, err := buildUpsert(contract.Tables["cases"], c.cols, c.onConflict, c.resolution)
		if err != nil {
			t.Fatal(err)
		}
		if got != c.want {
			t.Errorf("\n got %s\nwant %s", got, c.want)
		}
	}
	if _, err := buildUpsert(contract.Tables["cases"], []string{"id"}, nil, "sideways"); err == nil {
		t.Fatal("unknown resolution must be refused")
	}
	if _, err := buildUpsert(contract.Tables["cases"], []string{"id"}, []string{"nothere"}, "merge-duplicates"); err == nil {
		t.Fatal("unknown conflict column must be refused")
	}
}

func TestBuildPatchAndDelete(t *testing.T) {
	q := query(t, "app_users", "id=eq.u1")
	got, args, err := buildPatch(q.Table, []string{"last_sign_in_at"}, q.Filters)
	if err != nil {
		t.Fatal(err)
	}
	want := `update "public"."app_users" as t set "last_sign_in_at" = p."last_sign_in_at" from json_populate_record(null::"public"."app_users", $1::json) as p where t."id" = $2::text`
	if got != want || len(args) != 1 || args[0] != "u1" {
		t.Fatalf("\n got %s %v\nwant %s", got, args, want)
	}
	q = query(t, "prompts", "id=neq.__none__")
	got, args, err = buildDelete(q.Table, q.Filters)
	if err != nil {
		t.Fatal(err)
	}
	if got != `delete from "public"."prompts" where "id" <> $1::text` || args[0] != "__none__" {
		t.Fatalf("%s %v", got, args)
	}
}

func TestBuildRPC(t *testing.T) {
	if got := buildRPC(contract.Functions["needs_bootstrap"]); got != `select to_json(public."needs_bootstrap"())::text` {
		t.Fatal(got)
	}
	if got := buildRPC(contract.Functions["case_in_scope"]); got != `select to_json(public."case_in_scope"("p_counsellor_id" => $1::text, "p_student_user_id" => $2::text))::text` {
		t.Fatal(got)
	}
	// v5: typed parameters and set-returning functions answer like PostgREST (a JSON array of rows).
	if got := buildRPC(contract.Functions["notifications_page"]); got != `select coalesce(json_agg(row_to_json(t)), '[]'::json)::text from public."notifications_page"("p_before" => $1::timestamptz, "p_limit" => $2::integer, "p_unread_only" => $3::boolean) t` {
		t.Fatal(got)
	}
	if got := buildRPC(contract.Functions["mark_notifications_read"]); got != `select to_json(public."mark_notifications_read"("p_ids" => (select coalesce(array_agg(x), '{}'::text[]) from jsonb_array_elements_text($1::jsonb) t(x))))::text` {
		t.Fatal(got)
	}
	if got := buildRPC(contract.Functions["notification_state"]); got != `select coalesce(json_agg(row_to_json(t)), '[]'::json)::text from public."notification_state"() t` {
		t.Fatal(got)
	}
}

func TestContentRange(t *testing.T) {
	if contentRange(0) != "*/*" || contentRange(1) != "0-0/*" || contentRange(600) != "0-599/*" {
		t.Fatal("content range")
	}
}
