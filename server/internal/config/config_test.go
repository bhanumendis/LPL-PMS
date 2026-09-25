// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package config

import (
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
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

func baseEnv(extra map[string]string) func(string) string {
	m := map[string]string{
		"DATABASE_URL": "postgres://u:p@localhost:5432/x", "GOTRUE_URL": "http://localhost:9999",
		"ANON_KEY": "a", "SERVICE_ROLE_KEY": "s", "JWT_SECRET": "x", "CORS_ALLOW_ORIGINS": "https://pms.lyceum.lk",
	}
	for k, v := range extra {
		m[k] = v
	}
	return env(m)
}

// vapidPair makes a throwaway key pair in the form web-push generate-vapid-keys prints.
func vapidPair(t *testing.T) (string, string) {
	t.Helper()
	k, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return base64.RawURLEncoding.EncodeToString(k.PublicKey().Bytes()), base64.RawURLEncoding.EncodeToString(k.Bytes())
}

func TestWorkerDefaultsAndPushOffWithoutKeys(t *testing.T) {
	c, err := FromEnv(baseEnv(nil))
	if err != nil {
		t.Fatal(err)
	}
	if !c.Workers || c.PushInterval != 10*time.Second || c.SLAInterval != 15*time.Minute || c.DashboardInterval != time.Minute ||
		c.PruneInterval != 6*time.Hour || c.NotificationRetentionDays != 90 || c.VAPIDPublicKey != "" || len(c.PushHosts) != 0 {
		t.Fatalf("worker defaults: %+v", c)
	}
	c, err = FromEnv(baseEnv(map[string]string{"WORKERS": "false", "SLA_REMINDER_INTERVAL": "0", "PUSH_ENDPOINT_HOSTS": "fcm.googleapis.com, Push.Apple.com"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Workers || c.SLAInterval != 0 || strings.Join(c.PushHosts, ",") != "fcm.googleapis.com,push.apple.com" {
		t.Fatalf("got %+v", c)
	}
}

func TestVAPIDIsAllOrNothingAndChecked(t *testing.T) {
	pub, priv := vapidPair(t)
	other, _ := vapidPair(t)
	ok := map[string]string{"VAPID_PUBLIC_KEY": pub, "VAPID_PRIVATE_KEY": priv, "VAPID_SUBJECT": "mailto:it@lyceum.lk"}
	if _, err := FromEnv(baseEnv(ok)); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]map[string]string{
		"no private key":   {"VAPID_PRIVATE_KEY": ""},
		"no subject":       {"VAPID_SUBJECT": ""},
		"wrong public key": {"VAPID_PUBLIC_KEY": other},
		"garbage private":  {"VAPID_PRIVATE_KEY": "not-a-key"},
	} {
		m := map[string]string{}
		for k, v := range ok {
			m[k] = v
		}
		for k, v := range change {
			m[k] = v
		}
		if _, err := FromEnv(baseEnv(m)); err == nil || !strings.Contains(err.Error(), "VAPID") {
			t.Errorf("%s: %v", name, err)
		}
	}
	for _, bad := range []map[string]string{
		{"NOTIFICATION_RETENTION_DAYS": "3"},
		{"PUSH_INTERVAL": "10ms"},
		{"PUSH_ENDPOINT_HOSTS": "https://fcm.googleapis.com"},
		{"PUSH_ENDPOINT_HOSTS": "localhost"},
	} {
		if _, err := FromEnv(baseEnv(bad)); err == nil {
			t.Errorf("%v accepted", bad)
		}
	}
}
