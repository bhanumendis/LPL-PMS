// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
//
// The background workers against Postgres and a fake push service that decrypts what it
// receives as a browser would: delivery exactly once across concurrent dispatchers, leases and
// retries, revocation, the active-account rule, service-level reminders against the TypeScript
// reference, retention, and who may call the functions behind them.
package integration

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"lpl-api/internal/db"
	"lpl-api/internal/webpush"
	"lpl-api/internal/workers"
)

// ---------- a push service that decrypts ----------

type device struct {
	key  *ecdh.PrivateKey
	auth []byte
	path string
}

type pushService struct {
	ts       *httptest.Server
	mu       sync.Mutex
	devices  map[string]*device
	status   map[string]int
	received map[string][]map[string]string
	headers  map[string][]http.Header
}

func newPushService(t *testing.T) *pushService {
	t.Helper()
	p := &pushService{devices: map[string]*device{}, status: map[string]int{}, received: map[string][]map[string]string{}, headers: map[string][]http.Header{}}
	p.ts = httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		p.mu.Lock()
		defer p.mu.Unlock()
		d := p.devices[r.URL.Path]
		if d == nil {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if s := p.status[r.URL.Path]; s != 0 {
			w.WriteHeader(s)
			return
		}
		plain, err := webpush.Decrypt(body, d.key, d.auth)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		var m map[string]string
		_ = json.Unmarshal(plain, &m)
		p.received[r.URL.Path] = append(p.received[r.URL.Path], m)
		p.headers[r.URL.Path] = append(p.headers[r.URL.Path], r.Header.Clone())
		w.WriteHeader(http.StatusCreated)
	}))
	t.Cleanup(p.ts.Close)
	return p
}

func (p *pushService) device(t *testing.T, name string) *device {
	t.Helper()
	k, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	auth := make([]byte, 16)
	_, _ = rand.Read(auth)
	d := &device{key: k, auth: auth, path: "/push/" + name}
	p.mu.Lock()
	p.devices[d.path] = d
	p.mu.Unlock()
	return d
}

func (p *pushService) endpoint(d *device) string { return p.ts.URL + d.path }

func (p *pushService) answer(d *device, status int) {
	p.mu.Lock()
	p.status[d.path] = status
	p.mu.Unlock()
}

func (p *pushService) got(d *device) []map[string]string {
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]map[string]string(nil), p.received[d.path]...)
}

func (p *pushService) requests() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	n := 0
	for _, r := range p.received {
		n += len(r)
	}
	return n
}

var b64 = base64.RawURLEncoding

// subscribe registers the device for the identity the way the browser does (the RPC).
func subscribe(t *testing.T, id identity, p *pushService, d *device) {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"p_endpoint": p.endpoint(d), "p_p256dh": b64.EncodeToString(d.key.PublicKey().Bytes()),
		"p_auth": b64.EncodeToString(d.auth), "p_user_agent": "test"})
	r := rpc(t, "save_push_subscription", id.Token, string(body))
	if r.Status != http.StatusOK && r.Status != http.StatusNoContent {
		t.Fatalf("subscribe: %d %s", r.Status, r.Body)
	}
}

func newWorkers(t *testing.T, p *pushService) *workers.Workers {
	t.Helper()
	k, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	v, err := webpush.ParseVAPID(b64.EncodeToString(k.PublicKey().Bytes()), b64.EncodeToString(k.Bytes()), "mailto:it@test.local")
	if err != nil {
		t.Fatal(err)
	}
	var sender *webpush.Sender
	if p != nil {
		sender = webpush.NewSender(v, nil).WithClient(p.ts.Client())
		sender.AllowHost = func(h string) bool { return h == "127.0.0.1" }
	}
	return workers.New(pool, sender, slog.New(slog.NewTextHandler(io.Discard, nil)), workers.Config{RetentionDays: 90})
}

func notify(t *testing.T, recipient, title, link string, age time.Duration) string {
	t.Helper()
	var id string
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "insert into public.notifications (recipient_id, type, priority, title, body, link, at) values ($1::text, 'case_assigned', 'high', $2::text, 'Body', $3::text, now() - $4::interval) returning id",
			recipient, title, link, fmt.Sprintf("%d seconds", int(age.Seconds()))).Scan(&id)
	})
	return id
}

type pushState struct {
	Pushed   bool
	Outcome  string
	Attempts int
	Leased   bool
}

