// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package integration

// The case order stamps (v6.6, public.case_stamps). The severity, urgency and retention orders
// read candidates from them while they are valid and evaluate everything else live; the parity
// suites (paging_test.go) run with every stamp fresh and with every stamp stale, and require the
// reference answer both ways. These tests pin down the stamps themselves: their windows hold,
// the pages trust exactly the valid ones, only callers who see every case can read them, and
// writes, time and the service levels keep them current.

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"lpl-api/internal/db"
	"lpl-api/internal/workers"
)

// The ways every parity query runs; prepare is called after each change of configuration.
// Stale stamps are taken forty days later, so their keys are wrong as well as out of date: a
// page that trusted one would show it.
var stampModes = []struct {
	name    string
	prepare func(t *testing.T, now string)
}{
	{"stamps fresh", func(t *testing.T, now string) { restampSome(t, now, 0, "true") }},
	{"stamps stale", func(t *testing.T, now string) { restampSome(t, now, 40, "true") }},
	{"stamps mixed", func(t *testing.T, now string) {
		restampSome(t, now, 0, "true")
		restampSome(t, now, 40, "hashtext(id) % 2 = 0")
	}},
}

// restampSome takes the stamps of the cases matching where as at now plus days.
func restampSome(t *testing.T, now string, days int, where string) {
	t.Helper()
	at, err := time.Parse(time.RFC3339Nano, now)
	if err != nil {
		t.Fatal(err)
	}
	system(t, func(ctx context.Context, ex db.Executor) error {
		if _, err := ex.Exec(ctx, "select set_config('lpl.now', $1, true)", at.AddDate(0, 0, days).Format(time.RFC3339Nano)); err != nil {
			return err
		}
		_, err := ex.Exec(ctx, "select public.case_restamp(array(select id from public.cases where "+where+"))")
		return err
	})
}

// asOwner runs one statement as the database owner: the stamps table has no grants at all.
func asOwner(t *testing.T, sql string, args ...any) {
	t.Helper()
	system(t, func(ctx context.Context, ex db.Executor) error {
		if _, err := ex.Exec(ctx, "reset role"); err != nil {
			return err
		}
		_, err := ex.Exec(ctx, sql, args...)
		return err
	})
}

// restampAt takes every case's stamp as at now (the tests pin "now"; production uses the clock).
func restampAt(t *testing.T, now string) {
	t.Helper()
	system(t, func(ctx context.Context, ex db.Executor) error {
		if _, err := ex.Exec(ctx, "select set_config('lpl.now', $1, true)", now); err != nil {
			return err
		}
		_, err := ex.Exec(ctx, "select public.case_restamp(array(select id from public.cases))")
		return err
	})
}

func useConfig(t *testing.T, c json.RawMessage) {
	t.Helper()
	system(t, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, "update public.org_config set config = $1::jsonb where id = 'org'", string(c))
		return err
	})
}

// asCaller runs fn as a signed-in user, the way PostgREST would (role and claims).
func asCaller(t *testing.T, who identity, fn func(ctx context.Context, ex db.Executor) error) error {
	t.Helper()
	return pool.WithSystem(context.Background(), func(ctx context.Context, ex db.Executor) error {
		claims, _ := json.Marshal(map[string]any{"sub": who.AuthID, "role": "authenticated"})
		if _, err := ex.Exec(ctx, "set local role authenticated"); err != nil {
			return err
		}
		if _, err := ex.Exec(ctx, "select set_config('request.jwt.claims', $1, true)", string(claims)); err != nil {
			return err
		}
		return fn(ctx, ex)
	})
}

type stamp struct {
	Until    time.Time `json:"until"`
	Infinite bool      `json:"infinite"`
	Rank     int       `json:"rank"`
	Worst    *int      `json:"worst"`
	Cfg      string    `json:"cfg"`
	At       time.Time `json:"at"`
}

