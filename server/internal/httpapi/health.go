// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
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