func pushStateOf(t *testing.T, id string) pushState {
	t.Helper()
	var s pushState
	var outcome *string
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select pushed_at is not null, push_outcome, push_attempts, coalesce(push_claimed_until > now(), false) from public.notifications where id = $1::text", id).
			Scan(&s.Pushed, &outcome, &s.Attempts, &s.Leased)
	})
	if outcome != nil {
		s.Outcome = *outcome
	}
	return s
}

func pushOnce(t *testing.T, w *workers.Workers) int {
	t.Helper()
	n, err := w.PushOnce(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	return n
}

// ---------- push ----------

func TestPushDeliversOnceToEveryActiveDevice(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	a := provision(t, "counsellor", "a@test.local", "A")
	b := provision(t, "counsellor", "b@test.local", "B")
	c := provision(t, "counsellor", "c@test.local", "C")
	p := newPushService(t)
	aPhone, aLaptop, bPhone := p.device(t, "a-phone"), p.device(t, "a-laptop"), p.device(t, "b-phone")
	subscribe(t, a, p, aPhone)
	subscribe(t, a, p, aLaptop)
	subscribe(t, b, p, bPhone)

	n1 := notify(t, a.AppID, "Case LPL-1 assigned to you", "#/case/c1", time.Minute)
	n2 := notify(t, a.AppID, "Outside link", "https://attacker.example/phish", time.Minute)
	n3 := notify(t, b.AppID, "For B", "#/case/c2", time.Minute)
	n4 := notify(t, c.AppID, "For C, who has no device", "#/", time.Minute)

	// Two replicas at once: the leases must split the work, not double it.
	w1, w2 := newWorkers(t, p), newWorkers(t, p)
	var wg sync.WaitGroup
	var handled [2]int
	var errs [2]error
	wg.Go(func() { handled[0], errs[0] = w1.PushOnce(context.Background()) })
	wg.Go(func() { handled[1], errs[1] = w2.PushOnce(context.Background()) })
	wg.Wait()
	if errs[0] != nil || errs[1] != nil {
		t.Fatal(errs)
	}
	if handled[0]+handled[1] != 4 {
		t.Fatalf("handled %v, want 4 in total", handled)
	}
	if got := p.requests(); got != 5 { // two devices × two for A, one for B
		t.Fatalf("%d deliveries, want 5", got)
	}
	for _, d := range []*device{aPhone, aLaptop} {
		msgs := p.got(d)
		sort.Slice(msgs, func(i, j int) bool { return msgs[i]["title"] < msgs[j]["title"] })
		if len(msgs) != 2 || msgs[0]["id"] != n1 || msgs[0]["link"] != "#/case/c1" || msgs[0]["body"] != "Body" {
			t.Fatalf("%s received %v", d.path, msgs)
		}
		if msgs[1]["id"] != n2 || msgs[1]["link"] != "#/" {
			t.Fatalf("a link outside the application reached the device: %v", msgs[1])
		}
	}
	if msgs := p.got(bPhone); len(msgs) != 1 || msgs[0]["id"] != n3 {
		t.Fatalf("B received %v", msgs)
	}
	h := p.headers[aPhone.path][0]
	if h.Get("Urgency") != "high" || h.Get("TTL") != "86400" || !strings.HasPrefix(h.Get("Authorization"), "vapid t=") {
		t.Fatalf("headers %v", h)
	}
	for id, want := range map[string]string{n1: "sent", n2: "sent", n3: "sent", n4: "no_device"} {
		if s := pushStateOf(t, id); !s.Pushed || s.Outcome != want || s.Attempts != 1 || s.Leased {
			t.Errorf("%s: %+v, want %s", id, s, want)
		}
	}
	if n := pushOnce(t, w1); n != 0 || p.requests() != 5 {
		t.Fatalf("a second run handled %d and sent %d in total", n, p.requests())
	}
}

// TestPushClaimSkipsRowsAnotherDispatcherHolds pins the race the leases exist for: while one
// replica's claim is still open, another must neither wait for it nor take the same rows.
func TestPushClaimSkipsRowsAnotherDispatcherHolds(t *testing.T) {
	reset(t)
	for i := range 3 {
		notify(t, "u1", fmt.Sprint("n", i), "#/", time.Minute)
	}
	ctx := context.Background()
	first, err := pool.Raw().Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = first.Rollback(ctx) }()
	if _, err := first.Exec(ctx, "set local role service_role"); err != nil {
		t.Fatal(err)
	}
	var held int
	if err := first.QueryRow(ctx, "select count(*) from public.push_claim(2, 60, 3600)").Scan(&held); err != nil || held != 2 {
		t.Fatalf("first claim: %d, %v", held, err)
	}
	quick, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	var ids []string
	err = pool.WithSystem(quick, func(ctx context.Context, ex db.Executor) error {
		var raw []byte
		if err := ex.QueryRow(ctx, "select coalesce(jsonb_agg(c.id), '[]') from public.push_claim(10, 60, 3600) c").Scan(&raw); err != nil {
			return err
		}
		return json.Unmarshal(raw, &ids)
	})
	if err != nil {
		t.Fatalf("second claim while the first is open: %v", err)
	}
	if len(ids) != 1 {
		t.Fatalf("second claim took %v; only the one row the first does not hold is free", ids)
	}
}