func readStamps(t *testing.T) map[string]stamp {
	t.Helper()
	out := map[string]stamp{}
	system(t, func(ctx context.Context, ex db.Executor) error {
		if _, err := ex.Exec(ctx, "reset role"); err != nil {
			return err
		}
		var raw []byte
		if err := ex.QueryRow(ctx, `select coalesce(jsonb_object_agg(id, jsonb_build_object(
		    'until', case when until = 'infinity' then now() else until end, 'infinite', until = 'infinity',
		    'rank', severity_rank, 'worst', worst_days, 'cfg', cfg, 'at', at)), '{}') from public.case_stamps`).Scan(&raw); err != nil {
			return err
		}
		return json.Unmarshal(raw, &out)
	})
	return out
}

type liveKeys struct {
	Rank  int  `json:"rank"`
	Worst *int `json:"worst"`
}

// liveAt evaluates every case at one instant, as the pages do.
func liveAt(t *testing.T, at time.Time) map[string]liveKeys {
	t.Helper()
	out := map[string]liveKeys{}
	system(t, func(ctx context.Context, ex db.Executor) error {
		if _, err := ex.Exec(ctx, "select set_config('lpl.now', $1, true)", at.Format(time.RFC3339Nano)); err != nil {
			return err
		}
		var raw []byte
		if err := ex.QueryRow(ctx, `select coalesce(jsonb_object_agg(id, jsonb_build_object('rank', severity_rank, 'worst', worst_days)), '{}')
		    from public.case_state`).Scan(&raw); err != nil {
			return err
		}
		return json.Unmarshal(raw, &out)
	})
	return out
}

func sameInt(a, b *int) bool { return (a == nil && b == nil) || (a != nil && b != nil && *a == *b) }

func intStr(p *int) string {
	if p == nil {
		return "null"
	}
	return fmt.Sprint(*p)
}

// A stamp holds over its whole window: at hourly instants across four days, and one microsecond
// before each window closes, every case whose window contains the instant evaluates to exactly
// its stamped keys. And the windows are not vacuous: some close within the four days, and at
// the instant one closes, some key has moved.
func TestStampWindowsHold(t *testing.T) {
	w := setupPaging(t)
	now, err := time.Parse(time.RFC3339Nano, w.fx.Now)
	if err != nil {
		t.Fatal(err)
	}
	for _, cfg := range []string{"standard", "tight"} {
		useConfig(t, w.fx.Configs[cfg])
		restampAt(t, w.fx.Now)
		stamps := readStamps(t)
		if len(stamps) != len(w.fx.Summaries) {
			t.Fatalf("%s: %d stamps for %d cases", cfg, len(stamps), len(w.fx.Summaries))
		}
		closing, moved := 0, 0
		for h := 0; h <= 96; h++ {
			at := now.Add(time.Duration(h) * time.Hour)
			live := liveAt(t, at)
			for id, s := range stamps {
				if !s.Infinite && !at.Before(s.Until) {
					continue
				}
				if k := live[id]; k.Rank != s.Rank || !sameInt(k.Worst, s.Worst) {
					t.Errorf("%s: %s at %s evaluates to rank %d, worst %s; stamped %d, %s until %s", cfg, id, at.Format(time.RFC3339), k.Rank, intStr(k.Worst), s.Rank, intStr(s.Worst), s.Until.Format(time.RFC3339))
				}
			}
		}
		for id, s := range stamps {
			if s.Infinite {
				continue
			}
			before := liveAt(t, s.Until.Add(-time.Microsecond))[id]
			if before.Rank != s.Rank || !sameInt(before.Worst, s.Worst) {
				t.Errorf("%s: %s just before its window closes evaluates to rank %d, worst %s; stamped %d, %s", cfg, id, before.Rank, intStr(before.Worst), s.Rank, intStr(s.Worst))
			}
			if s.Until.Before(now.Add(96 * time.Hour)) {
				closing++
				if after := liveAt(t, s.Until)[id]; after.Rank != s.Rank || !sameInt(after.Worst, s.Worst) {
					moved++
				}
			}
		}
		if closing == 0 || moved == 0 {
			t.Errorf("%s: %d windows close within four days and %d of them move a key: the property proves nothing", cfg, closing, moved)
		}
	}
}

