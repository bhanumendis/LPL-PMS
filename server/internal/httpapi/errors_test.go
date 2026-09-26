// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package httpapi

import (
	"testing"

	"lpl-api/internal/auth"
)

func TestPgStatus(t *testing.T) {
	user := auth.Principal{Role: "authenticated"}
	anon := auth.Anon()
	cases := []struct {
		code string
		p    auth.Principal
		want int
	}{
		{"42501", user, 403},
		{"42501", anon, 401},
		{"P0001", user, 400},
		{"23505", user, 409},
		{"23503", user, 409},
		{"23502", user, 400},
		{"23514", user, 400},
		{"22P02", user, 400},
		{"42703", user, 400},
		{"42P01", user, 404},
		{"42883", user, 404},
		{"PT404", user, 404},
		{"PT999", user, 500},
		{"08006", user, 503},
		{"53300", user, 503},
		{"57014", user, 503},
		{"XX000", user, 500},
		{"P0002", user, 500},
		{"40001", user, 500},
	}
	for _, c := range cases {
		if got := pgStatus(c.code, c.p); got != c.want {
			t.Errorf("%s as %s: got %d want %d", c.code, c.p.Role, got, c.want)
		}
	}
}