func TestPushRetriesTransientFailuresThenGivesUp(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	a := provision(t, "counsellor", "a@test.local", "A")
	p := newPushService(t)
	phone := p.device(t, "phone")
	subscribe(t, a, p, phone)
	p.answer(phone, http.StatusServiceUnavailable)
	id := notify(t, a.AppID, "Hello", "#/", time.Minute)
	w := newWorkers(t, p)

	pushOnce(t, w)
	if s := pushStateOf(t, id); s.Pushed || s.Attempts != 1 || !s.Leased {
		t.Fatalf("after a 503: %+v", s)
	}
	// Leased: nobody tries again before the backoff ends.
	if n := pushOnce(t, w); n != 0 {
		t.Fatalf("claimed %d rows under lease", n)
	}
	expire := func() {
		system(t, func(ctx context.Context, ex db.Executor) error {
			_, err := ex.Exec(ctx, "update public.notifications set push_claimed_until = now() - interval '1 second' where id = $1::text", id)
			return err
		})
	}
	for attempt := 2; attempt <= 5; attempt++ {
		expire()
		pushOnce(t, w)
		s := pushStateOf(t, id)
		if attempt < 5 && (s.Pushed || s.Attempts != attempt) {
			t.Fatalf("attempt %d: %+v", attempt, s)
		}
		if attempt == 5 && (!s.Pushed || s.Outcome != "failed" || s.Attempts != 5) {
			t.Fatalf("after five transient failures: %+v", s)
		}
	}

	// A service that recovers delivers on the next attempt.
	id2 := notify(t, a.AppID, "Second", "#/", time.Minute)
	pushOnce(t, w)
	p.answer(phone, 0)
	system(t, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, "update public.notifications set push_claimed_until = now() - interval '1 second' where id = $1::text", id2)
		return err
	})
	pushOnce(t, w)
	if s := pushStateOf(t, id2); s.Outcome != "sent" || s.Attempts != 2 || len(p.got(phone)) != 1 {
		t.Fatalf("after recovery: %+v, %d received", s, len(p.got(phone)))
	}
}

func TestPushRevokesGoneAndForeignEndpoints(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	a := provision(t, "counsellor", "a@test.local", "A")
	p := newPushService(t)
	old := p.device(t, "old")
	subscribe(t, a, p, old)
	p.answer(old, http.StatusGone)
	// A row written straight into the table (the RPC would refuse it) aimed inside the network.
	system(t, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ($1::text, 'https://169.254.169.254/latest/meta-data', $2::text, $3::text)",
			a.AppID, b64.EncodeToString(old.key.PublicKey().Bytes()), b64.EncodeToString(old.auth))
		return err
	})
	id := notify(t, a.AppID, "Hello", "#/", time.Minute)
	pushOnce(t, newWorkers(t, p))
	if s := pushStateOf(t, id); s.Outcome != "gone" {
		t.Fatalf("%+v", s)
	}
	var live int
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select count(*) from public.push_subscriptions where revoked_at is null").Scan(&live)
	})
	if live != 0 {
		t.Fatalf("%d subscriptions still active after 410 and a refused endpoint", live)
	}
}

