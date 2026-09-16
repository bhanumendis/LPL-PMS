// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
//
// Package httpapi serves the wire contract the single-file frontend already speaks
// (src/lib/server.ts): the PostgREST subset on /rest/v1, GoTrue on /auth/v1 (proxied), and
// the admin-users function on /functions/v1. The frontend does not change; the database
// does not change; this package is the piece of Supabase's request path now owned in Go.
package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"lpl-api/internal/auth"
	"lpl-api/internal/config"
	"lpl-api/internal/db"
	"lpl-api/internal/gotrue"
)

// TokenResolver turns an Authorization header into a principal (see auth.Verifier).
type TokenResolver interface {
	Resolve(ctx context.Context, authorization string) (auth.Principal, error)
}

// Deps are the collaborators a Server needs.
type Deps struct {
	Config   config.Config
	Runner   db.Runner
	Resolver TokenResolver
	// GoTrue may be nil; admin-users then answers 500 "The function environment is
	// incomplete.", as the Edge Function did without its secrets.
	GoTrue gotrue.Admin
	Logger *slog.Logger
	// AuthProxy overrides the GoTrue reverse proxy (tests). Built from Config when nil.
	AuthProxy http.Handler
}

// Server holds the handlers.
type Server struct {
	cfg       config.Config
	runner    db.Runner
	resolver  TokenResolver
	gotrue    gotrue.Admin
	log       *slog.Logger
	authProxy http.Handler
}

// New validates the dependencies and builds a Server.
func New(d Deps) (*Server, error) {
	if d.Runner == nil {
		return nil, errors.New("httpapi: Runner is required")
	}
	if d.Resolver == nil {
		return nil, errors.New("httpapi: Resolver is required")
	}
	s := &Server{cfg: d.Config, runner: d.Runner, resolver: d.Resolver, gotrue: d.GoTrue, log: d.Logger, authProxy: d.AuthProxy}
	if s.log == nil {
		s.log = slog.Default()
	}
	if s.authProxy == nil {
		if d.Config.GoTrueURL == "" {
			s.authProxy = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				writeJSON(w, http.StatusBadGateway, map[string]any{"code": 502, "msg": "The identity provider is not configured."})
			})
		} else {
			p, err := newAuthProxy(d.Config.GoTrueURL, s.log)
			if err != nil {
				return nil, err
			}
			s.authProxy = p
		}
	}
	return s, nil
}

// Handler returns the routed, middleware-wrapped handler.
//
// Route table (Go 1.22 patterns). "/rest/v1/rpc/{fn}" and "/rest/v1/{table}" cannot match
// the same path because the wildcard spans exactly one segment.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.healthz)
	mux.HandleFunc("GET /readyz", s.readyz)
	mux.HandleFunc("POST /rest/v1/rpc/{fn}", s.rpc)
	mux.HandleFunc("GET /rest/v1/{table}", s.selectRows)
	mux.HandleFunc("POST /rest/v1/{table}", s.upsertRows)
	mux.HandleFunc("PATCH /rest/v1/{table}", s.patchRows)
	mux.HandleFunc("DELETE /rest/v1/{table}", s.deleteRows)
	mux.HandleFunc("/functions/v1/admin-users", s.adminUsers)
	mux.Handle("/auth/v1/", s.authProxy)

	var h http.Handler = mux
	h = s.apikeyGate(h)
	h = maxBody(h, s.cfg.MaxBodyBytes)
	h = withTimeout(h, s.cfg.RequestTimeout)
	h = cors(h, s.cfg.CORSAllowOrigin)
	h = logging(h, s.log)
	h = recoverer(h, s.log)
	h = requestID(h)
	return h
}

// principal resolves the caller for a /rest request, answering 401 in PostgREST's shape on
// failure. Only anon and authenticated may run on this listener: a service-role token is
// refused here even though PostgREST would accept it, because the browser never sends one.
func (s *Server) principal(w http.ResponseWriter, r *http.Request) (auth.Principal, bool) {
	p, err := s.resolver.Resolve(r.Context(), r.Header.Get("Authorization"))
	if err != nil {
		writePostgrest(w, http.StatusUnauthorized, "PGRST301", err.Error(), "", "")
		return p, false
	}
	if p.Role != "anon" && p.Role != "authenticated" {
		writePostgrest(w, http.StatusUnauthorized, "PGRST301", "role "+p.Role+" is not accepted on this listener", "", "")
		return p, false
	}
	return p, true
}
