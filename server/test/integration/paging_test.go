// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
//
// The paged reads (v6.3). What cases_page, cases_count, dashboard_summary, the registers and
// users_page return must be exactly what row-level security allows each role; complete and in
// order across pages (keyset, no row lost or repeated); and, for the filters over what a case
// means now, exactly what src/lib/summary.ts says (the parity fixture carries its answers).
package integration

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"
	"time"

	"lpl-api/internal/db"
)

func loadFixture(t *testing.T) parityFixture {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "summary_parity.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fx parityFixture
	if err := json.Unmarshal(raw, &fx); err != nil {
		t.Fatal(err)
	}
	return fx
}

// seedFixture writes the fixture's case documents through the real triggers.
func seedFixture(t *testing.T, fx parityFixture) {
	t.Helper()
	system(t, func(ctx context.Context, ex db.Executor) error {
		for _, c := range fx.Cases {
			var head struct{ ID, Ref string }
			_ = json.Unmarshal(c, &head)
			if _, err := ex.Exec(ctx, "insert into public.cases (id, ref, rev, data) values ($1::text, $2::text, 1, $3::jsonb)", head.ID, head.Ref, string(c)); err != nil {
				return fmt.Errorf("%s: %w", head.ID, err)
			}
		}
		return nil
	})
}

// provisionAs is provision with a chosen profile id (the fixture assigns cases to c1..c3).
func provisionAs(t *testing.T, appID, role, email string) identity {
	t.Helper()
	id := identity{AppID: appID}
	system(t, func(ctx context.Context, ex db.Executor) error {
		if _, err := ex.Exec(ctx, "insert into public.app_users (id, email, name, role, active, created_at) values ($1::text, $2::text, $3::text, $4::text, true, now())",
			appID, email, "Person "+appID, role); err != nil {
			return err
		}
		meta := fmt.Sprintf(`{"provisioned":"admin-users","app_user_id":%q}`, appID)
		return ex.QueryRow(ctx, "insert into auth.users (email, raw_app_meta_data, email_confirmed_at) values ($1::text, $2::jsonb, now()) returning id::text",
			email, meta).Scan(&id.AuthID)
	})
	id.Token = mintToken(t, id.AuthID)
	return id
}

// visible is the set of case ids row-level security shows the identity.
func visible(t *testing.T, id identity) map[string]bool {
	t.Helper()
	var ids []string
	if err := pool.WithUser(context.Background(), principalOf(id), func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select coalesce(array_agg(id), '{}') from public.cases").Scan(&ids)
	}); err != nil {
		t.Fatal(err)
	}
	out := map[string]bool{}
	for _, x := range ids {
		out[x] = true
	}
	return out
}

// allPages follows the keyset cursor to the end, failing on a repeated row.
func allPages(t *testing.T, fn, token string, p map[string]any, limit int, key func(map[string]any) string) []map[string]any {
	t.Helper()
	var out []map[string]any
	seen := map[string]bool{}
	var after any
	for page := 0; page < 10000; page++ {
		q := map[string]any{}
		for k, v := range p {
			q[k] = v
		}
		q["limit"] = limit
		if after != nil {
			q["after"] = after
		}
		b, _ := json.Marshal(map[string]any{"p": q})
		r := rpc(t, fn, token, string(b))
		expect(t, r, http.StatusOK, "")
		rows := rowsOf(t, r.Body)
		for _, row := range rows {
			k := key(row)
			if seen[k] {
				t.Fatalf("%s %v: row %s returned twice", fn, p, k)
			}
			seen[k] = true
		}
		out = append(out, rows...)
		if len(rows) < limit {
			return out
		}
		after = rows[len(rows)-1]["cursor"]
	}
	t.Fatalf("%s %v: did not finish", fn, p)
	return nil
}

func caseID(r map[string]any) string { return r["id"].(string) }

func idSet(rows []map[string]any) map[string]bool {
	out := map[string]bool{}
	for _, r := range rows {
		out[caseID(r)] = true
	}
	return out
}

