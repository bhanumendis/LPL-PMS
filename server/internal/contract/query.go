// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package contract

import (
	"fmt"
	"net/url"
	"sort"
	"strconv"
	"strings"
)

// FilterOp is a PostgREST filter operator the frontend uses.
type FilterOp string

// Supported operators. src/lib/server.ts sends eq (by id or auth_id) and neq (id=neq.__none__).
const (
	OpEq  FilterOp = "eq"
	OpNeq FilterOp = "neq"
	OpIs  FilterOp = "is"
)

// Filter is one "column=op.value" query parameter.
type Filter struct {
	Column Column
	Op     FilterOp
	Value  string
}

// OrderTerm is one element of "order=col.desc.nullslast".
type OrderTerm struct {
	Column Column
	Desc   bool
	Nulls  string // "", "first" or "last"
}

// Query is a parsed /rest/v1/{table} request.
type Query struct {
	Table      Table
	Filters    []Filter
	Order      []OrderTerm
	Limit      *int
	Offset     *int
	OnConflict []string
}

// ParseQuery validates the query string of a table request against the allow-list.
// Parameters are visited in sorted order so the generated SQL is deterministic.
func ParseQuery(tableName string, values url.Values) (Query, *Error) {
	t, ok := Tables[tableName]
	if !ok {
		return Query{}, UnknownTable(tableName)
	}
	q := Query{Table: t}
	keys := make([]string, 0, len(values))
	for k := range values {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	for _, key := range keys {
		vals := values[key]
		v := ""
		if len(vals) > 0 {
			v = vals[len(vals)-1]
		}
		switch key {
		case "select":
			if v != "" && v != "*" {
				return Query{}, &Error{Status: 400, Code: "PGRST100", Message: "the lpl-api façade supports select=* only", Hint: "got select=" + v}
			}
		case "order":
			terms, err := parseOrder(t, v)
			if err != nil {
				return Query{}, err
			}
			q.Order = terms
		case "limit":
			n, err := parseNonNegative(key, v)
			if err != nil {
				return Query{}, err
			}
			q.Limit = &n
		case "offset":
			n, err := parseNonNegative(key, v)
			if err != nil {
				return Query{}, err
			}
			q.Offset = &n
		case "on_conflict":
			for _, c := range strings.Split(v, ",") {
				c = strings.TrimSpace(c)
				if _, ok := t.Column(c); !ok {
					return Query{}, UnknownColumn(t.Name, c)
				}
				q.OnConflict = append(q.OnConflict, c)
			}
		case "apikey":
			// The gateway credential may travel as a query parameter; it is checked upstream.
		default:
			f, err := parseFilter(t, key, v)
			if err != nil {
				return Query{}, err
			}
			q.Filters = append(q.Filters, f)
		}
	}
	return q, nil
}

func parseNonNegative(name, v string) (int, *Error) {
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil || n < 0 {
		return 0, &Error{Status: 400, Code: "PGRST100", Message: fmt.Sprintf("%s must be a non-negative integer", name), Hint: "got " + v}
	}
	return n, nil
}

func parseFilter(t Table, column, v string) (Filter, *Error) {
	col, ok := t.Column(column)
	if !ok {
		// PostgREST lets Postgres answer this one; the wording and code match.
		return Filter{}, &Error{Status: 400, Code: "42703", Message: fmt.Sprintf("column %s.%s does not exist", t.Name, column)}
	}
	op, value, found := strings.Cut(v, ".")
	if !found {
		return Filter{}, &Error{Status: 400, Code: "PGRST100", Message: fmt.Sprintf("unsupported filter for %s", column), Hint: `use "column=eq.value", "column=neq.value" or "column=is.null"`}
	}
	switch FilterOp(op) {
	case OpEq, OpNeq:
		return Filter{Column: col, Op: FilterOp(op), Value: value}, nil
	case OpIs:
		switch value {
		case "null", "not.null", "true", "false":
			return Filter{Column: col, Op: OpIs, Value: value}, nil
		}
		return Filter{}, &Error{Status: 400, Code: "PGRST100", Message: "is. accepts null, not.null, true or false"}
	default:
		return Filter{}, &Error{Status: 400, Code: "PGRST100", Message: fmt.Sprintf("operator %q is not supported by the lpl-api façade", op), Hint: "eq, neq and is are supported"}
	}
}

func parseOrder(t Table, v string) ([]OrderTerm, *Error) {
	var terms []OrderTerm
	for _, raw := range strings.Split(v, ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		parts := strings.Split(raw, ".")
		col, ok := t.Column(parts[0])
		if !ok {
			return nil, &Error{Status: 400, Code: "42703", Message: fmt.Sprintf("column %s.%s does not exist", t.Name, parts[0])}
		}
		term := OrderTerm{Column: col}
		for _, mod := range parts[1:] {
			switch mod {
			case "asc":
				term.Desc = false
			case "desc":
				term.Desc = true
			case "nullsfirst":
				term.Nulls = "first"
			case "nullslast":
				term.Nulls = "last"
			default:
				return nil, &Error{Status: 400, Code: "PGRST100", Message: fmt.Sprintf("unknown order modifier %q", mod)}
			}
		}
		terms = append(terms, term)
	}
	return terms, nil
}
