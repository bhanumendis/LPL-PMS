// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
//
// Package auth resolves the caller of a request to a Postgres role and a set of JWT
// claims, exactly as PostgREST does: the bearer token decides everything, and the
// database (row-level security, triggers) does the rest.
package auth

// Principal is the verified identity of a request.
type Principal struct {
	// Anonymous is true when the caller presented the anon key or no credential.
	Anonymous bool
	// Role is the Postgres role the request runs as: "anon" or "authenticated".
	Role string
	// Sub is the GoTrue user id (auth.users.id); empty for anonymous callers.
	Sub string
	// ClaimsJSON is the verified JWT payload as sent, or {"role":"anon"} for the anon key.
	// It is installed as request.jwt.claims so auth.uid() and friends see what they expect.
	ClaimsJSON string
}

// Anon is the principal of an unauthenticated request.
func Anon() Principal {
	return Principal{Anonymous: true, Role: "anon", ClaimsJSON: `{"role":"anon"}`}
}

// Error is a token problem. Its text is returned to the client in PostgREST's error
// envelope (code PGRST301); the frontend shows one generic message for any 401.
type Error struct{ Message string }

func (e *Error) Error() string { return e.Message }

// Named token errors.
var (
	ErrMalformed   = &Error{"Invalid JWT"}
	ErrSignature   = &Error{"JWSError JWSInvalidSignature"}
	ErrExpired     = &Error{"JWT expired"}
	ErrNotYetValid = &Error{"JWT not yet valid"}
	ErrAlgorithm   = &Error{"JWT algorithm not accepted"}
	ErrUnknownKey  = &Error{"JWT signing key not found"}
)
