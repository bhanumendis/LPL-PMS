// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
//
// The v6 role model, attacked through the API the way a hand-crafted request would: every
// SUPER ADMIN function an ADMIN might reach for, every way to escalate a role, and the Group
// IT restriction. Each refusal is asserted with the guard's own message.
package integration

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"lpl-api/internal/auth"
	"lpl-api/internal/db"
)

// principalOf is the principal lpl-api builds from the identity's token.
func principalOf(id identity) auth.Principal {
	return auth.Principal{Role: "authenticated", Sub: id.AuthID, ClaimsJSON: fmt.Sprintf(`{"sub":%q,"role":"authenticated"}`, id.AuthID)}
}

func newProfile(id, email, role string) string {
	return fmt.Sprintf(`[{"id":%q,"email":%q,"name":"New Person","phone":null,"branch":null,"role":%q,"active":true,"created_by":null,"last_sign_in_at":null,"created_at":"2026-09-01T00:00:00.000Z"}]`, id, email, role)
}

func roleOf(t *testing.T, id string) string {
	t.Helper()
	var r string
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select role from public.app_users where id = $1::text", id).Scan(&r)
	})
	return r
}

func TestAdminCannotReachSuperAdminFunctions(t *testing.T) {
	reset(t)
	super := bootstrapAdmin(t)
	admin := provision(t, "admin", "a@test.local", "Placement Admin")
	other := provision(t, "admin", "a2@test.local", "Other Admin")
	c := provision(t, "counsellor", "c@test.local", "Counsellor")

	for _, perm := range []string{"system.view", "system.write", "system.delete", "role.write", "prompt.view", "prompt.write", "audit.download", "staff.delete", "case.delete", "dataprotection.delete"} {
		if r := rpc(t, "app_can", admin.Token, fmt.Sprintf(`{"perm":%q}`, perm)); r.Body != "false" {
			t.Errorf("ADMIN holds %s", perm)
		}
	}
	// The permission matrix and case visibility.
	expect(t, patch(t, "org_config", "id=eq.org", admin.Token, `{"config":{"permissions":{"case.delete":["admin"]}}}`), 400, "requires the role.write permission")
	expect(t, patch(t, "org_config", "id=eq.org", admin.Token, `{"config":{"caseScope":{"counsellor":"all"}}}`), 400, "requires the role.write permission")
	// Integration configuration.
	expect(t, patch(t, "org_config", "id=eq.org", admin.Token, `{"config":{"push":{"vapidPublicKey":"x"}}}`), 400, "requires the system.write permission")
	// Prompt Engineer Workspace.
	expect(t, insert(t, "prompts", admin.Token, `[{"id":"p1","title":"t","status":"draft","version":1,"updated_at":"2026-09-01T00:00:00Z","updated_by":"x","data":{}}]`), 403, "")
	// Administrator accounts: create, edit, promote, demote.
	expect(t, insert(t, "app_users", admin.Token, newProfile("n1", "n1@test.local", "admin")), 400, "Only a SUPER ADMIN may create administrator accounts")
	expect(t, insert(t, "app_users", admin.Token, newProfile("n2", "n2@test.local", "super_admin")), 400, "Only a SUPER ADMIN may create administrator accounts")
	expect(t, patch(t, "app_users", "id=eq."+other.AppID, admin.Token, `{"name":"Renamed"}`), 400, "Only a SUPER ADMIN may manage administrator accounts")
	expect(t, patch(t, "app_users", "id=eq."+super.AppID, admin.Token, `{"active":false}`), 400, "Only a SUPER ADMIN may manage administrator accounts")
	expect(t, patch(t, "app_users", "id=eq."+c.AppID, admin.Token, `{"role":"admin"}`), 400, "Only a SUPER ADMIN may manage administrator accounts")
	expect(t, patch(t, "app_users", "id=eq."+admin.AppID, admin.Token, `{"role":"super_admin"}`), 400, "You cannot change your own role")
	// Sign-ins of administrator accounts.
	for _, action := range []string{`"set_password","password":"Password123!"`, `"deactivate"`} {
		r := call(t, http.MethodPost, "/functions/v1/admin-users", admin.Token, fmt.Sprintf(`{"action":%s,"app_user_id":%q}`, action, super.AppID), nil)
		expect(t, r, 403, "Only a SUPER ADMIN may manage administrator accounts")
	}
	// Maintenance and security objects.
	expect(t, rpc(t, "prune_notifications", admin.Token, `{"p_days":30}`), 400, "requires SUPER ADMIN")
	expect(t, call(t, http.MethodDelete, "/rest/v1/audit?id=neq.none", admin.Token, "", map[string]string{"Prefer": "return=minimal"}), 403, "")
	expect(t, call(t, http.MethodDelete, "/rest/v1/org_config?id=eq.org", admin.Token, "", map[string]string{"Prefer": "return=minimal"}), 403, "")

	// Nothing above changed anything.
	if roleOf(t, c.AppID) != "counsellor" || roleOf(t, admin.AppID) != "admin" || roleOf(t, other.AppID) != "admin" {
		t.Fatal("a refused escalation changed a role")
	}
}

