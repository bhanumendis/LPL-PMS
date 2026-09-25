// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package httpapi

import (
	"context"
	"io"
	"net/http"

	"lpl-api/internal/db"
)

// healthz says the process is up.
func (s *Server) healthz(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, "ok")
}

// version names the build, for deploy smoke tests and support: {"revision": "<git sha>"}.
func (s *Server) version(w http.ResponseWriter, _ *http.Request) {
	rev := s.revision
	if rev == "" {
		rev = "dev"
	}
	writeJSON(w, http.StatusOK, map[string]string{"revision": rev})
}

// readyz says the database answers.
func (s *Server) readyz(w http.ResponseWriter, r *http.Request) {
	err := s.runner.WithSystem(r.Context(), func(ctx context.Context, ex db.Executor) error {
		var one int
		return ex.QueryRow(ctx, "select 1").Scan(&one)
	})
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = io.WriteString(w, "database unavailable")
		return
	}
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, "ready")
}
