// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

const secret = "test-secret-with-at-least-32-characters-long"

func mint(t *testing.T, claims map[string]any) string {
	t.Helper()
	tok, err := SignHS256(claims, []byte(secret))
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

func TestResolveAnon(t *testing.T) {
	v := NewVerifier("anon-key", secret, "", 0)
	for _, h := range []string{"", "Bearer anon-key", "bearer anon-key", "Basic xyz"} {
		p, err := v.Resolve(context.Background(), h)
		if err != nil || !p.Anonymous || p.Role != "anon" || p.ClaimsJSON != `{"role":"anon"}` {
			t.Fatalf("%q: got %+v, %v", h, p, err)
		}
	}
}

func TestVerifyHS256(t *testing.T) {
	v := NewVerifier("anon-key", secret, "", 0)
	now := time.Date(2026, 9, 11, 12, 0, 0, 0, time.UTC)
	v.Now = func() time.Time { return now }
	tok := mint(t, map[string]any{"role": "authenticated", "sub": "u1", "exp": now.Add(time.Hour).Unix(), "aud": "authenticated"})
	p, err := v.Resolve(context.Background(), "Bearer "+tok)
	if err != nil {
		t.Fatal(err)
	}
	if p.Anonymous || p.Role != "authenticated" || p.Sub != "u1" {
		t.Fatalf("got %+v", p)
	}
	var back map[string]any
	if err := json.Unmarshal([]byte(p.ClaimsJSON), &back); err != nil || back["aud"] != "authenticated" {
		t.Fatalf("claims not passed through: %s", p.ClaimsJSON)
	}
}

func TestVerifyRejects(t *testing.T) {
	v := NewVerifier("anon-key", secret, "", 0)
	now := time.Date(2026, 9, 11, 12, 0, 0, 0, time.UTC)
	v.Now = func() time.Time { return now }
	cases := map[string]struct {
		token string
		want  *Error
	}{
		"expired":   {mint(t, map[string]any{"role": "authenticated", "exp": now.Add(-time.Second).Unix()}), ErrExpired},
		"at expiry": {mint(t, map[string]any{"role": "authenticated", "exp": now.Unix()}), ErrExpired},
		"nbf":       {mint(t, map[string]any{"role": "authenticated", "nbf": now.Add(time.Minute).Unix()}), ErrNotYetValid},
		"garbage":   {"not.a.jwt", ErrMalformed},
		"two parts": {"a.b", ErrMalformed},
	}
	other, _ := SignHS256(map[string]any{"role": "authenticated"}, []byte("another secret entirely, also long"))
	cases["wrong secret"] = struct {
		token string
		want  *Error
	}{other, ErrSignature}
	for name, c := range cases {
		_, err := v.Resolve(context.Background(), "Bearer "+c.token)
		if err != c.want {
			t.Errorf("%s: got %v, want %v", name, err, c.want)
		}
	}
}

func TestLeeway(t *testing.T) {
	v := NewVerifier("anon-key", secret, "", 30*time.Second)
	now := time.Date(2026, 9, 11, 12, 0, 0, 0, time.UTC)
	v.Now = func() time.Time { return now }
	tok := mint(t, map[string]any{"role": "authenticated", "exp": now.Add(-10 * time.Second).Unix()})
	if _, err := v.Resolve(context.Background(), "Bearer "+tok); err != nil {
		t.Fatalf("within leeway should verify: %v", err)
	}
}

func TestMissingRoleIsAnon(t *testing.T) {
	v := NewVerifier("anon-key", secret, "", 0)
	tok := mint(t, map[string]any{"sub": "x"})
	p, err := v.Resolve(context.Background(), "Bearer "+tok)
	if err != nil || !p.Anonymous || p.Role != "anon" {
		t.Fatalf("got %+v %v", p, err)
	}
}

func TestVerifyES256ViaJWKS(t *testing.T) {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	b64 := func(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }
	x := priv.PublicKey.X.FillBytes(make([]byte, 32))
	y := priv.PublicKey.Y.FillBytes(make([]byte, 32))
	fetches := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fetches++
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"keys": []map[string]string{{"kty": "EC", "crv": "P-256", "kid": "k1", "alg": "ES256", "x": b64(x), "y": b64(y)}}})
	}))
	defer srv.Close()

	head := b64([]byte(`{"alg":"ES256","typ":"JWT","kid":"k1"}`))
	payload := b64([]byte(`{"role":"authenticated","sub":"u2","exp":4102444800}`))
	sum := sha256.Sum256([]byte(head + "." + payload))
	r, s, err := ecdsa.Sign(rand.Reader, priv, sum[:])
	if err != nil {
		t.Fatal(err)
	}
	sig := append(r.FillBytes(make([]byte, 32)), s.FillBytes(make([]byte, 32))...)
	tok := head + "." + payload + "." + b64(sig)

	v := NewVerifier("anon-key", "", srv.URL, 0)
	p, err := v.Resolve(context.Background(), "Bearer "+tok)
	if err != nil {
		t.Fatal(err)
	}
	if p.Sub != "u2" || p.Role != "authenticated" {
		t.Fatalf("got %+v", p)
	}
	// Second verification is served from the cache.
	if _, err := v.Resolve(context.Background(), "Bearer "+tok); err != nil || fetches != 1 {
		t.Fatalf("cache miss: fetches=%d err=%v", fetches, err)
	}
	// Unknown kid inside the refresh floor does not refetch.
	head2 := b64([]byte(`{"alg":"ES256","typ":"JWT","kid":"k2"}`))
	if _, err := v.Resolve(context.Background(), "Bearer "+head2+"."+payload+"."+b64(sig)); err != ErrUnknownKey || fetches != 1 {
		t.Fatalf("unknown kid: err=%v fetches=%d", err, fetches)
	}
	// HS256 is refused when no secret is configured.
	if _, err := v.Resolve(context.Background(), "Bearer "+mint(t, map[string]any{"role": "authenticated"})); err != ErrAlgorithm {
		t.Fatalf("HS256 without secret: %v", err)
	}
}
