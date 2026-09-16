// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package parity

import (
	"bytes"
	"strings"
	"testing"
)

func TestWriteAndLoad(t *testing.T) {
	var buf bytes.Buffer
	w := NewWriter(&buf)
	_ = w.Write(&Record{Method: "GET", Path: "/rest/v1/cases", Status: 200, ResponseBody: "[]"})
	_ = w.Write(&Record{Method: "POST", Path: "/rest/v1/rpc/needs_bootstrap", Status: 200, ResponseBody: "true"})
	recs, err := Load(&buf)
	if err != nil {
		t.Fatal(err)
	}
	if len(recs) != 2 || recs[0].Seq != 1 || recs[1].Seq != 2 || recs[1].Path != "/rest/v1/rpc/needs_bootstrap" {
		t.Fatalf("%+v", recs)
	}
}

func TestPeekToken(t *testing.T) {
	// header {"alg":"HS256"} . payload {"role":"authenticated","sub":"abc"} . fake signature
	tok := "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCIsInN1YiI6ImFiYyJ9.sig"
	if role, sub := PeekToken("Bearer "+tok, "anon"); role != "authenticated" || sub != "abc" {
		t.Fatalf("%s %s", role, sub)
	}
	if role, _ := PeekToken("Bearer anon", "anon"); role != "anon" {
		t.Fatal(role)
	}
	if role, _ := PeekToken("", "anon"); role != "anon" {
		t.Fatal(role)
	}
	if role, _ := PeekToken("Bearer sb_publishable_xyz", "anon"); role != "opaque" {
		t.Fatal(role)
	}
}

func TestNormalize(t *testing.T) {
	in := `[{"at":"2026-09-05T10:31:40.762+00:00","id":"7e1e1a2c-1b7f-4a3e-9c1d-0a1b2c3d4e5f","ref":"LPL-2026-0007","v":"d41d8cd98f00b204e9800998ecf8427e","u":"2026-09-11T00:00:00Z"}]`
	got := Normalize(in)
	want := `[{"at":"<ts>","id":"<uuid>","ref":"LPL-<yyyy>-0007","v":"<hash>","u":"<ts>"}]`
	if got != want {
		t.Fatalf("\n got %s\nwant %s", got, want)
	}
	if strings.Contains(Normalize(`"case_ref_seq"`), "<") {
		t.Fatal("plain words must survive")
	}
}
