// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package contract

import (
	"net/url"
	"testing"
)

func mustParse(t *testing.T, table, rawQuery string) Query {
	t.Helper()
	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		t.Fatal(err)
	}
	q, perr := ParseQuery(table, values)
	if perr != nil {
		t.Fatalf("%s?%s: %v", table, rawQuery, perr)
	}
	return q
}

// Every query src/lib/server.ts sends must parse.
func TestClientQueriesParse(t *testing.T) {
	q := mustParse(t, "cases", "select=*&order=updated_at.desc")
	if len(q.Order) != 1 || !q.Order[0].Desc || q.Order[0].Column.Name != "updated_at" {
		t.Fatalf("order: %+v", q.Order)
	}
	q = mustParse(t, "audit", "select=*&order=at.desc&limit=600")
	if q.Limit == nil || *q.Limit != 600 {
		t.Fatalf("limit: %+v", q.Limit)
	}
	q = mustParse(t, "app_users", "select=*&auth_id=eq.7e1e1a2c-1b7f-4a3e-9c1d-0a1b2c3d4e5f")
	if len(q.Filters) != 1 || q.Filters[0].Op != OpEq || q.Filters[0].Column.Type != UUID {
		t.Fatalf("filter: %+v", q.Filters)
	}
	q = mustParse(t, "cases", "on_conflict=id")
	if len(q.OnConflict) != 1 || q.OnConflict[0] != "id" {
		t.Fatalf("on_conflict: %+v", q.OnConflict)
	}
	q = mustParse(t, "prompts", "id=neq.__none__")
	if q.Filters[0].Op != OpNeq || q.Filters[0].Value != "__none__" {
		t.Fatalf("neq: %+v", q.Filters)
	}
	q = mustParse(t, "app_users", "id=eq.abc&apikey=whatever")
	if len(q.Filters) != 1 {
		t.Fatalf("apikey must be ignored: %+v", q.Filters)
	}
	mustParse(t, "org_config", "")
	mustParse(t, "permission_defaults", "select=*")
}

func TestRejections(t *testing.T) {
	cases := []struct {
		table, query string
		status       int
		code         string
	}{
		{"nope", "select=*", 404, "PGRST205"},
		{"cases", "select=id,ref", 400, "PGRST100"},
		{"cases", "nothere=eq.1", 400, "42703"},
		{"cases", "id=like.x", 400, "PGRST100"},
		{"cases", "id=novalue", 400, "PGRST100"},
		{"cases", "order=nothere.desc", 400, "42703"},
		{"cases", "order=updated_at.sideways", 400, "PGRST100"},
		{"cases", "limit=-1", 400, "PGRST100"},
		{"cases", "limit=ten", 400, "PGRST100"},
		{"cases", "on_conflict=nothere", 400, "PGRST204"},
		{"cases", "status=is.maybe", 400, "PGRST100"},
	}
	for _, c := range cases {
		values, _ := url.ParseQuery(c.query)
		_, err := ParseQuery(c.table, values)
		if err == nil {
			t.Errorf("%s?%s: expected refusal", c.table, c.query)
			continue
		}
		if err.Status != c.status || err.Code != c.code {
			t.Errorf("%s?%s: got %d %s, want %d %s", c.table, c.query, err.Status, err.Code, c.status, c.code)
		}
	}
}

func TestIsFilter(t *testing.T) {
	for _, v := range []string{"null", "not.null", "true", "false"} {
		q := mustParse(t, "app_users", "active=is."+v)
		if q.Filters[0].Op != OpIs || q.Filters[0].Value != v {
			t.Fatalf("is.%s: %+v", v, q.Filters)
		}
	}
}

func TestPrefer(t *testing.T) {
	p := ParsePrefer("return=minimal,resolution=merge-duplicates")
	if p.Return != "minimal" || p.Resolution != "merge-duplicates" {
		t.Fatalf("%+v", p)
	}
	p = ParsePrefer(" Return=Representation , count=exact")
	if p.Return != "representation" || p.Count != "exact" {
		t.Fatalf("%+v", p)
	}
	if (ParsePrefer("") != Prefer{}) {
		t.Fatal("empty header must parse to the zero value")
	}
}

func TestUnknownFunctionMessage(t *testing.T) {
	e := UnknownFunction("needs_bootstrap", nil)
	if e.Status != 404 || e.Code != "PGRST202" || e.Message != "Could not find the function public.needs_bootstrap() in the schema cache" {
		t.Fatalf("%+v", e)
	}
	e = UnknownFunction("next_case_ref", []string{"prefix", "x"})
	if e.Message != "Could not find the function public.next_case_ref(prefix, x) in the schema cache" {
		t.Fatalf("%+v", e)
	}
}

func TestTablesMatchSchema(t *testing.T) {
	// Column counts as declared in supabase/schema.sql.
	want := map[string]int{"org_config": 3, "app_users": 12, "cases": 8, "audit": 18, "prompts": 7, "permission_defaults": 2, "notifications": 16, "push_subscriptions": 9}
	for name, n := range want {
		tb, ok := Tables[name]
		if !ok {
			t.Fatalf("table %s missing", name)
		}
		if len(tb.Columns) != n {
			t.Errorf("%s: %d columns, want %d", name, len(tb.Columns), n)
		}
		if _, ok := tb.Column(tb.PrimaryKey); !ok {
			t.Errorf("%s: primary key %s is not a column", name, tb.PrimaryKey)
		}
	}
}