func sameSets(t *testing.T, what string, want, got map[string]bool) {
	t.Helper()
	var missing, extra []string
	for k := range want {
		if !got[k] {
			missing = append(missing, k)
		}
	}
	for k := range got {
		if !want[k] {
			extra = append(extra, k)
		}
	}
	sort.Strings(missing)
	sort.Strings(extra)
	if len(missing)+len(extra) > 0 {
		if len(missing) > 10 {
			missing = append(missing[:10], "…")
		}
		if len(extra) > 10 {
			extra = append(extra[:10], "…")
		}
		t.Errorf("%s: %d expected, %d returned; missing %v; unexpected %v", what, len(want), len(got), missing, extra)
	}
}

// keyValue orders cursor values: booleans, numbers, and instants (with ±infinity).
func keyValue(t *testing.T, v any) float64 {
	t.Helper()
	switch x := v.(type) {
	case bool:
		if x {
			return 1
		}
		return 0
	case float64:
		return x
	case string:
		switch x {
		case "infinity":
			return math.Inf(1)
		case "-infinity":
			return math.Inf(-1)
		}
		ts, err := time.Parse(time.RFC3339Nano, x)
		if err != nil {
			t.Fatalf("cursor value %q: %v", x, err)
		}
		return float64(ts.UnixMicro())
	}
	t.Fatalf("cursor value %v (%T)", v, v)
	return 0
}

// inOrder checks consecutive rows against the sort keys (desc[i] per key). Ties are broken by
// id in the database's collation, which completeness across pages already exercises.
func inOrder(t *testing.T, what string, rows []map[string]any, desc []bool) {
	t.Helper()
	for i := 1; i < len(rows); i++ {
		a, b := rows[i-1]["cursor"].(map[string]any), rows[i]["cursor"].(map[string]any)
		ka, kb := a["k"].([]any), b["k"].([]any)
		for j := range desc {
			x, y := keyValue(t, ka[j]), keyValue(t, kb[j])
			if x == y {
				continue
			}
			if (x > y) != desc[j] {
				t.Fatalf("%s: row %d (%v) is out of order after %v", what, i, b, a)
			}
			break
		}
	}
}

// sqlOrder is the order the database gives a query (for text keys, whose collation varies).
func sqlOrder(t *testing.T, q string) []string {
	t.Helper()
	var ids []string
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select coalesce(array_agg(x), '{}') from ("+q+") s(x)").Scan(&ids)
	})
	return ids
}

func sameSequence(t *testing.T, what string, want []string, rows []map[string]any, key func(map[string]any) string) {
	t.Helper()
	if len(want) != len(rows) {
		t.Fatalf("%s: %d rows, want %d", what, len(rows), len(want))
	}
	for i := range want {
		if key(rows[i]) != want[i] {
			t.Fatalf("%s: row %d is %s, want %s", what, i, key(rows[i]), want[i])
		}
	}
}

type pagingWorld struct {
	fx                   parityFixture
	super, admin, tl, c1 identity
	student              identity
	studentCase          string
}

func setupPaging(t *testing.T) pagingWorld {
	t.Helper()
	fx := loadFixture(t)
	reset(t)
	w := pagingWorld{fx: fx}
	w.super = bootstrapAdmin(t)
	w.admin = provision(t, "admin", "admin2@test.local", "Placement Admin")
	w.tl = provision(t, "team_leader", "tl@test.local", "Team Leader")
	w.c1 = provisionAs(t, "c1", "counsellor", "c1@test.local")
	provisionAs(t, "c2", "counsellor", "c2@test.local")
	seedFixture(t, fx)
	// A student who owns one of the fixture's cases.
	for _, c := range fx.Cases {
		var head struct {
			ID            string `json:"id"`
			StudentUserID string `json:"studentUserId"`
		}
		_ = json.Unmarshal(c, &head)
		if head.StudentUserID != "" {
			w.student = provisionAs(t, head.StudentUserID, "student", "student@test.local")
			w.studentCase = head.ID
			break
		}
	}
	return w
}

