// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package auth

import (
	"context"
	"strings"
	"time"
)

// Verifier turns an Authorization header into a Principal.
//
// Resolution order mirrors the Supabase gateway plus PostgREST:
//  1. no bearer token → anonymous;
//  2. the configured anon key (compared as an opaque string, so a legacy anon JWT and a
//     new-style publishable key behave the same) → anonymous;
//  3. anything else must be a JWT signed with the project's secret (HS256) or one of its
//     published keys (ES256/RS256), unexpired, carrying the role to run as.
type Verifier struct {
	anonKey string
	secret  []byte
	jwks    *JWKS
	leeway  time.Duration
	// Now is the clock; tests replace it.
	Now func() time.Time
}

// NewVerifier builds a verifier. secret and jwksURL may each be empty; at least one must be
// set for user tokens to verify.
func NewVerifier(anonKey, secret, jwksURL string, leeway time.Duration) *Verifier {
	v := &Verifier{anonKey: anonKey, leeway: leeway, Now: time.Now}
	if secret != "" {
		v.secret = []byte(secret)
	}
	if jwksURL != "" {
		v.jwks = NewJWKS(jwksURL)
	}
	return v
}

// Resolve resolves a raw Authorization header value.
func (v *Verifier) Resolve(ctx context.Context, authorization string) (Principal, error) {
	token, ok := bearerToken(authorization)
	if !ok || token == "" {
		return Anon(), nil
	}
	if v.anonKey != "" && token == v.anonKey {
		return Anon(), nil
	}
	return v.Verify(ctx, token)
}

// Verify verifies a compact JWT.
func (v *Verifier) Verify(ctx context.Context, token string) (Principal, error) {
	return verifyCompact(token, func(h header) (any, error) {
		switch h.Alg {
		case "HS256":
			if len(v.secret) == 0 {
				return nil, ErrAlgorithm
			}
			return v.secret, nil
		case "ES256", "RS256":
			if v.jwks == nil {
				return nil, ErrAlgorithm
			}
			return v.jwks.Key(ctx, h.Kid)
		default:
			return nil, ErrAlgorithm
		}
	}, v.Now(), v.leeway)
}

// bearerToken extracts the token from "Bearer <token>", case-insensitively on the scheme.
func bearerToken(authorization string) (string, bool) {
	authorization = strings.TrimSpace(authorization)
	if len(authorization) < 7 || !strings.EqualFold(authorization[:7], "bearer ") {
		return "", false
	}
	return strings.TrimSpace(authorization[7:]), true
}