func TestAdminRunsPlacementOperations(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	admin := provision(t, "admin", "a@test.local", "Placement Admin")
	c := provision(t, "counsellor", "c@test.local", "Counsellor")
	tl := provision(t, "team_leader", "tl@test.local", "Team Leader")

	expect(t, insert(t, "app_users", admin.Token, newProfile("n1", "n1@test.local", "counsellor")), 201, "")
	expect(t, patch(t, "app_users", "id=eq."+c.AppID, admin.Token, `{"role":"team_leader","branch":"Kandy"}`), 204, "")
	if roleOf(t, c.AppID) != "team_leader" {
		t.Fatal("ADMIN could not change a counsellor's role")
	}
	expect(t, patch(t, "app_users", "id=eq."+tl.AppID, admin.Token, `{"active":false}`), 204, "")
	r := call(t, http.MethodPost, "/functions/v1/admin-users", admin.Token, `{"action":"create","app_user_id":"n1","password":"Password123!"}`, nil)
	expect(t, r, 200, `"auth_id"`)
	system(t, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, `update public.org_config set config = '{"sla":{"cisDays":7}}'::jsonb where id = 'org'`)
		return err
	})
	expect(t, patch(t, "org_config", "id=eq.org", admin.Token, `{"config":{"sla":{"cisDays":5}}}`), 204, "")
	insertCase(t, "case-a", "LPL-2026-0001", "", "")
	rows := rowsOf(t, call(t, http.MethodGet, "/rest/v1/cases?select=*", admin.Token, "", nil).Body)
	if len(rows) != 1 {
		t.Fatalf("ADMIN sees %d cases, want every case", len(rows))
	}
	expect(t, call(t, http.MethodGet, "/rest/v1/audit?select=*", admin.Token, "", nil), 200, "")
}

func TestSuperAdminIsRestrictedToGroupIT(t *testing.T) {
	reset(t)
	super := bootstrapAdmin(t)
	c := provision(t, "counsellor", "c@outside.example", "Outsider")

	expect(t, insert(t, "app_users", super.Token, newProfile("x1", "x1@outside.example", "super_admin")), 400, "SUPER ADMIN is restricted to Group IT email addresses")
	expect(t, insert(t, "app_users", super.Token, newProfile("x2", "x2@test.local", "super_admin")), 201, "")
	expect(t, patch(t, "app_users", "id=eq."+c.AppID, super.Token, `{"role":"super_admin"}`), 400, "SUPER ADMIN is restricted to Group IT email addresses")
	expect(t, patch(t, "app_users", "id=eq.x2", super.Token, `{"email":"x2@outside.example"}`), 400, "SUPER ADMIN is restricted to Group IT email addresses")
	expect(t, patch(t, "app_users", "id=eq."+super.AppID, super.Token, `{"active":false}`), 400, "You cannot change your own role or activation state")
	// ADMIN is not Group-IT restricted.
	expect(t, patch(t, "app_users", "id=eq."+c.AppID, super.Token, `{"role":"admin"}`), 204, "")
	// The domain list is readable and not writable through the API.
	expect(t, call(t, http.MethodGet, "/rest/v1/group_it_domains?select=*", c.Token, "", nil), 200, "test.local")
	expect(t, insert(t, "group_it_domains", super.Token, `[{"domain":"evil.example"}]`), 403, "")
	// Directly against the database (as a PostgREST deployment would expose it): refused.
	err := pool.WithUser(context.Background(), principalOf(super), func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, "insert into public.group_it_domains (domain) values ('evil.example')")
		return err
	})
	if err == nil || !strings.Contains(err.Error(), "permission denied") {
		t.Fatalf("a signed-in SUPER ADMIN added a Group IT domain: %v", err)
	}
}

