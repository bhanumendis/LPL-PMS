// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
//
// Package config reads the service configuration from the environment and fails fast on
// anything missing. There is no configuration file: the binary is meant to run in a
// container with secrets injected by the host.
package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Config is the complete runtime configuration of lpl-api.
type Config struct {
	// ListenAddr is the address the HTTP listener binds to (default ":8080").
	ListenAddr string
	// DatabaseURL is a pgx/libpq connection string. The role must be able to SET ROLE to
	// anon, authenticated and DBSystemRole (Supabase's postgres and authenticator roles can).
	DatabaseURL string
	// DBMaxConns caps the pool (default 8).
	DBMaxConns int32
	// DBSimpleProtocol disables prepared statements, which a transaction-mode pooler such
	// as Supavisor on port 6543 does not support. Defaults to true when the URL uses 6543.
	DBSimpleProtocol bool
	// DBSystemRole is the Postgres role for system work that must bypass the SQL guards
	// (default service_role). Empty means "do not switch role".
	DBSystemRole string
	// GoTrueURL is the base at which GoTrue's endpoints live, without a trailing slash:
	// https://<ref>.supabase.co/auth/v1 for a Supabase project, http://auth:9999 for a bare GoTrue.
	GoTrueURL string
	// AnonKey is the public key the browser presents (a legacy JWT or an sb_publishable_ key).
	AnonKey string
	// ServiceRoleKey authenticates the service to GoTrue's admin API. Never sent to a browser.
	ServiceRoleKey string
	// JWTSecret verifies HS256 user tokens (projects on the legacy shared secret).
	JWTSecret string
	// JWKSURL verifies ES256/RS256 user tokens (projects on asymmetric signing keys).
	JWKSURL string
	// JWTLeeway tolerates clock skew on exp/nbf. Default 0, as PostgREST.
	JWTLeeway time.Duration
	// RequestTimeout bounds every request (default 30s).
	RequestTimeout time.Duration
	// MaxBodyBytes bounds request bodies (default 10 MiB; a restore chunk is far smaller).
	MaxBodyBytes int64
	// CORSAllowOrigin is returned as Access-Control-Allow-Origin (default "*", as Supabase).
	CORSAllowOrigin string
}

var roleName = regexp.MustCompile(`^[a-z_][a-z0-9_]*$`)

// Load reads the configuration from the process environment.
func Load() (Config, error) { return FromEnv(os.Getenv) }

// FromEnv reads the configuration through the given lookup so tests can supply values.
// Every problem is reported at once rather than one per restart.
func FromEnv(get func(string) string) (Config, error) {
	var errs []error
	str := func(name, fallback string) string {
		if v := strings.TrimSpace(get(name)); v != "" {
			return v
		}
		return fallback
	}
	intv := func(name string, fallback int64) int64 {
		raw := strings.TrimSpace(get(name))
		if raw == "" {
			return fallback
		}
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || n < 0 {
			errs = append(errs, fmt.Errorf("%s must be a non-negative integer, got %q", name, raw))
			return fallback
		}
		return n
	}
	boolv := func(name string, fallback bool) bool {
		raw := strings.TrimSpace(get(name))
		if raw == "" {
			return fallback
		}
		b, err := strconv.ParseBool(raw)
		if err != nil {
			errs = append(errs, fmt.Errorf("%s must be true or false, got %q", name, raw))
			return fallback
		}
		return b
	}
	durv := func(name string, fallback time.Duration) time.Duration {
		raw := strings.TrimSpace(get(name))
		if raw == "" {
			return fallback
		}
		d, err := time.ParseDuration(raw)
		if err != nil || d < 0 {
			errs = append(errs, fmt.Errorf("%s must be a duration such as 30s, got %q", name, raw))
			return fallback
		}
		return d
	}

	c := Config{
		ListenAddr:      str("LISTEN_ADDR", ":8080"),
		DatabaseURL:     str("DATABASE_URL", ""),
		DBSystemRole:    str("DB_SYSTEM_ROLE", "service_role"),
		GoTrueURL:       strings.TrimRight(str("GOTRUE_URL", ""), "/"),
		AnonKey:         str("ANON_KEY", ""),
		ServiceRoleKey:  str("SERVICE_ROLE_KEY", ""),
		JWTSecret:       get("JWT_SECRET"), // taken verbatim: a secret may legitimately end in whitespace
		JWKSURL:         str("JWKS_URL", ""),
		CORSAllowOrigin: str("CORS_ALLOW_ORIGIN", "*"),
	}
	c.DBMaxConns = int32(intv("DB_MAX_CONNS", 8))
	c.DBSimpleProtocol = boolv("DB_SIMPLE_PROTOCOL", defaultSimpleProtocol(c.DatabaseURL))
	c.JWTLeeway = durv("JWT_LEEWAY", 0)
	c.RequestTimeout = durv("REQUEST_TIMEOUT", 30*time.Second)
	c.MaxBodyBytes = intv("MAX_BODY_BYTES", 10<<20)

	if c.DatabaseURL == "" {
		errs = append(errs, errors.New("DATABASE_URL is required"))
	}
	if c.GoTrueURL == "" {
		errs = append(errs, errors.New("GOTRUE_URL is required"))
	} else if _, err := url.ParseRequestURI(c.GoTrueURL); err != nil {
		errs = append(errs, fmt.Errorf("GOTRUE_URL is not a URL: %w", err))
	}
	if c.AnonKey == "" {
		errs = append(errs, errors.New("ANON_KEY is required"))
	}
	if c.ServiceRoleKey == "" {
		errs = append(errs, errors.New("SERVICE_ROLE_KEY is required"))
	}
	if c.JWTSecret == "" && c.JWKSURL == "" {
		errs = append(errs, errors.New("JWT_SECRET or JWKS_URL is required"))
	}
	if c.DBSystemRole == "none" {
		c.DBSystemRole = ""
	} else if !roleName.MatchString(c.DBSystemRole) {
		errs = append(errs, fmt.Errorf("DB_SYSTEM_ROLE %q is not a plain role name", c.DBSystemRole))
	}
	if c.DBMaxConns == 0 {
		c.DBMaxConns = 8
	}
	return c, errors.Join(errs...)
}

// defaultSimpleProtocol is true for Supabase's transaction-mode pooler port.
func defaultSimpleProtocol(dsn string) bool {
	u, err := url.Parse(dsn)
	if err != nil {
		return false
	}
	return u.Port() == "6543"
}