func TestCasesPageIsCompleteAndOrderedForEveryRole(t *testing.T) {
	w := setupPaging(t)
	sorts := []struct {
		name   string
		p      map[string]any
		desc   []bool
		subset func(id string) bool
	}{
		{"updated", map[string]any{}, []bool{true, true}, nil},
		{"updated asc", map[string]any{"dir": "asc"}, []bool{false, false}, nil},
		{"updated, one status", map[string]any{"status": []string{"open"}}, []bool{true}, func(id string) bool { return w.fx.Summaries[id]["status"] == "open" }},
		{"severity", map[string]any{"sort": "severity"}, []bool{false, true}, nil},
		{"severity desc", map[string]any{"sort": "severity", "dir": "desc"}, []bool{true, false}, nil},
		{"urgency", map[string]any{"sort": "urgency"}, []bool{false}, nil},
		{"retention", map[string]any{"sort": "retention"}, []bool{false}, nil},
		{"gate queue", map[string]any{"sort": "gate", "gate": "pending"}, []bool{false}, func(id string) bool { return w.fx.States["standard"][id]["gate_pending_now"] != nil }},
	}
	for _, who := range []struct {
		name string
		id   identity
	}{{"super admin", w.super}, {"admin", w.admin}, {"team leader", w.tl}, {"counsellor", w.c1}, {"student", w.student}} {
		vis := visible(t, who.id)
		if who.name == "counsellor" && (len(vis) == 0 || len(vis) >= len(w.fx.Cases)) {
			t.Fatalf("counsellor sees %d cases; the fixture assigns some, not all, to c1", len(vis))
		}
		for _, s := range sorts {
			p := map[string]any{"now": w.fx.Now}
			for k, v := range s.p {
				p[k] = v
			}
			what := who.name + " / " + s.name
			rows := allPages(t, "cases_page", who.id.Token, p, 37, caseID)
			want := map[string]bool{}
			for id := range vis {
				if s.subset == nil || s.subset(id) {
					want[id] = true
				}
			}
			sameSets(t, what, want, idSet(rows))
			inOrder(t, what, rows, s.desc)
			// The keys are what TypeScript says the case means now.
			for _, r := range rows {
				st := w.fx.States["standard"][caseID(r)]
				if s.name == "severity" && r["severity_rank"] != st["severity_rank"] {
					t.Fatalf("%s: %s severity_rank %v, TypeScript %v", what, caseID(r), r["severity_rank"], st["severity_rank"])
				}
				if s.name == "urgency" && fmt.Sprint(r["worst_days"]) != fmt.Sprint(st["worst_days"]) {
					t.Fatalf("%s: %s worst_days %v, TypeScript %v", what, caseID(r), r["worst_days"], st["worst_days"])
				}
			}
		}
	}
	// The document never leaves through the page.
	r := rpc(t, "cases_page", w.super.Token, `{"p":{"limit":1}}`)
	if strings.Contains(r.Body, `"data"`) || strings.Contains(r.Body, `"steps"`) {
		t.Fatalf("cases_page leaked the case document: %s", r.Body)
	}
}