func TestBootstrapNeedsAGroupITAddress(t *testing.T) {
	reset(t)
	expect(t, rpc(t, "bootstrap_domains", "", ""), 200, "test.local")
	err := pool.WithSystem(context.Background(), func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, `insert into auth.users (email, raw_user_meta_data, email_confirmed_at) values ('first@outside.example', '{"name":"X"}'::jsonb, now())`)
		return err
	})
	if err == nil {
		t.Fatal("a first sign-up from outside Group IT was accepted")
	}
	expect(t, rpc(t, "needs_bootstrap", "", ""), 200, "true")
	bootstrapAdmin(t)
	expect(t, rpc(t, "bootstrap_domains", "", ""), 200, "[]")
}

func TestMatrixCannotGrantLockedCells(t *testing.T) {
	reset(t)
	super := bootstrapAdmin(t)
	expect(t, patch(t, "org_config", "id=eq.org", super.Token, `{"config":{"permissions":{"system.write":["admin"]}}}`), 400, "reserved for SUPER ADMIN")
	expect(t, patch(t, "org_config", "id=eq.org", super.Token, `{"config":{"permissions":{"role.write":["team_leader"]}}}`), 400, "reserved for SUPER ADMIN")
	expect(t, patch(t, "org_config", "id=eq.org", super.Token, `{"config":{"permissions":{"case.read":["super_admin"]}}}`), 400, "unknown role or SUPER ADMIN")
	expect(t, patch(t, "org_config", "id=eq.org", super.Token, `{"config":{"caseScope":{"super_admin":"own"}}}`), 400, "always sees every case")
	expect(t, patch(t, "org_config", "id=eq.org", super.Token, `{"config":{"permissions":{"case.delete":["admin"]}}}`), 204, "")
}

func TestCaseCannotBeMovedToAnotherStudent(t *testing.T) {
	reset(t)
	super := bootstrapAdmin(t)
	admin := provision(t, "admin", "a@test.local", "Placement Admin")
	c := provision(t, "counsellor", "c@test.local", "Counsellor")
	s1 := provision(t, "student", "s1@test.local", "Student One")
	s2 := provision(t, "student", "s2@test.local", "Student Two")
	insertCase(t, "case-a", "LPL-2026-0001", c.AppID, s1.AppID)
	insertCase(t, "case-b", "LPL-2026-0002", c.AppID, "")

	data := loadCaseData(t, "case-a")
	data["studentUserId"] = s2.AppID
	expect(t, saveCase(t, super.Token, "case-a", 2, data), 400, "cannot be moved to a different student account")
	// Linking an unlinked case needs account.write: the counsellor lacks it, ADMIN holds it.
	data = loadCaseData(t, "case-b")
	data["studentUserId"] = s2.AppID
	expect(t, saveCase(t, c.Token, "case-b", 2, data), 400, "requires the account.write permission")
	expect(t, saveCase(t, admin.Token, "case-b", 2, data), 200, "")
	// A student account links to one case only.
	data = loadCaseData(t, "case-b")
	data["studentUserId"] = nil
	expect(t, saveCase(t, admin.Token, "case-b", 3, data), 400, "requires the dataprotection.delete permission")
}