func TestPushSkipsDeactivatedAccountsAndStaleRows(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	a := provision(t, "counsellor", "a@test.local", "A")
	b := provision(t, "counsellor", "b@test.local", "B")
	p := newPushService(t)
	aPhone, bPhone := p.device(t, "a"), p.device(t, "b")
	subscribe(t, a, p, aPhone)
	subscribe(t, b, p, bPhone)
	system(t, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, "update public.app_users set active = false where id = $1::text", b.AppID)
		return err
	})
	forB := notify(t, b.AppID, "Case details", "#/", time.Minute)
	stale := notify(t, a.AppID, "Two days old", "#/", 48*time.Hour)
	pushOnce(t, newWorkers(t, p))
	if p.requests() != 0 {
		t.Fatalf("%d pushes sent to a deactivated account or for a stale row", p.requests())
	}
	if s := pushStateOf(t, forB); s.Outcome != "no_device" {
		t.Fatalf("deactivated: %+v", s)
	}
	if s := pushStateOf(t, stale); s.Outcome != "expired" || s.Attempts != 0 {
		t.Fatalf("stale: %+v", s)
	}
}

func TestPushIsOffWithoutKeys(t *testing.T) {
	reset(t)
	id := notify(t, "someone", "Hello", "#/", time.Minute)
	if n := pushOnce(t, newWorkers(t, nil)); n != 0 {
		t.Fatalf("handled %d without a sender", n)
	}
	if s := pushStateOf(t, id); s.Pushed || s.Attempts != 0 {
		t.Fatalf("%+v", s)
	}
}

func TestSavePushSubscriptionMovesTheEndpointToItsNewOwner(t *testing.T) {
	reset(t)
	bootstrapAdmin(t)
	a := provision(t, "counsellor", "a@test.local", "A")
	b := provision(t, "counsellor", "b@test.local", "B")
	p := newPushService(t)
	shared := p.device(t, "shared-desk")
	subscribe(t, a, p, shared)
	subscribe(t, b, p, shared) // the next person at the same computer
	if rows := rowsOf(t, call(t, http.MethodGet, "/rest/v1/push_subscriptions?select=*", a.Token, "", nil).Body); len(rows) != 0 {
		t.Fatalf("A still holds %v", rows)
	}
	if rows := rowsOf(t, call(t, http.MethodGet, "/rest/v1/push_subscriptions?select=*", b.Token, "", nil).Body); len(rows) != 1 {
		t.Fatalf("B holds %v", rows)
	}
	key, auth := b64.EncodeToString(shared.key.PublicKey().Bytes()), b64.EncodeToString(shared.auth)
	for name, body := range map[string]map[string]string{
		"http endpoint": {"p_endpoint": "http://fcm.googleapis.com/x", "p_p256dh": key, "p_auth": auth},
		"no path":       {"p_endpoint": "https://fcm.googleapis.com", "p_p256dh": key, "p_auth": auth},
		"userinfo":      {"p_endpoint": "https://u@fcm.googleapis.com/x", "p_p256dh": key, "p_auth": auth},
		"short key":     {"p_endpoint": "https://fcm.googleapis.com/x", "p_p256dh": "abc", "p_auth": auth},
		"short auth":    {"p_endpoint": "https://fcm.googleapis.com/x", "p_p256dh": key, "p_auth": "abc"},
	} {
		body["p_user_agent"] = "test"
		raw, _ := json.Marshal(body)
		if r := rpc(t, "save_push_subscription", a.Token, string(raw)); r.Status != http.StatusBadRequest {
			t.Errorf("%s: %d %s", name, r.Status, r.Body)
		}
	}
	raw, _ := json.Marshal(map[string]string{"p_endpoint": "https://fcm.googleapis.com/x", "p_p256dh": key, "p_auth": auth, "p_user_agent": "t"})
	if r := rpc(t, "save_push_subscription", "", string(raw)); r.Status < 400 {
		t.Fatalf("anonymous subscribe: %d", r.Status)
	}
	system(t, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, "update public.app_users set active = false where id = $1::text", a.AppID)
		return err
	})
	if r := rpc(t, "save_push_subscription", a.Token, string(raw)); r.Status != http.StatusForbidden {
		t.Fatalf("deactivated subscribe: %d %s", r.Status, r.Body)
	}
}

// ---------- reminders ----------

func emitAt(t *testing.T, now string) int {
	t.Helper()
	var n int
	system(t, func(ctx context.Context, ex db.Executor) error {
		if _, err := ex.Exec(ctx, "select set_config('lpl.now', $1::text, true)", now); err != nil {
			return err
		}
		return ex.QueryRow(ctx, "select public.emit_sla_notifications()").Scan(&n)
	})
	return n
}