func TestCaseFiltersAgreeWithTypeScript(t *testing.T) {
	w := setupPaging(t)
	type pred func(s, x map[string]any) bool
	num := func(v any) float64 { f, _ := v.(float64); return f }
	in := func(v any, xs ...string) bool {
		for _, x := range xs {
			if v == x {
				return true
			}
		}
		return false
	}
	searchText := func(s map[string]any) string {
		return strings.ToLower(fmt.Sprint(s["ref"], " ", s["student_name"], " ", s["student_email"], " ", s["destination"]))
	}
	var someIDs []any
	for id := range w.fx.Summaries {
		if len(someIDs) < 7 {
			someIDs = append(someIDs, id)
		}
	}
	idIn := func(id any) bool {
		for _, x := range someIDs {
			if x == id {
				return true
			}
		}
		return false
	}
	// Searches whose point is that nothing matches: unescaped, "%" would match every case and
	// "s1_" every s1x.
	emptyByDesign := map[any]bool{"%": true, "s1_": true}
	filters := []struct {
		p    map[string]any
		want pred
	}{
		{map[string]any{"attention": true}, func(s, x map[string]any) bool { return num(x["severity_rank"]) < 3 }},
		{map[string]any{"clock": "breached"}, func(s, x map[string]any) bool { return num(x["breached"]) > 0 }},
		{map[string]any{"clock": "due"}, func(s, x map[string]any) bool { return num(x["breached"]) > 0 || num(x["due_soon"]) > 0 }},
		{map[string]any{"gate": "pending"}, func(s, x map[string]any) bool { return x["gate_pending_now"] != nil }},
		{map[string]any{"gate": "returned"}, func(s, x map[string]any) bool { return x["gate_returned_now"] != nil }},
		{map[string]any{"docs": true}, func(s, x map[string]any) bool { return num(x["docs_to_review"]) > 0 }},
		{map[string]any{"profile": true}, func(s, x map[string]any) bool { return x["profile_submitted_now"] == true }},
		{map[string]any{"hold_review": true}, func(s, x map[string]any) bool { return x["hold_review_due"] == true }},
		{map[string]any{"retention": []string{"overdue", "due_soon"}}, func(s, x map[string]any) bool { return in(x["retention"], "overdue", "due_soon") }},
		{map[string]any{"retention": []string{"overdue"}}, func(s, x map[string]any) bool { return in(x["retention"], "overdue") }},
		{map[string]any{"retention": []string{"due_soon"}}, func(s, x map[string]any) bool { return in(x["retention"], "due_soon") }},
		{map[string]any{"retention": []string{"held", "disposed"}}, func(s, x map[string]any) bool { return in(x["retention"], "held", "disposed") }},
		{map[string]any{"retention": []string{"none"}}, func(s, x map[string]any) bool { return in(x["retention"], "none") }},
		{map[string]any{"retention": []string{"scheduled", "overdue"}}, func(s, x map[string]any) bool { return in(x["retention"], "scheduled", "overdue") }},
		{map[string]any{"severity": []string{"bad"}}, func(s, x map[string]any) bool { return num(x["severity_rank"]) == 0 }},
		{map[string]any{"severity": []string{"warn", "info"}}, func(s, x map[string]any) bool { r := num(x["severity_rank"]); return r == 1 || r == 2 }},
		{map[string]any{"status": []string{"open"}}, func(s, x map[string]any) bool { return s["status"] == "open" }},
		{map[string]any{"status": []string{"hold", "deferred"}}, func(s, x map[string]any) bool { return in(s["status"], "hold", "deferred") }},
		{map[string]any{"stage": 3}, func(s, x map[string]any) bool { return s["status"] == "open" && num(s["stage"]) == 3 }},
		{map[string]any{"counsellor": "c2"}, func(s, x map[string]any) bool { return s["counsellor_id"] == "c2" }},
		{map[string]any{"counsellor": "none"}, func(s, x map[string]any) bool { return s["counsellor_id"] == nil }},
		{map[string]any{"q": "student 12"}, func(s, x map[string]any) bool { return strings.Contains(searchText(s), "student 12") }},
		{map[string]any{"q": "LPL-GEN-3"}, func(s, x map[string]any) bool { return strings.Contains(searchText(s), "lpl-gen-3") }},
		{map[string]any{"q": "ia"}, func(s, x map[string]any) bool { return strings.Contains(searchText(s), "ia") }},
		{map[string]any{"q": "%"}, func(s, x map[string]any) bool { return strings.Contains(searchText(s), "%") }},
		{map[string]any{"q": "s1_"}, func(s, x map[string]any) bool { return strings.Contains(searchText(s), "s1_") }},
		{map[string]any{"ids": someIDs}, func(s, x map[string]any) bool { return idIn(s["id"]) }},
		{map[string]any{"status": []string{"open"}, "counsellor": "c1", "attention": true}, func(s, x map[string]any) bool {
			return s["status"] == "open" && s["counsellor_id"] == "c1" && num(x["severity_rank"]) < 3
		}},
	}
	for _, cfg := range []string{"standard", "tight"} {
		c := w.fx.Configs[cfg]
		system(t, func(ctx context.Context, ex db.Executor) error {
			_, err := ex.Exec(ctx, "update public.org_config set config = $1::jsonb where id = 'org'", string(c))
			return err
		})
		for _, f := range filters {
			p := map[string]any{"now": w.fx.Now}
			for k, v := range f.p {
				p[k] = v
			}
			want := map[string]bool{}
			for id, s := range w.fx.Summaries {
				if f.want(s, w.fx.States[cfg][id]) {
					want[id] = true
				}
			}
			label := fmt.Sprintf("%s %v", cfg, f.p)
			if len(want) == 0 && !emptyByDesign[f.p["q"]] {
				t.Errorf("%s: the fixture has no case for this filter, so it proves nothing", label)
			}
			for _, srt := range []string{"updated", "severity"} {
				p["sort"] = srt
				rows := allPages(t, "cases_page", w.super.Token, p, 41, caseID)
				sameSets(t, label+" sort "+srt, want, idSet(rows))
			}
			delete(p, "sort")
			p["cap"] = 100000
			b, _ := json.Marshal(map[string]any{"p": p})
			r := rpc(t, "cases_count", w.super.Token, string(b))
			expect(t, r, http.StatusOK, "")
			if r.Body != fmt.Sprint(len(want)) {
				t.Errorf("%s: cases_count %s, want %d", label, r.Body, len(want))
			}
		}
	}
	// The count stops at its cap.
	r := rpc(t, "cases_count", w.super.Token, `{"p":{"cap":5}}`)
	expect(t, r, http.StatusOK, "")
	if r.Body != "5" {
		t.Fatalf("capped count: %s", r.Body)
	}
}

