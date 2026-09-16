// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package contract

import "fmt"

// Function is a SQL function callable through /rest/v1/rpc/{name}. Params are the named
// arguments in declaration order. Types gives the Postgres type of each parameter (text when
// absent); "text[]" arrives as a JSON array. Set marks a table- or set-returning function,
// which PostgREST answers with a JSON array of rows rather than a bare value.
type Function struct {
	Name   string
	Params []string
	Types  []string
	Set    bool
}

// ParamType is the Postgres type a parameter is cast to.
func (f Function) ParamType(i int) string {
	if i < len(f.Types) && f.Types[i] != "" {
		return f.Types[i]
	}
	return "text"
}

// Functions lists the RPCs granted to anon or authenticated in supabase/schema.sql.
var Functions = map[string]Function{
	"needs_bootstrap":     {Name: "needs_bootstrap"},
	"next_case_ref":       {Name: "next_case_ref", Params: []string{"prefix"}},
	"workspace_version":   {Name: "workspace_version"},
	"app_can":             {Name: "app_can", Params: []string{"perm"}},
	"current_app_role":    {Name: "current_app_role"},
	"current_app_user_id": {Name: "current_app_user_id"},
	"current_case_scope":  {Name: "current_case_scope"},
	"case_in_scope":       {Name: "case_in_scope", Params: []string{"p_counsellor_id", "p_student_user_id"}},
	// v5: notifications
	"notification_state":          {Name: "notification_state", Set: true},
	"notifications_page":          {Name: "notifications_page", Params: []string{"p_before", "p_limit", "p_unread_only"}, Types: []string{"timestamptz", "integer", "boolean"}, Set: true},
	"mark_notifications_read":     {Name: "mark_notifications_read", Params: []string{"p_ids"}, Types: []string{"text[]"}},
	"mark_all_notifications_read": {Name: "mark_all_notifications_read"},
	"prune_notifications":         {Name: "prune_notifications", Params: []string{"p_days"}, Types: []string{"integer"}},
	// v5: audit
	"audit_page": {Name: "audit_page",
		Params: []string{"p_before", "p_actor", "p_event_type", "p_entity_type", "p_entity_id", "p_from", "p_to", "p_q", "p_limit"},
		Types:  []string{"timestamptz", "text", "text", "text", "text", "timestamptz", "timestamptz", "text", "integer"}, Set: true},
	"audit_detail": {Name: "audit_detail", Params: []string{"p_id"}, Set: true},
}

// UnknownFunction is PostgREST's answer when no function matches the name and arguments.
// The frontend relies on this 404 to tell "schema not run" from "connection refused".
func UnknownFunction(name string, args []string) *Error {
	sig := ""
	for i, a := range args {
		if i > 0 {
			sig += ", "
		}
		sig += a
	}
	return &Error{
		Status:  404,
		Code:    "PGRST202",
		Message: fmt.Sprintf("Could not find the function public.%s(%s) in the schema cache", name, sig),
		Hint:    "Run supabase/schema.sql against the project.",
	}
}