// The pages trust exactly the stamps that are valid now. A fresh stamp with a wrong key changes
// the answer (so the stamps really are read); the same stamp, once its window has closed, is
// ignored and the answer is right again.
func TestStampsAreTrustedOnlyWhileValid(t *testing.T) {
	w := setupPaging(t)
	useConfig(t, w.fx.Configs["standard"])
	restampAt(t, w.fx.Now)
	p := map[string]any{"now": w.fx.Now, "sort": "severity"}
	want := allPages(t, "cases_page", w.super.Token, p, 37, caseID)
	victim := caseID(want[len(want)-1])
	asOwner(t, "update public.case_stamps set severity_rank = -1 where id = $1", victim)
	got := allPages(t, "cases_page", w.super.Token, p, 37, caseID)
	if len(got) == len(want) {
		t.Fatalf("a corrupted fresh stamp changed nothing: the severity order is not reading the stamps")
	}
	// Its window closed: ignored.
	asOwner(t, "update public.case_stamps set until = '-infinity' where id = $1", victim)
	got = allPages(t, "cases_page", w.super.Token, p, 37, caseID)
	ids := func(rows []map[string]any) string {
		out := make([]string, len(rows))
		for i, r := range rows {
			out[i] = caseID(r)
		}
		return strings.Join(out, ",")
	}
	if ids(got) != ids(want) {
		t.Fatalf("with the corrupted stamp stale the page should be the live answer again")
	}
}

// Stamps say which cases exist and how urgent they are, so only a caller who may read every
// case gets anything from them; the API does not expose them at all.
func TestStampReadsAnswerOnlyCallersWhoSeeEveryCase(t *testing.T) {
	w := setupPaging(t)
	restampAt(t, w.fx.Now)
	read := func(who identity) (ids, stale []string) {
		if err := asCaller(t, who, func(ctx context.Context, ex db.Executor) error {
			if _, err := ex.Exec(ctx, "select set_config('lpl.now', $1, true)", w.fx.Now); err != nil {
				return err
			}
			if err := ex.QueryRow(ctx, `select (public.case_stamp_ids('{"sort":"severity"}', 10)).ids`).Scan(&ids); err != nil {
				return err
			}
			return ex.QueryRow(ctx, "select public.case_stale_ids(10)").Scan(&stale)
		}); err != nil {
			t.Fatal(err)
		}
		return ids, stale
	}
	if ids, stale := read(w.super); len(ids) != 10 || stale == nil {
		t.Fatalf("SUPER ADMIN: %d ids, stale %v", len(ids), stale)
	}
	for _, who := range []identity{w.c1, w.student} {
		if ids, stale := read(who); ids != nil || stale != nil {
			t.Fatalf("%s read stamps: %v %v", who.AppID, ids, stale)
		}
	}
	// Not part of the API.
	for _, fn := range []string{"case_stamp_ids", "case_stale_ids", "case_restamp", "case_restamp_due", "gate_stats_shared"} {
		if r := rpc(t, fn, w.super.Token, `{}`); r.Status == http.StatusOK {
			t.Fatalf("lpl-api serves %s: %d %s", fn, r.Status, r.Body)
		}
	}
	// The shared approval statistics refuse a caller who does not see every case; gate_stats
	// answers them from what they can see.
	if err := asCaller(t, w.c1, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, "select public.gate_stats_shared()")
		return err
	}); err == nil || !strings.Contains(err.Error(), "42501") {
		t.Fatalf("gate_stats_shared as a counsellor: %v", err)
	}
	for _, who := range []identity{w.super, w.c1} {
		r := rpc(t, "gate_stats", who.Token, `{}`)
		expect(t, r, http.StatusOK, "")
	}
}