func TestPagedReadsRefuseMalformedRequests(t *testing.T) {
	w := setupPaging(t)
	for _, body := range []string{
		`{"p":{"sort":"nonsense"}}`,
		`{"p":{"after":{"k":["x"],"id":"a"}}}`,
		`{"p":{"after":{"k":[true],"id":"a"}}}`,
		`{"p":{"sort":"severity","after":{"k":[0,"not a time"],"id":"a"}}}`,
		`{"p":{"stage":1e9}}`,
	} {
		r := rpc(t, "cases_page", w.super.Token, body)
		if r.Status < 400 || r.Status >= 500 {
			t.Errorf("%s: status %d, want a 4xx refusal: %s", body, r.Status, r.Body)
		}
	}
	// Values are data, never SQL: a quote in a filter is just a character.
	for _, body := range []string{
		`{"p":{"q":"x'' or ''1''=''1"}}`,
		`{"p":{"counsellor":"c1' or '1'='1"}}`,
		`{"p":{"status":["open') or ('1'='1"]}}`,
		`{"p":{"retention":["overdue'); select 1; --"]}}`,
	} {
		r := rpc(t, "cases_page", w.super.Token, body)
		expect(t, r, http.StatusOK, "")
		if n := len(rowsOf(t, r.Body)); n != 0 {
			t.Errorf("%s: %d rows; a quoted value must match nothing", body, n)
		}
	}
	var n int
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select count(*) from public.cases").Scan(&n)
	})
	if n != len(w.fx.Cases) {
		t.Fatalf("cases table has %d rows after hostile requests, want %d", n, len(w.fx.Cases))
	}
}

func TestSearchNeverReachesBeyondVisibility(t *testing.T) {
	w := setupPaging(t)
	vis := visible(t, w.c1)
	// Every fixture case matches "student"; the counsellor gets only their own.
	rows := allPages(t, "cases_page", w.c1.Token, map[string]any{"q": "student"}, 50, caseID)
	sameSets(t, "counsellor search", vis, idSet(rows))
	rows = allPages(t, "cases_page", w.super.Token, map[string]any{"q": "student"}, 50, caseID)
	if len(rows) != len(w.fx.Cases) {
		t.Fatalf("super admin search found %d of %d", len(rows), len(w.fx.Cases))
	}
	// The index reader answers the counsellor with their own ids only, and is not an HTTP RPC.
	var ids []string
	if err := pool.WithUser(context.Background(), principalOf(w.c1), func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select coalesce(array_agg(x), '{}') from public.case_search_ids('student', 1001) x").Scan(&ids)
	}); err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, id := range ids {
		got[id] = true
	}
	sameSets(t, "case_search_ids as counsellor", vis, got)
	for _, fn := range []string{"case_search_ids", "user_search_ids", "dashboard_shared", "dashboard_compute", "dashboard_refresh", "case_filter", "case_visibility_sql"} {
		r := rpc(t, fn, w.super.Token, `{}`)
		if r.Status != http.StatusNotFound {
			t.Errorf("%s is reachable over HTTP: %d %s", fn, r.Status, r.Body)
		}
	}
}

