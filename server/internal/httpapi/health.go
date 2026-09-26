// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package httpapi

import (
	"context"
	"io"
	"net/http"

	"lpl-api/internal/db"
	"lpl-api/internal/schema"
)

// healthz says the process is up.
func (s *Server) healthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, "ok")
}

// version names the build and the schema it needs, for deploy smoke tests and support:
// {"revision": "<git sha>", "schema": "<migration version>"}.
func (s *Server) version(w http.ResponseWriter, _ *http.Request) {
	rev := s.revision
	if rev == "" {
		rev = "dev"
	}
	writeJSON(w, http.StatusOK, map[string]string{"revision": rev, "schema": schema.Required})
}

// readyz says the database answers and carries the schema this build needs (schema.Required).
func (s *Server) readyz(w http.ResponseWriter, r *http.Request) {
	var applied bool
	err := s.runner.WithSystem(r.Context(), func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select exists (select 1 from public.schema_migrations where version = $1)", schema.Required).Scan(&applied)
	})
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	switch {
	case err != nil:
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = io.WriteString(w, "database unavailable")
	case !applied:
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = io.WriteString(w, "database schema is behind: apply the migrations up to "+schema.Required)
	default:
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "ready")
	}
}