func TestSLARemindersFollowTheReferenceClocks(t *testing.T) {
	fx := loadFixture(t)
	for _, cfgName := range []string{"standard", "tight"} {
		t.Run(cfgName, func(t *testing.T) {
			reset(t)
			seedFixture(t, fx)
			system(t, func(ctx context.Context, ex db.Executor) error {
				_, err := ex.Exec(ctx, "update public.org_config set config = $1::jsonb where id = 'org'", string(fx.Configs[cfgName]))
				return err
			})
			// Every clock the reference shows as due soon or breached, on a case with a
			// counsellor, is one reminder.
			want := map[string]int{}
			total := 0
			for id, st := range fx.States[cfgName] {
				if fx.Summaries[id]["counsellor_id"] == nil {
					continue
				}
				if k := int(st["breached"].(float64) + st["due_soon"].(float64)); k > 0 {
					want[id] = k
					total += k
				}
			}
			if total == 0 {
				t.Fatal("the fixture has no running clocks to remind about")
			}
			if n := emitAt(t, fx.Now); n != total {
				t.Fatalf("emitted %d, the reference has %d", n, total)
			}
			got := map[string]int{}
			var rows []struct {
				CaseID, Recipient, Type, Title, Link, Key string
				Step                                      int
			}
			system(t, func(ctx context.Context, ex db.Executor) error {
				var raw []byte
				if err := ex.QueryRow(ctx, `select coalesce(jsonb_agg(jsonb_build_object('CaseID', case_id, 'Recipient', recipient_id, 'Type', type, 'Title', title,
				  'Link', link, 'Key', dedupe_key, 'Step', step)), '[]') from public.notifications where type in ('sla_due', 'sla_breached')`).Scan(&raw); err != nil {
					return err
				}
				return json.Unmarshal(raw, &rows)
			})
			for _, r := range rows {
				got[r.CaseID]++
				sum := fx.Summaries[r.CaseID]
				if r.Recipient != sum["counsellor_id"] || !strings.HasSuffix(r.Title, " on "+sum["ref"].(string)) || r.Link != fmt.Sprintf("#/case/%s/step/%d", r.CaseID, r.Step) {
					t.Errorf("reminder %+v", r)
				}
				parts := strings.Split(r.Key, ":")
				if len(parts) != 4 || parts[0] != r.CaseID || (parts[2] == "breached") != (r.Type == "sla_breached") {
					t.Errorf("dedupe key %q for %+v", r.Key, r)
				}
				if _, err := time.Parse("2006-01-02", parts[len(parts)-1]); err != nil {
					t.Errorf("dedupe key %q does not end in a date", r.Key)
				}
			}
			for id, k := range want {
				if got[id] != k {
					t.Errorf("%s: %d reminders, reference %d", id, got[id], k)
				}
			}
			if len(got) != len(want) {
				t.Errorf("reminded %d cases, reference %d", len(got), len(want))
			}
			// Idempotent at the same moment; a clock that breaches later reminds again.
			if n := emitAt(t, fx.Now); n != 0 {
				t.Fatalf("a re-run emitted %d", n)
			}
			later, _ := time.Parse(time.RFC3339, fx.Now)
			if n := emitAt(t, later.Add(60*24*time.Hour).Format(time.RFC3339)); n == 0 {
				t.Fatal("nothing new two months on: due-soon clocks should have breached")
			}
		})
	}
}

func TestSLARemindersRunOnOneReplicaAtATime(t *testing.T) {
	fx := loadFixture(t)
	reset(t)
	seedFixture(t, fx)
	w := newWorkers(t, nil)
	ctx := context.Background()
	tx, err := pool.Raw().Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := tx.Exec(ctx, "select pg_advisory_xact_lock(hashtext('lpl.sla_reminders'))"); err != nil {
		t.Fatal(err)
	}
	if n, err := w.SLAOnce(ctx); err != nil || n != 0 {
		t.Fatalf("while another replica runs: %d, %v", n, err)
	}
	_ = tx.Rollback(ctx)
	if n, err := w.SLAOnce(ctx); err != nil || n == 0 {
		t.Fatalf("alone: %d, %v", n, err)
	}
}

// ---------- retention and the dashboard ----------

