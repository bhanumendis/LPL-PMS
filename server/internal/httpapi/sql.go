// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
//
// SQL builders. Two rules keep the database's behaviour identical to what it does under
// PostgREST:
//
//  1. Rows are serialised by Postgres itself (json_agg over row_to_json), so timestamps,
//     jsonb documents, arrays and numbers come out formatted exactly as PostgREST returns
//     them, and the case document in cases.data is never re-marshalled by Go.
//  2. Writes use the same statement shapes PostgREST uses: INSERT … ON CONFLICT DO UPDATE
//     for an upsert (so the insert policy applies only to new rows, the update policy and
//     the BEFORE UPDATE guard to existing ones), UPDATE … FROM json_populate_record for a
//     PATCH, and a plain DELETE. The payload travels as one JSON parameter and is typed by
//     Postgres from the table definition.
//
// Every identifier comes from the allow-list in package contract and is still quoted.
package httpapi

import (
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"lpl-api/internal/contract"
)

func qualify(t contract.Table) string { return pgx.Identifier{"public", t.Name}.Sanitize() }

func ident(name string) string { return pgx.Identifier{name}.Sanitize() }

// buildWhere renders the filters. Values are bound as parameters and cast to the column
// type, so the statement behaves the same under the simple and the extended protocol.
func buildWhere(filters []contract.Filter, firstArg int, alias string) (string, []any, *contract.Error) {
	if len(filters) == 0 {
		return "", nil, nil
	}
	parts := make([]string, 0, len(filters))
	args := make([]any, 0, len(filters))
	n := firstArg
	for _, f := range filters {
		col := ident(f.Column.Name)
		if alias != "" {
			col = alias + "." + col
		}
		switch f.Op {
		case contract.OpEq:
			parts = append(parts, fmt.Sprintf("%s = $%d::%s", col, n, f.Column.Type))
			args = append(args, f.Value)
			n++
		case contract.OpNeq:
			parts = append(parts, fmt.Sprintf("%s <> $%d::%s", col, n, f.Column.Type))
			args = append(args, f.Value)
			n++
		case contract.OpIs:
			switch f.Value {
			case "null":
				parts = append(parts, col+" is null")
			case "not.null":
				parts = append(parts, col+" is not null")
			case "true":
				parts = append(parts, col+" is true")
			case "false":
				parts = append(parts, col+" is false")
			default:
				return "", nil, &contract.Error{Status: 400, Code: "PGRST100", Message: "is. accepts null, not.null, true or false"}
			}
		default:
			return "", nil, &contract.Error{Status: 400, Code: "PGRST100", Message: fmt.Sprintf("operator %q is not supported", f.Op)}
		}
	}
	return " where " + strings.Join(parts, " and "), args, nil
}

// buildSelect returns one row: (row count, JSON array text).
func buildSelect(q contract.Query) (string, []any, *contract.Error) {
	where, args, err := buildWhere(q.Filters, 1, "")
	if err != nil {
		return "", nil, err
	}
	// The contract's columns, never "*": columns the database keeps for itself stay inside it.
	cols := make([]string, len(q.Table.Columns))
	for i, c := range q.Table.Columns {
		cols[i] = ident(c.Name)
	}
	inner := "select " + strings.Join(cols, ", ") + " from " + qualify(q.Table) + where
	if len(q.Order) > 0 {
		terms := make([]string, 0, len(q.Order))
		for _, o := range q.Order {
			term := ident(o.Column.Name)
			if o.Desc {
				term += " desc"
			} else {
				term += " asc"
			}
			switch o.Nulls {
			case "first":
				term += " nulls first"
			case "last":
				term += " nulls last"
			}
			terms = append(terms, term)
		}
		inner += " order by " + strings.Join(terms, ", ")
	}
	if q.Limit != nil {
		inner += fmt.Sprintf(" limit %d", *q.Limit)
	}
	if q.Offset != nil {
		inner += fmt.Sprintf(" offset %d", *q.Offset)
	}
	return "select count(*)::int, coalesce(json_agg(row_to_json(t)), '[]'::json)::text from (" + inner + ") t", args, nil
}

