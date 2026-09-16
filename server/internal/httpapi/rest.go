// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"sort"

	"lpl-api/internal/contract"
	"lpl-api/internal/db"
)

func invalidJSON() *contract.Error {
	return &contract.Error{Status: 400, Code: "PGRST102", Message: "Empty or invalid json request body"}
}

// readBody reads a bounded request body.
func readBody(w http.ResponseWriter, r *http.Request) ([]byte, bool) {
	b, err := io.ReadAll(r.Body)
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			writePostgrest(w, http.StatusRequestEntityTooLarge, "PGRST102", "request body too large", "", "")
			return nil, false
		}
		writePostgrest(w, http.StatusBadRequest, "PGRST102", "could not read request body", "", "")
		return nil, false
	}
	return b, true
}

// rows is a parsed write payload.
type rows struct {
	// Array is the payload as a JSON array (a single object is wrapped).
	Array []byte
	// Objects are the individual records.
	Objects []json.RawMessage
	// Columns are the keys of the first object, sorted, all verified against the table.
	Columns []string
}

// parseRows accepts a JSON array of objects or a single object, as PostgREST does, and
// requires every object to carry the same keys (PostgREST: "All object keys must match").
func parseRows(t contract.Table, body []byte) (rows, *contract.Error) {
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return rows{}, invalidJSON()
	}
	var out rows
	switch trimmed[0] {
	case '[':
		if err := json.Unmarshal(trimmed, &out.Objects); err != nil {
			return rows{}, invalidJSON()
		}
		out.Array = trimmed
	case '{':
		out.Objects = []json.RawMessage{trimmed}
		out.Array = append(append([]byte{'['}, trimmed...), ']')
	default:
		return rows{}, invalidJSON()
	}
	if len(out.Objects) == 0 {
		out.Array = []byte("[]")
		return out, nil
	}
	var first map[string]json.RawMessage
	if err := json.Unmarshal(out.Objects[0], &first); err != nil {
		return rows{}, invalidJSON()
	}
	for k := range first {
		if _, ok := t.Column(k); !ok {
			return rows{}, contract.UnknownColumn(t.Name, k)
		}
		out.Columns = append(out.Columns, k)
	}
	sort.Strings(out.Columns)
	for _, o := range out.Objects[1:] {
		var m map[string]json.RawMessage
		if err := json.Unmarshal(o, &m); err != nil {
			return rows{}, invalidJSON()
		}
		if len(m) != len(first) {
			return rows{}, &contract.Error{Status: 400, Code: "PGRST102", Message: "All object keys must match"}
		}
		for k := range m {
			if _, ok := first[k]; !ok {
				return rows{}, &contract.Error{Status: 400, Code: "PGRST102", Message: "All object keys must match"}
			}
		}
	}
	return out, nil
}

// minimalOnly refuses representation requests: the frontend never asks for one, and
// answering it would widen the surface.
func minimalOnly(w http.ResponseWriter, p contract.Prefer) bool {
	if p.Return != "" && p.Return != "minimal" {
		writePostgrest(w, http.StatusBadRequest, "PGRST100", "the lpl-api façade supports Prefer: return=minimal only", "", "")
		return false
	}
	return true
}

// selectRows serves GET /rest/v1/{table}.
func (s *Server) selectRows(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	q, qerr := contract.ParseQuery(r.PathValue("table"), r.URL.Query())
	if qerr != nil {
		writeContractError(w, qerr)
		return
	}
	stmt, args, berr := buildSelect(q)
	if berr != nil {
		writeContractError(w, berr)
		return
	}
	var n int
	var body string
	err := s.runner.WithUser(r.Context(), p, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, stmt, args...).Scan(&n, &body)
	})
	if err != nil {
		s.writeDBError(w, r, p, err)
		return
	}
	h := w.Header()
	h.Set("Content-Type", "application/json; charset=utf-8")
	h.Set("Content-Range", contentRange(n))
	w.WriteHeader(http.StatusOK)
	_, _ = io.WriteString(w, body)
}

// upsertRows serves POST /rest/v1/{table}.
func (s *Server) upsertRows(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	q, qerr := contract.ParseQuery(r.PathValue("table"), r.URL.Query())
	if qerr != nil {
		writeContractError(w, qerr)
		return
	}
	prefer := contract.ParsePrefer(r.Header.Get("Prefer"))
	if !minimalOnly(w, prefer) {
		return
	}
	body, ok := readBody(w, r)
	if !ok {
		return
	}
	rs, perr := parseRows(q.Table, body)
	if perr != nil {
		writeContractError(w, perr)
		return
	}
	if len(rs.Objects) == 0 {
		w.Header().Set("Content-Range", "*/*")
		w.WriteHeader(http.StatusCreated)
		return
	}
	stmt, berr := buildUpsert(q.Table, rs.Columns, q.OnConflict, prefer.Resolution)
	if berr != nil {
		writeContractError(w, berr)
		return
	}
	err := s.runner.WithUser(r.Context(), p, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, stmt, string(rs.Array))
		return err
	})
	if err != nil {
		s.writeDBError(w, r, p, err)
		return
	}
	w.Header().Set("Content-Range", "*/*")
	w.WriteHeader(http.StatusCreated)
}

// patchRows serves PATCH /rest/v1/{table}. A filter is mandatory: PostgREST would update
// every row without one, and the frontend always filters by id.
func (s *Server) patchRows(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	q, qerr := contract.ParseQuery(r.PathValue("table"), r.URL.Query())
	if qerr != nil {
		writeContractError(w, qerr)
		return
	}
	if len(q.Filters) == 0 {
		writePostgrest(w, http.StatusBadRequest, "PGRST100", "PATCH requires at least one filter", "", "")
		return
	}
	prefer := contract.ParsePrefer(r.Header.Get("Prefer"))
	if !minimalOnly(w, prefer) {
		return
	}
	body, ok := readBody(w, r)
	if !ok {
		return
	}
	rs, perr := parseRows(q.Table, body)
	if perr != nil {
		writeContractError(w, perr)
		return
	}
	if len(rs.Objects) != 1 {
		writePostgrest(w, http.StatusBadRequest, "PGRST102", "PATCH takes a single JSON object", "", "")
		return
	}
	stmt, args, berr := buildPatch(q.Table, rs.Columns, q.Filters)
	if berr != nil {
		writeContractError(w, berr)
		return
	}
	args = append([]any{string(rs.Objects[0])}, args...)
	err := s.runner.WithUser(r.Context(), p, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, stmt, args...)
		return err
	})
	if err != nil {
		s.writeDBError(w, r, p, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// deleteRows serves DELETE /rest/v1/{table}; a filter is mandatory for the same reason.
func (s *Server) deleteRows(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	q, qerr := contract.ParseQuery(r.PathValue("table"), r.URL.Query())
	if qerr != nil {
		writeContractError(w, qerr)
		return
	}
	if len(q.Filters) == 0 {
		writePostgrest(w, http.StatusBadRequest, "PGRST100", "DELETE requires at least one filter", "", "")
		return
	}
	if !minimalOnly(w, contract.ParsePrefer(r.Header.Get("Prefer"))) {
		return
	}
	stmt, args, berr := buildDelete(q.Table, q.Filters)
	if berr != nil {
		writeContractError(w, berr)
		return
	}
	err := s.runner.WithUser(r.Context(), p, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, stmt, args...)
		return err
	})
	if err != nil {
		s.writeDBError(w, r, p, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