func TestPruneKeepsWhatIsWithinRetention(t *testing.T) {
	reset(t)
	for range 3 {
		notify(t, "u1", "old", "#/", 100*24*time.Hour)
	}
	recent := notify(t, "u1", "recent", "#/", 10*24*time.Hour)
	system(t, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, revoked_at) values
		  ('u1', 'https://fcm.googleapis.com/fcm/send/long-gone', 'k', 'a', now() - interval '40 days'),
		  ('u1', 'https://fcm.googleapis.com/fcm/send/recently', 'k', 'a', now() - interval '10 days'),
		  ('u1', 'https://fcm.googleapis.com/fcm/send/active', 'k', 'a', null)`)
		return err
	})
	n, err := newWorkers(t, nil).PruneOnce(context.Background())
	if err != nil || n != 3 {
		t.Fatalf("pruned %d, %v", n, err)
	}
	var left, subs int
	system(t, func(ctx context.Context, ex db.Executor) error {
		if err := ex.QueryRow(ctx, "select count(*) from public.notifications where id = $1::text", recent).Scan(&left); err != nil {
			return err
		}
		return ex.QueryRow(ctx, "select count(*) from public.push_subscriptions").Scan(&subs)
	})
	if left != 1 || subs != 2 {
		t.Fatalf("recent kept %d, subscriptions left %d (want 1, 2)", left, subs)
	}
}

func TestDashboardRefreshWarmsTheSharedAnswer(t *testing.T) {
	fx := loadFixture(t)
	reset(t)
	seedFixture(t, fx)
	w := newWorkers(t, nil)
	if n, err := w.DashboardOnce(context.Background()); err != nil || n != 1 {
		t.Fatalf("first refresh: %d, %v", n, err)
	}
	if n, err := w.DashboardOnce(context.Background()); err != nil || n != 0 {
		t.Fatalf("a fresh answer was recomputed: %d, %v", n, err)
	}
	var total int
	system(t, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select (body ->> 'total')::int from public.dashboard_cache where scope = 'all'").Scan(&total)
	})
	if total != len(fx.Cases) {
		t.Fatalf("cached total %d, want %d", total, len(fx.Cases))
	}
}

// ---------- privileges ----------

// TestDefinerFunctionsAreGrantedDeliberately lists every SECURITY DEFINER function a browser
// role can execute. A new one must be added here on purpose: through Supabase's data API
// anyone with the public anon key can call what anon may execute, and any signed-in user
// what authenticated may.
func TestDefinerFunctionsAreGrantedDeliberately(t *testing.T) {
	wantAnon := []string{"bootstrap_domains", "needs_bootstrap"}
	wantAuth := []string{"app_can", "bootstrap_domains", "can_manage_account", "case_in_scope", "case_search_ids", "current_app_role",
		"current_app_user_id", "current_case_scope", "dashboard_shared", "is_group_it_email", "needs_bootstrap", "next_case_ref",
		"prune_notifications", "save_push_subscription", "user_search_ids"}
	for role, want := range map[string][]string{"anon": wantAnon, "authenticated": wantAuth} {
		var got []string
		system(t, func(ctx context.Context, ex db.Executor) error {
			var raw []byte
			if err := ex.QueryRow(ctx, `select coalesce(jsonb_agg(p.proname order by p.proname), '[]') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
			  where n.nspname = 'public' and p.prosecdef and has_function_privilege($1::text, p.oid, 'execute')`, role).Scan(&raw); err != nil {
				return err
			}
			return json.Unmarshal(raw, &got)
		})
		if strings.Join(got, ",") != strings.Join(want, ",") {
			t.Errorf("%s may execute definer functions %v, want %v", role, got, want)
		}
	}
	// And the ones that write notifications refuse a signed-in caller outright.
	reset(t)
	c := provision(t, "counsellor", "c@test.local", "C")
	for _, q := range []string{
		"select public.notify_insert('x', 't', 'high', 'Forged', null, null, null, null, '#/', null)",
		"select public.emit_sla_notifications()",
		"select * from public.push_claim(10, 60, 60)",
		"select public.prune_notifications_system(7, 10)",
	} {
		err := pool.WithUser(context.Background(), principalOf(c), func(ctx context.Context, ex db.Executor) error {
			_, err := ex.Exec(ctx, q)
			return err
		})
		if err == nil || !strings.Contains(err.Error(), "permission denied") {
			t.Errorf("%s as a counsellor: %v", q, err)
		}
	}
}
