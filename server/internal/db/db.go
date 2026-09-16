// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
//
// Package db owns the Postgres pool and, more importantly, the one rule that keeps the
// database's security model intact: every user request runs inside a transaction that has
// switched to the caller's Postgres role and installed the caller's JWT claims, exactly as
// PostgREST does. Without that switch, auth.uid() is null, is_system_caller() is true and
// every guard trigger in supabase/schema.sql stands aside.
package db

import (
	"context"
	"errors"
	"fmt"
	"regexp"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpl-api/internal/auth"
)

// Executor is the subset of pgx.Tx the handlers use. Keeping it small lets the unit tests
// substitute a fake without a database.
type Executor interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Runner runs a function inside a transaction prepared for either a user or the system.
type Runner interface {
	// WithUser switches to the principal's role (anon or authenticated) and installs the
	// claims before calling fn. The transaction commits when fn returns nil.
	WithUser(ctx context.Context, p auth.Principal, fn func(context.Context, Executor) error) error
	// WithSystem switches to the system role with no claims, so the guards see a system
	// caller (as the service role and GoTrue do). Use it only for work the Edge Function
	// did with the service key.
	WithSystem(ctx context.Context, fn func(context.Context, Executor) error) error
}

// Pool is the production Runner.
type Pool struct {
	pool       *pgxpool.Pool
	systemRole string
}

var roleName = regexp.MustCompile(`^[a-z_][a-z0-9_]*$`)

// Open connects to Postgres. simpleProtocol must be true behind a transaction-mode pooler.
// systemRole is the role for WithSystem; empty means "stay on the connection's role".
func Open(ctx context.Context, dsn string, maxConns int32, simpleProtocol bool, systemRole string) (*Pool, error) {
	if systemRole != "" && !roleName.MatchString(systemRole) {
		return nil, fmt.Errorf("system role %q is not a plain role name", systemRole)
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	if maxConns > 0 {
		cfg.MaxConns = maxConns
	}
	if simpleProtocol {
		cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	return &Pool{pool: pool, systemRole: systemRole}, nil
}

// Close releases the pool.
func (p *Pool) Close() { p.pool.Close() }

// Ping checks the connection for readiness probes.
func (p *Pool) Ping(ctx context.Context) error { return p.pool.Ping(ctx) }

// Raw exposes the pool for tooling and tests that need more than Executor.
func (p *Pool) Raw() *pgxpool.Pool { return p.pool }

// WithUser implements Runner.
func (p *Pool) WithUser(ctx context.Context, principal auth.Principal, fn func(context.Context, Executor) error) error {
	role := "authenticated"
	if principal.Anonymous || principal.Role == "anon" {
		role = "anon"
	} else if principal.Role != "authenticated" {
		// The public listener never lets another role through; this is a programming error.
		return fmt.Errorf("role %q may not run user requests", principal.Role)
	}
	claims := principal.ClaimsJSON
	if claims == "" {
		claims = `{"role":"` + role + `"}`
	}
	return p.tx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, "set local role "+role); err != nil {
			return fmt.Errorf("set role %s: %w", role, err)
		}
		// Both spellings: auth.uid() has read request.jwt.claim.sub on older projects and
		// request.jwt.claims ->> 'sub' on current ones.
		if _, err := tx.Exec(ctx,
			"select set_config('request.jwt.claims', $1::text, true), set_config('request.jwt.claim.sub', $2::text, true), set_config('request.jwt.claim.role', $3::text, true)",
			claims, principal.Sub, role); err != nil {
			return fmt.Errorf("install claims: %w", err)
		}
		return fn(ctx, tx)
	})
}

// WithSystem implements Runner.
func (p *Pool) WithSystem(ctx context.Context, fn func(context.Context, Executor) error) error {
	return p.tx(ctx, func(ctx context.Context, tx pgx.Tx) error {
		if p.systemRole != "" {
			if _, err := tx.Exec(ctx, "set local role "+pgx.Identifier{p.systemRole}.Sanitize()); err != nil {
				return fmt.Errorf("set role %s: %w", p.systemRole, err)
			}
		}
		// Make the absence of a caller explicit even if a pooled session carried something.
		if _, err := tx.Exec(ctx,
			"select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', '', true)"); err != nil {
			return fmt.Errorf("clear claims: %w", err)
		}
		return fn(ctx, tx)
	})
}

func (p *Pool) tx(ctx context.Context, fn func(context.Context, pgx.Tx) error) (err error) {
	tx, err := p.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback(ctx)
		}
	}()
	if err = fn(ctx, tx); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// IsNoRows reports whether err is pgx's "no rows" sentinel.
func IsNoRows(err error) bool { return errors.Is(err, pgx.ErrNoRows) }
