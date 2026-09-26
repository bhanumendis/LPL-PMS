// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"

	"lpl-api/internal/auth"
	"lpl-api/internal/contract"
)

// postgrestError is PostgREST's error envelope. details and hint are null when absent.
type postgrestError struct {
	Code    string  `json:"code"`
	Details *string `json:"details"`
	Hint    *string `json:"hint"`
	Message string  `json:"message"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writePostgrest(w http.ResponseWriter, status int, code, message, hint, details string) {
	body := postgrestError{Code: code, Message: message}
	if hint != "" {
		body.Hint = &hint
	}
	if details != "" {
		body.Details = &details
	}
	writeJSON(w, status, body)
}

func writeGateway(w http.ResponseWriter, status int, message, hint string) {
	writeJSON(w, status, map[string]string{"message": message, "hint": hint})
}

func writeContractError(w http.ResponseWriter, e *contract.Error) {
	writePostgrest(w, e.Status, e.Code, e.Message, e.Hint, e.Details)
}

// writeDBError maps a database failure onto PostgREST's status and envelope. The Postgres
// message passes through verbatim: the frontend shows "message — hint" for every 4xx that
// is not 401/403, so the guard triggers' wording reaches the user unchanged.
func (s *Server) writeDBError(w http.ResponseWriter, r *http.Request, p auth.Principal, err error) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		writePostgrest(w, pgStatus(pgErr.Code, p), pgErr.Code, pgErr.Message, pgErr.Hint, pgErr.Detail)
		return
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		writePostgrest(w, http.StatusServiceUnavailable, "PGRST000", "database request timed out", "", "")
		return
	}
	s.log.Error("database", "request_id", RequestID(r.Context()), "error", err.Error())
	writePostgrest(w, http.StatusServiceUnavailable, "PGRST001", "database unavailable", "", "")
}

// pgStatus is PostgREST's SQLSTATE → HTTP mapping for the codes this schema can raise.
func pgStatus(code string, p auth.Principal) int {
	switch {
	case code == "42501": // insufficient_privilege, including a row-level security refusal
		if p.Anonymous || p.Role == "anon" {
			return http.StatusUnauthorized
		}
		return http.StatusForbidden
	case code == "23505", code == "23503": // unique / foreign key
		return http.StatusConflict
	case code == "42P01", code == "42883": // undefined table / function
		return http.StatusNotFound
	case code == "P0001": // raise exception in a guard trigger or function
		return http.StatusBadRequest
	case strings.HasPrefix(code, "PT") && len(code) == 5: // raise ... using errcode = 'PT4xx'
		if n, err := strconv.Atoi(code[2:]); err == nil && n >= 100 && n <= 599 {
			return n
		}
		return http.StatusInternalServerError
	case strings.HasPrefix(code, "08"), strings.HasPrefix(code, "53"), code == "57014", code == "57P01":
		return http.StatusServiceUnavailable
	case strings.HasPrefix(code, "2D"), strings.HasPrefix(code, "38"), strings.HasPrefix(code, "39"),
		strings.HasPrefix(code, "3B"), strings.HasPrefix(code, "40"), strings.HasPrefix(code, "55"),
		strings.HasPrefix(code, "57"), strings.HasPrefix(code, "58"), strings.HasPrefix(code, "XX"),
		strings.HasPrefix(code, "P0"):
		return http.StatusInternalServerError
	default: // 22xxx data exceptions, 23xxx other constraints, 42xxx syntax, and so on
		return http.StatusBadRequest
	}
}
