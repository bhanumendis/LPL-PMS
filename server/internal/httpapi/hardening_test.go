// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package httpapi

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSecurityHeadersOnEveryResponse(t *testing.T) {
	e := newEnv(t, func(d *Deps) { d.Config.HSTS = true })
	for _, target := range []string{"/healthz", "/rest/v1/cases?select=*", "/rest/v1/nope"} {
		h := e.do(http.MethodGet, target, "admin-token", "", nil).Header()
		for k, want := range map[string]string{
			"X-Content-Type-Options":    "nosniff",
			"X-Frame-Options":           "DENY",
			"Referrer-Policy":           "no-referrer",
			"Cache-Control":             "no-store",
			"Content-Security-Policy":   "default-src 'none'; frame-ancestors 'none'",
			"Strict-Transport-Security": "max-age=63072000; includeSubDomains",
		} {
			if got := h.Get(k); got != want {
				t.Errorf("%s %s = %q, want %q", target, k, got, want)
			}
		}
	}
	if h := newEnv(t).do(http.MethodGet, "/healthz", "", "", nil).Header(); h.Get("Strict-Transport-Security") != "" {
		t.Fatal("HSTS must follow the configuration")
	}
}

func TestCORSAdmitsOnlyConfiguredOrigins(t *testing.T) {
	e := newEnv(t, func(d *Deps) { d.Config.CORSAllowOrigins = []string{"https://pms.lyceum.lk"} })
	ok := e.do(http.MethodGet, "/rest/v1/cases?select=*", "admin-token", "", map[string]string{"Origin": "https://pms.lyceum.lk"})
	if ok.Header().Get("Access-Control-Allow-Origin") != "https://pms.lyceum.lk" || !strings.Contains(ok.Header().Get("Vary"), "Origin") {
		t.Fatalf("allowed origin not echoed: %v", ok.Header())
	}
	bad := e.do(http.MethodGet, "/rest/v1/cases?select=*", "admin-token", "", map[string]string{"Origin": "https://evil.example"})
	if bad.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("a foreign origin must get no CORS headers")
	}
	pre := e.do(http.MethodOptions, "/rest/v1/cases", "", "", map[string]string{"Origin": "https://evil.example", "apikey": ""})
	if pre.Code != http.StatusForbidden {
		t.Fatalf("foreign preflight: %d", pre.Code)
	}
	pre = e.do(http.MethodOptions, "/rest/v1/cases", "", "", map[string]string{"Origin": "https://pms.lyceum.lk", "apikey": ""})
	if pre.Code != http.StatusNoContent || pre.Header().Get("Access-Control-Allow-Origin") != "https://pms.lyceum.lk" {
		t.Fatalf("allowed preflight: %d %v", pre.Code, pre.Header())
	}
}

func TestPasswordSignInIsRateLimited(t *testing.T) {
	e := newEnv(t, func(d *Deps) { d.Config.RateAuthPerMinute = 3 })
	for i := 0; i < 3; i++ {
		if r := e.do(http.MethodPost, "/auth/v1/token?grant_type=password", "", `{}`, nil); r.Code != http.StatusOK {
			t.Fatalf("attempt %d: %d", i, r.Code)
		}
	}
	r := e.do(http.MethodPost, "/auth/v1/token?grant_type=password", "", `{}`, nil)
	if r.Code != http.StatusTooManyRequests || r.Header().Get("Retry-After") == "" {
		t.Fatalf("4th attempt: %d %v", r.Code, r.Header())
	}
	mustContain(t, r.Body.String(), `"code":429`)
	// Refreshing a token is not a guess at a password and spends nothing.
	for i := 0; i < 5; i++ {
		if r := e.do(http.MethodPost, "/auth/v1/token?grant_type=refresh_token", "", `{}`, nil); r.Code != http.StatusOK {
			t.Fatalf("refresh %d: %d", i, r.Code)
		}
	}
}

func TestDataAPIRateLimitSpeaksPostgrest(t *testing.T) {
	e := newEnv(t, func(d *Deps) { d.Config.RateAPIPerMinute = 1 })
	e.do(http.MethodGet, "/rest/v1/cases?select=*", "admin-token", "", nil)
	r := e.do(http.MethodGet, "/rest/v1/cases?select=*", "admin-token", "", nil)
	if r.Code != http.StatusTooManyRequests {
		t.Fatalf("status %d", r.Code)
	}
	mustContain(t, r.Body.String(), `"code":"PGRST429"`)
}

func TestClientIPTrustsOnlyConfiguredHops(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	r.RemoteAddr = "10.0.0.9:5555"
	r.Header.Set("X-Forwarded-For", "1.1.1.1, 2.2.2.2")
	if got := clientIP(r, 0); got != "10.0.0.9" {
		t.Fatalf("no trusted proxy: %s", got)
	}
	if got := clientIP(r, 1); got != "2.2.2.2" {
		t.Fatalf("one hop: %s", got)
	}
	if got := clientIP(r, 3); got != "10.0.0.9" {
		t.Fatalf("fewer entries than hops must fall back to the peer: %s", got)
	}
}