// buildUpsert takes the payload as $1 (a JSON array of objects sharing the given columns).
func buildUpsert(t contract.Table, columns []string, onConflict []string, resolution string) (string, *contract.Error) {
	if len(columns) == 0 {
		return "", &contract.Error{Status: 400, Code: "PGRST102", Message: "Empty or invalid json request body"}
	}
	quoted := make([]string, len(columns))
	for i, c := range columns {
		quoted[i] = ident(c)
	}
	list := strings.Join(quoted, ", ")
	stmt := fmt.Sprintf("insert into %s (%s) select %s from json_populate_recordset(null::%s, $1::json)", qualify(t), list, list, qualify(t))
	if resolution == "" {
		return stmt, nil
	}
	keys := onConflict
	if len(keys) == 0 {
		keys = []string{t.PrimaryKey}
	}
	keySet := map[string]bool{}
	quotedKeys := make([]string, len(keys))
	for i, k := range keys {
		if _, ok := t.Column(k); !ok {
			return "", contract.UnknownColumn(t.Name, k)
		}
		keySet[k] = true
		quotedKeys[i] = ident(k)
	}
	switch resolution {
	case "merge-duplicates":
		sets := make([]string, 0, len(columns))
		for _, c := range columns {
			if !keySet[c] {
				sets = append(sets, fmt.Sprintf("%s = excluded.%s", ident(c), ident(c)))
			}
		}
		if len(sets) == 0 {
			return stmt + " on conflict (" + strings.Join(quotedKeys, ", ") + ") do nothing", nil
		}
		return stmt + " on conflict (" + strings.Join(quotedKeys, ", ") + ") do update set " + strings.Join(sets, ", "), nil
	case "ignore-duplicates":
		return stmt + " on conflict (" + strings.Join(quotedKeys, ", ") + ") do nothing", nil
	default:
		return "", &contract.Error{Status: 400, Code: "PGRST100", Message: fmt.Sprintf("unknown resolution %q", resolution), Hint: "merge-duplicates or ignore-duplicates"}
	}
}

// buildPatch takes the payload object as $1 and the filter values from $2 on.
func buildPatch(t contract.Table, columns []string, filters []contract.Filter) (string, []any, *contract.Error) {
	if len(columns) == 0 {
		return "", nil, &contract.Error{Status: 400, Code: "PGRST102", Message: "Empty or invalid json request body"}
	}
	sets := make([]string, len(columns))
	for i, c := range columns {
		sets[i] = fmt.Sprintf("%s = p.%s", ident(c), ident(c))
	}
	where, args, err := buildWhere(filters, 2, "t")
	if err != nil {
		return "", nil, err
	}
	stmt := fmt.Sprintf("update %s as t set %s from json_populate_record(null::%s, $1::json) as p%s", qualify(t), strings.Join(sets, ", "), qualify(t), where)
	return stmt, args, nil
}

func buildDelete(t contract.Table, filters []contract.Filter) (string, []any, *contract.Error) {
	where, args, err := buildWhere(filters, 1, "")
	if err != nil {
		return "", nil, err
	}
	return "delete from " + qualify(t) + where, args, nil
}

// buildRPC calls a function with named arguments and returns its result as JSON text.
// PostgREST returns a scalar function's value as a bare JSON value and a set- or
// table-returning function's rows as a JSON array; both shapes are reproduced here.
// Parameters are cast to their declared types; a text[] parameter arrives as a JSON array
// and is unpacked in SQL.
func buildRPC(fn contract.Function) string {
	parts := make([]string, len(fn.Params))
	for i, p := range fn.Params {
		switch t := fn.ParamType(i); t {
		case "text[]":
			parts[i] = fmt.Sprintf("%s => (select coalesce(array_agg(x), '{}'::text[]) from jsonb_array_elements_text($%d::jsonb) t(x))", ident(p), i+1)
		default:
			parts[i] = fmt.Sprintf("%s => $%d::%s", ident(p), i+1, t)
		}
	}
	call := fmt.Sprintf("public.%s(%s)", ident(fn.Name), strings.Join(parts, ", "))
	if fn.Set {
		return fmt.Sprintf("select coalesce(json_agg(row_to_json(t)), '[]'::json)::text from %s t", call)
	}
	return fmt.Sprintf("select to_json(%s)::text", call)
}

// contentRange is PostgREST's Content-Range for a collection response.
func contentRange(n int) string {
	if n == 0 {
		return "*/*"
	}
	return fmt.Sprintf("0-%d/*", n-1)
}