func TestDashboardSharedAnswerAndItsBoundaries(t *testing.T) {
	w := setupPaging(t)
	get := func(id identity) map[string]any {
		r := rpc(t, "dashboard_summary", id.Token, `{"p":{}}`)
		expect(t, r, http.StatusOK, "computedAt")
		var m map[string]any
		_ = json.Unmarshal([]byte(r.Body), &m)
		return m
	}
	a := get(w.super)
	if a["total"] != float64(len(w.fx.Cases)) {
		t.Fatalf("super admin total %v", a["total"])
	}
	if b := get(w.admin); b["computedAt"] != a["computedAt"] {
		t.Fatalf("admin was not served the shared answer: %v vs %v", b["computedAt"], a["computedAt"])
	}
	// A change to any case makes the next reader recompute.
	data := loadCaseData(t, w.studentCase)
	data["status"] = "hold"
	expect(t, saveCase(t, w.super.Token, w.studentCase, int(data["rev"].(float64))+1, data), http.StatusOK, "")
	c := get(w.super)
	if c["computedAt"] == a["computedAt"] {
		t.Fatal("the shared dashboard was not recomputed after a case changed")
	}
	if st := c["status"].(map[string]any); st["hold"] == a["status"].(map[string]any)["hold"] {
		t.Fatalf("hold count did not move: %v", st)
	}
	// A counsellor sees their own figures, computed under their own visibility.
	if d := get(w.c1); d["total"] != float64(len(visible(t, w.c1))) {
		t.Fatalf("counsellor total %v, visible %d", d["total"], len(visible(t, w.c1)))
	}
	err := pool.WithUser(context.Background(), principalOf(w.c1), func(ctx context.Context, ex db.Executor) error {
		var s string
		return ex.QueryRow(ctx, "select public.dashboard_shared()::text").Scan(&s)
	})
	if err == nil || !strings.Contains(err.Error(), "42501") {
		t.Fatalf("counsellor reached the shared dashboard: %v", err)
	}
	// Asking dashboard_compute for "all" still only aggregates what the policy shows.
	var total float64
	if err := pool.WithUser(context.Background(), principalOf(w.c1), func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select (public.dashboard_compute('all', null, now()) ->> 'total')::float8").Scan(&total)
	}); err != nil {
		t.Fatal(err)
	}
	if total != float64(len(visible(t, w.c1))) {
		t.Fatalf("dashboard_compute('all') as counsellor counted %v cases", total)
	}
	err = pool.WithUser(context.Background(), principalOf(w.super), func(ctx context.Context, ex db.Executor) error {
		var n int
		return ex.QueryRow(ctx, "select public.dashboard_refresh()").Scan(&n)
	})
	if err == nil || !strings.Contains(err.Error(), "42501") {
		t.Fatalf("an application role ran dashboard_refresh: %v", err)
	}
	system(t, func(ctx context.Context, ex db.Executor) error {
		var n int
		return ex.QueryRow(ctx, "select public.dashboard_refresh()").Scan(&n)
	})
}