// Every write retakes the stamp; as time passes and when the service levels change, the worker
// retakes the stamps that stopped being valid, until none are left.
func TestRestampFollowsWritesTimeAndSettings(t *testing.T) {
	w := setupPaging(t)
	stale := func(at string) (n int) {
		system(t, func(ctx context.Context, ex db.Executor) error {
			if _, err := ex.Exec(ctx, "reset role"); err != nil {
				return err
			}
			return ex.QueryRow(ctx, `select count(*) from public.case_stamps where until <= $1::timestamptz or at > $1::timestamptz or cfg <> public.case_stamp_key()`, at).Scan(&n)
		})
		return n
	}
	var cases int
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select count(*) from public.cases").Scan(&cases)
	})
	if got := len(readStamps(t)); got != cases {
		t.Fatalf("%d stamps for %d cases: inserts must take one", got, cases)
	}

	// A write retakes the stamp of the case it touched, at that moment.
	pinned := "2031-01-02T03:04:05Z"
	var id string
	for k := range w.fx.Summaries {
		id = k
		break
	}
	system(t, func(ctx context.Context, ex db.Executor) error {
		if _, err := ex.Exec(ctx, "reset role"); err != nil {
			return err
		}
		if _, err := ex.Exec(ctx, "select set_config('lpl.now', $1, true)", pinned); err != nil {
			return err
		}
		_, err := ex.Exec(ctx, "update public.cases set data = data where id = $1", id)
		return err
	})
	if at := readStamps(t)[id].At.UTC().Format(time.RFC3339); at != pinned {
		t.Fatalf("after a write the stamp was taken at %s, want %s", at, pinned)
	}

	// Time: a month after the fixture's "now", windows have closed; the worker's pass retakes
	// them (as at that instant) until none is left.
	restampAt(t, w.fx.Now)
	later := time.Now().UTC().Format(time.RFC3339Nano)
	if stale(later) == 0 {
		t.Fatal("no stamp taken at the fixture's time is stale now: the test proves nothing")
	}
	wk := workers.New(pool, nil, nil, workers.Config{})
	for i := 0; i < 5 && stale(time.Now().UTC().Format(time.RFC3339Nano)) > 0; i++ {
		if _, err := wk.RestampOnce(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if n := stale(time.Now().UTC().Format(time.RFC3339Nano)); n != 0 {
		t.Fatalf("%d stamps still stale after the worker's passes", n)
	}

	// Settings: a change of service levels makes every stamp stale, and one pass retakes them.
	useConfig(t, w.fx.Configs["tight"])
	if n := stale(time.Now().UTC().Format(time.RFC3339Nano)); n != cases {
		t.Fatalf("after a change of service levels %d of %d stamps are stale", n, cases)
	}
	if n, err := wk.RestampOnce(context.Background()); err != nil || n != cases {
		t.Fatalf("RestampOnce retook %d of %d: %v", n, cases, err)
	}
	if n := stale(time.Now().UTC().Format(time.RFC3339Nano)); n != 0 {
		t.Fatalf("%d stamps still stale", n)
	}
}

// A search in the list order takes one of two routes (public.case_search_page_ids): a walk
// down the list, or every match through the trigram index, sorted. Forced down the second, it
// gives the same pages as cases_page, for each role's visibility.
func TestSearchPageTakesEitherRoute(t *testing.T) {
	w := setupPaging(t)
	for _, who := range []identity{w.super, w.c1} {
		for _, p := range []map[string]any{
			{"q": "student"}, {"q": "student 12"}, {"q": "ia"}, {"q": "LPL-GEN-3"},
			{"q": "student", "status": []string{"open"}}, {"q": "e", "stage": 3}, {"q": "student", "counsellor": "c1"},
		} {
			want := allPages(t, "cases_page", who.Token, p, 37, caseID)
			if len(want) == 0 {
				t.Fatalf("%s %v: no rows, the test proves nothing", who.AppID, p)
			}
			// From the start, and after the 37th row.
			for _, from := range []int{0, 37} {
				if from >= len(want) {
					continue
				}
				q := map[string]any{}
				for k, v := range p {
					q[k] = v
				}
				if from > 0 {
					q["after"] = want[from-1]["cursor"]
				}
				b, _ := json.Marshal(q)
				var got []string
				if err := asCaller(t, who, func(ctx context.Context, ex db.Executor) error {
					if _, err := ex.Exec(ctx, "select set_config('lpl.search_walk', '1', true)"); err != nil {
						return err
					}
					return ex.QueryRow(ctx, "select public.case_search_page_ids($1::jsonb, 50)", string(b)).Scan(&got)
				}); err != nil {
					t.Fatal(err)
				}
				var exp []string
				for i := from; i < len(want) && i < from+50; i++ {
					exp = append(exp, caseID(want[i]))
				}
				if strings.Join(got, ",") != strings.Join(exp, ",") {
					t.Errorf("%s %v from %d: through the index %v, the list gives %v", who.AppID, p, from, got, exp)
				}
			}
		}
	}
}
