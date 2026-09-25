// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package config

import (
	"strings"
	"testing"
	"time"
)

func env(m map[string]string) func(string) string {
	return func(k string) string { return m[k] }
}

func TestFromEnvDefaults(t *testing.T) {
	c, err := FromEnv(env(map[string]string{
		"DATABASE_URL":       "postgres://u:p@db.example:6543/postgres",
		"GOTRUE_URL":         "https://ref.supabase.co/auth/v1/",
		"ANON_KEY":           "anon",
		"SERVICE_ROLE_KEY":   "service",
		"JWT_SECRET":         "s",
		"CORS_ALLOW_ORIGINS": "https://pms.lyceum.lk",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if !c.Production() || !c.HSTS || c.RateAuthPerMinute != 10 || c.TrustedProxyHops != 0 {
		t.Fatalf("production defaults wrong: %+v", c)
	}
	if c.ListenAddr != ":8080" || c.DBMaxConns != 8 || c.RequestTimeout != 30*time.Second || c.MaxBodyBytes != 10<<20 {
		t.Fatalf("defaults wrong: %+v", c)
	}
	if !c.DBSimpleProtocol {
		t.Fatal("port 6543 should default to the simple protocol")
	}
	if c.GoTrueURL != "https://ref.supabase.co/auth/v1" {
		t.Fatalf("trailing slash not trimmed: %q", c.GoTrueURL)
	}
	if c.DBSystemRole != "service_role" {
		t.Fatalf("system role default: %q", c.DBSystemRole)
	}
}

func TestFromEnvReportsEverything(t *testing.T) {
	_, err := FromEnv(env(map[string]string{"DB_MAX_CONNS": "-1", "DB_SYSTEM_ROLE": "bad role"}))
	if err == nil {
		t.Fatal("expected errors")
	}
	for _, want := range []string{"DATABASE_URL", "GOTRUE_URL", "ANON_KEY", "SERVICE_ROLE_KEY", "JWT_SECRET or JWKS_URL", "DB_MAX_CONNS", "DB_SYSTEM_ROLE"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("missing %q in %v", want, err)
		}
	}
}

func TestSystemRoleNone(t *testing.T) {
	c, err := FromEnv(env(map[string]string{
		"DATABASE_URL": "postgres://u:p@localhost:5432/x", "GOTRUE_URL": "http://localhost:9999",
		"ANON_KEY": "a", "SERVICE_ROLE_KEY": "s", "JWKS_URL": "http://localhost:9999/.well-known/jwks.json",
		"DB_SYSTEM_ROLE": "none", "APP_ENV": "development",
	}))
	if err != nil {
		t.Fatal(err)
	}
	if c.DBSystemRole != "" || c.DBSimpleProtocol {
		t.Fatalf("got %+v", c)
	}
}

func TestProductionRefusesLooseCORS(t *testing.T) {
	base := map[string]string{
		"DATABASE_URL": "postgres://u:p@localhost:5432/x", "GOTRUE_URL": "http://localhost:9999",
		"ANON_KEY": "a", "SERVICE_ROLE_KEY": "s", "JWT_SECRET": "x",
	}
	for origins, want := range map[string]string{
		"":                       "CORS_ALLOW_ORIGINS is required",
		"*":                      `may not be "*"`,
		"null":                   `may not admit "null"`,
		"http://pms.lyceum.lk":   "must use https",
		"https://pms.lyceum.lk/": "",
		"pms.lyceum.lk":          "is not an origin",
	} {
		m := map[string]string{}
		for k, v := range base {
			m[k] = v
		}
		m["CORS_ALLOW_ORIGINS"] = origins
		c, err := FromEnv(env(m))
		if want == "" {
			if err != nil || len(c.CORSAllowOrigins) != 1 || c.CORSAllowOrigins[0] != "https://pms.lyceum.lk" {
				t.Errorf("%q: %v %v", origins, c.CORSAllowOrigins, err)
			}
			continue
		}
		if err == nil || !strings.Contains(err.Error(), want) {
			t.Errorf("%q: want %q, got %v", origins, want, err)
		}
	}
	m := map[string]string{"APP_ENV": "development"}
	for k, v := range base {
		m[k] = v
	}
	c, err := FromEnv(env(m))
	if err != nil || c.CORSAllowOrigins[0] != "*" || c.HSTS {
		t.Fatalf("development default: %+v %v", c, err)
	}
}