func TestRegistersPageCompletely(t *testing.T) {
	w := setupPaging(t)
	var transfers, decided, pending int
	system(t, func(ctx context.Context, ex db.Executor) error {
		if err := ex.QueryRow(ctx, "select count(*) from public.case_transfers").Scan(&transfers); err != nil {
			return err
		}
		return ex.QueryRow(ctx, "select count(*) filter (where status in ('approved', 'returned')), count(*) filter (where status = 'pending') from public.case_gates").Scan(&decided, &pending)
	})
	// What the documents hold, independently of the triggers.
	var wantDecided, wantPending, wantTransfers, approved, firstRound int
	for _, c := range w.fx.Cases {
		var doc struct {
			Gates []struct {
				Status string `json:"status"`
				Round  int    `json:"round"`
			} `json:"gates"`
			Transfers []any `json:"transfers"`
		}
		_ = json.Unmarshal(c, &doc)
		wantTransfers += len(doc.Transfers)
		for _, g := range doc.Gates {
			switch g.Status {
			case "pending":
				wantPending++
			case "approved":
				wantDecided++
				approved++
				if g.Round == 1 {
					firstRound++
				}
			case "returned":
				wantDecided++
			}
		}
	}
	if transfers != wantTransfers || decided != wantDecided || pending != wantPending {
		t.Fatalf("registers hold %d transfers, %d decided, %d pending; documents hold %d, %d, %d", transfers, decided, pending, wantTransfers, wantDecided, wantPending)
	}
	tk := func(r map[string]any) string { return fmt.Sprint(r["case_id"], "/", r["transfer_id"]) }
	rows := allPages(t, "transfers_page", w.super.Token, map[string]any{}, 23, tk)
	sameSequence(t, "transfers_page", sqlOrder(t, "select case_id || '/' || transfer_id from public.case_transfers order by sort_at desc, case_id collate \"C\" desc, transfer_id collate \"C\" desc"), rows, tk)
	gk := func(r map[string]any) string { return fmt.Sprint(r["case_id"], "/", r["gate_id"]) }
	sameSequence(t, "gates_page decided", sqlOrder(t, "select case_id || '/' || gate_id from public.case_gates where status in ('approved', 'returned') order by sort_decided desc, case_id collate \"C\" desc, gate_id collate \"C\" desc"),
		allPages(t, "gates_page", w.super.Token, map[string]any{}, 17, gk), gk)
	sameSequence(t, "gates_page pending", sqlOrder(t, "select case_id || '/' || gate_id from public.case_gates where status = 'pending' order by sort_submitted, case_id collate \"C\", gate_id collate \"C\""),
		allPages(t, "gates_page", w.super.Token, map[string]any{"status": "pending"}, 17, gk), gk)
	// A counsellor sees the gates of their own cases only; without dataprotection.read, no transfers.
	vis := visible(t, w.c1)
	for _, r := range allPages(t, "gates_page", w.c1.Token, map[string]any{}, 50, gk) {
		if !vis[r["case_id"].(string)] {
			t.Fatalf("counsellor saw a gate of case %v", r["case_id"])
		}
	}
	if n := len(allPages(t, "transfers_page", w.c1.Token, map[string]any{}, 50, tk)); n != 0 {
		t.Fatalf("counsellor read %d transfer records", n)
	}
	r := rpc(t, "gate_stats", w.super.Token, "{}")
	expect(t, r, http.StatusOK, "")
	var gs map[string]any
	_ = json.Unmarshal([]byte(r.Body), &gs)
	if gs["decided"] != float64(wantDecided) || gs["approved"] != float64(approved) || gs["firstRoundApproved"] != float64(firstRound) || gs["pending"] != float64(wantPending) {
		t.Fatalf("gate_stats %v; want decided %d approved %d first-round %d pending %d", gs, wantDecided, approved, firstRound, wantPending)
	}
	// A document edit moves the registers with it.
	data := loadCaseData(t, w.studentCase)
	data["transfers"] = []any{map[string]any{"id": "t-new", "at": "2026-09-20T00:00:00.000Z", "recipient": "Uni", "safeguard": "None recorded"}}
	data["gates"] = []any{}
	expect(t, saveCase(t, w.super.Token, w.studentCase, int(data["rev"].(float64))+1, data), http.StatusOK, "")
	system(t, func(ctx context.Context, ex db.Executor) error {
		var nt, ng int
		if err := ex.QueryRow(ctx, "select (select count(*) from public.case_transfers where case_id = $1::text), (select count(*) from public.case_gates where case_id = $1::text)", w.studentCase).Scan(&nt, &ng); err != nil {
			return err
		}
		if nt != 1 || ng != 0 {
			return fmt.Errorf("registers for the edited case: %d transfers, %d gates", nt, ng)
		}
		return nil
	})
}

