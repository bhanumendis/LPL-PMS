// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"sort"

	"lpl-api/internal/contract"
	"lpl-api/internal/db"
)

// rpc serves POST /rest/v1/rpc/{fn}. Arguments arrive as a JSON object keyed by parameter
// name; the set of keys must match the function's parameters exactly, otherwise PostgREST
// (and this façade) answers 404 because no function with that signature exists.
func (s *Server) rpc(w http.ResponseWriter, r *http.Request) {
	p, ok := s.principal(w, r)
	if !ok {
		return
	}
	name := r.PathValue("fn")
	fn, known := contract.Functions[name]
	body, ok := readBody(w, r)
	if !ok {
		return
	}
	argMap := map[string]json.RawMessage{}
	if trimmed := bytes.TrimSpace(body); len(trimmed) > 0 {
		if err := json.Unmarshal(trimmed, &argMap); err != nil {
			writeContractError(w, invalidJSON())
			return
		}
	}
	names := make([]string, 0, len(argMap))
	for k := range argMap {
		names = append(names, k)
	}
	sort.Strings(names)
	if !known || !sameSet(names, fn.Params) {
		writeContractError(w, contract.UnknownFunction(name, names))
		return
	}
	args := make([]any, 0, len(fn.Params))
	for _, param := range fn.Params {
		v, err := jsonScalar(argMap[param])
		if err != nil {
			writeContractError(w, invalidJSON())
			return
		}
		args = append(args, v)
	}
	stmt := buildRPC(fn)
	var out *string
	err := s.runner.WithUser(r.Context(), p, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, stmt, args...).Scan(&out)
	})
	if err != nil {
		s.writeDBError(w, r, p, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	if out == nil {
		_, _ = io.WriteString(w, "null")
		return
	}
	_, _ = io.WriteString(w, *out)
}

func sameSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	bs := append([]string(nil), b...)
	sort.Strings(bs)
	for i := range a {
		if a[i] != bs[i] {
			return false
		}
	}
	return true
}

// jsonScalar converts a JSON argument into the text value handed to a text parameter:
// strings are unquoted, null becomes SQL NULL, anything else is passed as its JSON text.
func jsonScalar(raw json.RawMessage) (any, error) {
	t := bytes.TrimSpace(raw)
	if len(t) == 0 || bytes.Equal(t, []byte("null")) {
		return nil, nil
	}
	if t[0] == '"' {
		var s string
		if err := json.Unmarshal(t, &s); err != nil {
			return nil, err
		}
		return s, nil
	}
	return string(t), nil
}
