// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
//
// Package contract is the allow-list of what the frontend actually sends: the tables and
// columns of supabase/schema.sql, the RPC functions, and the PostgREST query grammar used
// by src/lib/server.ts. Anything outside it is refused with a PostgREST-shaped error rather
// than guessed at, so the façade never widens the surface the database was audited for.
package contract

import "fmt"

// ColType is the Postgres type a value is cast to when it appears in a filter.
type ColType string

// Column types present in the schema.
const (
	Text        ColType = "text"
	UUID        ColType = "uuid"
	Timestamptz ColType = "timestamptz"
	JSONB       ColType = "jsonb"
	Integer     ColType = "integer"
	Boolean     ColType = "boolean"
	TextArray   ColType = "text[]"
)

// Column is a table column.
type Column struct {
	Name string
	Type ColType
}

// Table describes one table in the public schema. Columns are what the REST surface serves;
// Internal lists the columns the database keeps for itself (derived summaries, sort keys),
// which no request may select, filter, order or write.
type Table struct {
	Name       string
	PrimaryKey string
	Columns    []Column
	Internal   []string
}

// Column looks a column up by name.
func (t Table) Column(name string) (Column, bool) {
	for _, c := range t.Columns {
		if c.Name == name {
			return c, true
		}
	}
	return Column{}, false
}

// Tables mirrors supabase/schema.sql. Keep it in step by hand; the integration suite
// re-checks it against the live catalogue.
var Tables = map[string]Table{
	"org_config": {Name: "org_config", PrimaryKey: "id", Columns: []Column{
		{Name: "id", Type: Text}, {Name: "config", Type: JSONB}, {Name: "updated_at", Type: Timestamptz},
	}},
	"app_users": {Name: "app_users", PrimaryKey: "id", Columns: []Column{
		{Name: "id", Type: Text}, {Name: "auth_id", Type: UUID}, {Name: "email", Type: Text}, {Name: "name", Type: Text},
		{Name: "phone", Type: Text}, {Name: "branch", Type: Text}, {Name: "role", Type: Text}, {Name: "active", Type: Boolean},
		{Name: "created_at", Type: Timestamptz}, {Name: "created_by", Type: Text}, {Name: "last_sign_in_at", Type: Timestamptz},
		{Name: "updated_at", Type: Timestamptz},
	}, Internal: []string{"name_key"}},
	// The summary columns are derived from data by case_derive and read through cases_page.
	"cases": {Name: "cases", PrimaryKey: "id", Columns: []Column{
		{Name: "id", Type: Text}, {Name: "ref", Type: Text}, {Name: "status", Type: Text}, {Name: "counsellor_id", Type: Text},
		{Name: "student_user_id", Type: Text}, {Name: "rev", Type: Integer}, {Name: "updated_at", Type: Timestamptz}, {Name: "data", Type: JSONB},
	}, Internal: []string{
		"student_name", "student_email", "created_at", "data_updated_at", "current_step", "stage", "progress_done", "progress_applicable",
		"progress_pct", "gate_pending", "gate_pending_at", "gate_pending_round", "gate_returned", "docs_uploaded", "docs_accepted",
		"docs_rejected", "profile_submitted", "cis_start_at", "cis2_from", "offer_lapse_at", "arrival_at", "hold_review_at",
		"retention_anchor_at", "retention_kind", "disposed", "legal_hold", "last_event_at", "last_event_by", "last_event_text", "destination", "channel",
		"exit_code", "done_mask", "visa_granted", "cis_sent_at", "offer_decided_at", "profile_started", "consent_yes", "transfers_total",
		"transfers_unsafeguarded", "transfers_unapproved", "has_clock", "needs_look", "search_text", "list_at", "gate_at",
	}},
	"audit": {Name: "audit", PrimaryKey: "id", Columns: []Column{
		{Name: "id", Type: Text}, {Name: "at", Type: Timestamptz}, {Name: "actor_id", Type: Text}, {Name: "actor_name", Type: Text},
		{Name: "actor_role", Type: Text}, {Name: "action", Type: Text}, {Name: "target", Type: Text}, {Name: "detail", Type: Text},
		// v5 structured columns
		{Name: "event_type", Type: Text}, {Name: "entity_type", Type: Text}, {Name: "entity_id", Type: Text}, {Name: "entity_label", Type: Text},
		{Name: "outcome", Type: Text}, {Name: "source", Type: Text}, {Name: "session_id", Type: Text}, {Name: "summary", Type: Text},
		{Name: "changes", Type: JSONB}, {Name: "meta", Type: JSONB},
	}},
	"notifications": {Name: "notifications", PrimaryKey: "id", Columns: []Column{
		{Name: "id", Type: Text}, {Name: "recipient_id", Type: Text}, {Name: "at", Type: Timestamptz}, {Name: "type", Type: Text},
		{Name: "priority", Type: Text}, {Name: "title", Type: Text}, {Name: "body", Type: Text}, {Name: "case_id", Type: Text},
		{Name: "case_ref", Type: Text}, {Name: "step", Type: Integer}, {Name: "link", Type: Text}, {Name: "group_key", Type: Text},
		{Name: "dedupe_key", Type: Text}, {Name: "read_at", Type: Timestamptz}, {Name: "pushed_at", Type: Timestamptz},
		{Name: "push_attempts", Type: Integer},
	}},
	"push_subscriptions": {Name: "push_subscriptions", PrimaryKey: "id", Columns: []Column{
		{Name: "id", Type: Text}, {Name: "user_id", Type: Text}, {Name: "endpoint", Type: Text}, {Name: "p256dh", Type: Text},
		{Name: "auth", Type: Text}, {Name: "user_agent", Type: Text}, {Name: "created_at", Type: Timestamptz},
		{Name: "last_seen_at", Type: Timestamptz}, {Name: "revoked_at", Type: Timestamptz},
	}},
	"prompts": {Name: "prompts", PrimaryKey: "id", Columns: []Column{
		{Name: "id", Type: Text}, {Name: "title", Type: Text}, {Name: "status", Type: Text}, {Name: "version", Type: Integer},
		{Name: "updated_at", Type: Timestamptz}, {Name: "updated_by", Type: Text}, {Name: "data", Type: JSONB},
	}},
	"permission_defaults": {Name: "permission_defaults", PrimaryKey: "perm", Columns: []Column{
		{Name: "perm", Type: Text}, {Name: "roles", Type: TextArray},
	}},
	// v6: read-only for every application role (writes are revoked); Group IT maintains it with SQL.
	"group_it_domains": {Name: "group_it_domains", PrimaryKey: "domain", Columns: []Column{
		{Name: "domain", Type: Text}, {Name: "note", Type: Text}, {Name: "added_at", Type: Timestamptz},
	}},
}

// Error is a refusal in PostgREST's envelope: {code, details, hint, message} with an HTTP status.
type Error struct {
	Status  int
	Code    string
	Message string
	Hint    string
	Details string
}

func (e *Error) Error() string { return fmt.Sprintf("%d %s: %s", e.Status, e.Code, e.Message) }

// UnknownTable is PostgREST's answer for a table outside the schema cache.
func UnknownTable(name string) *Error {
	return &Error{Status: 404, Code: "PGRST205", Message: fmt.Sprintf("Could not find the table 'public.%s' in the schema cache", name)}
}

// UnknownColumn is PostgREST's answer for a payload key that is not a column.
func UnknownColumn(table, column string) *Error {
	return &Error{Status: 400, Code: "PGRST204", Message: fmt.Sprintf("Could not find the '%s' column of '%s' in the schema cache", column, table)}
}