func TestUsersPageFollowsPolicyAndSearch(t *testing.T) {
	w := setupPaging(t)
	system(t, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, `insert into public.app_users (id, email, name, role, active, created_at)
			select 'u' || g, 'person' || g || '@example.com', 'Person ' || g, case when g % 3 = 0 then 'student' else 'counsellor' end, g % 7 <> 0, now()
			from generate_series(1, 120) g`)
		return err
	})
	uk := func(r map[string]any) string { return r["id"].(string) }
	var staff, matching int
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select count(*) filter (where role <> 'student'), count(*) filter (where lower(name || ' ' || email) like '%person 1%') from public.app_users").Scan(&staff, &matching)
	})
	if n := len(allPages(t, "users_page", w.super.Token, map[string]any{"role": "staff"}, 13, uk)); n != staff {
		t.Fatalf("staff pages returned %d of %d", n, staff)
	}
	sameSequence(t, "users_page", sqlOrder(t, "select id from public.app_users order by name_key collate \"C\", id collate \"C\""), allPages(t, "users_page", w.super.Token, map[string]any{}, 13, uk), uk)
	// Selective (trigram) and short (scan) searches agree with LIKE.
	if n := len(allPages(t, "users_page", w.super.Token, map[string]any{"q": "person 1"}, 13, uk)); n != matching {
		t.Fatalf("search 'person 1': %d, want %d", n, matching)
	}
	if n := len(allPages(t, "users_page", w.super.Token, map[string]any{"q": "n 1", "active": true}, 13, uk)); n == 0 {
		t.Fatal("short search found nothing")
	}
	// A counsellor (staff.view, not staff.read) never sees a student profile.
	for _, r := range allPages(t, "users_page", w.c1.Token, map[string]any{"q": "person"}, 50, uk) {
		if r["role"] == "student" {
			t.Fatalf("counsellor saw student profile %v", r["id"])
		}
	}
}

func TestChangeVersionsMoveWithWrites(t *testing.T) {
	w := setupPaging(t)
	versions := func() map[string]float64 {
		r := rpc(t, "change_versions", w.super.Token, "{}")
		expect(t, r, http.StatusOK, "")
		var m map[string]float64
		_ = json.Unmarshal([]byte(r.Body), &m)
		return m
	}
	v0 := versions()
	data := loadCaseData(t, w.studentCase)
	expect(t, saveCase(t, w.super.Token, w.studentCase, int(data["rev"].(float64))+1, data), http.StatusOK, "")
	v1 := versions()
	if v1["cases"] <= v0["cases"] || v1["users"] != v0["users"] || v1["config"] != v0["config"] {
		t.Fatalf("after a case write: %v -> %v", v0, v1)
	}
	system(t, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, "update public.app_users set phone = '1' where id = 'c1'")
		return err
	})
	if v2 := versions(); v2["users"] <= v1["users"] {
		t.Fatalf("after a profile write: %v -> %v", v1, v2)
	}
}

// The retention prefilter's margin: a month-end anchor whose due date clamps (31 March plus
// three months is 30 June) must still be found at the first instant it is overdue. Without
// the margin, "anchor <= T minus three months" (30 March) would pass it over.
func TestRetentionPrefilterSurvivesMonthEnd(t *testing.T) {
	reset(t)
	super := bootstrapAdmin(t)
	system(t, func(ctx context.Context, ex db.Executor) error {
		if _, err := ex.Exec(ctx, `update public.org_config set config = '{"retention":{"exitedMonths":24,"completedMonths":84,"dormantMonths":3,"warnDays":30}}'::jsonb where id = 'org'`); err != nil {
			return err
		}
		doc := strings.Replace(strings.Replace(caseJSON("k1", "LPL-K1", "", ""), `"status":"open"`, `"status":"hold"`, 1),
			`"updatedAt":"2026-09-01T00:00:00.000Z"`, `"updatedAt":"2026-03-31T00:00:00.000Z"`, 1)
		_, err := ex.Exec(ctx, "insert into public.cases (id, ref, rev, data) values ('k1', 'LPL-K1', 1, $1::jsonb)", doc)
		return err
	})
	for _, tc := range []struct {
		now  string
		want int
	}{{"2026-06-30T23:59:59Z", 0}, {"2026-07-01T00:00:00Z", 1}} {
		for _, p := range []string{`"retention":["overdue"]`, `"attention":true`} {
			r := rpc(t, "cases_page", super.Token, fmt.Sprintf(`{"p":{"now":%q,%s}}`, tc.now, p))
			expect(t, r, http.StatusOK, "")
			if n := len(rowsOf(t, r.Body)); n != tc.want {
				t.Errorf("at %s with {%s}: %d rows, want %d", tc.now, p, n, tc.want)
			}
		}
	}
}
