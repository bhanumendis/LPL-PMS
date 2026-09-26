// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
//
// Package workers is lpl-api's background work, which Supabase Edge Functions and pg_cron did
// before v6: delivering notifications to browsers, service-level reminders, keeping the
// shared dashboard warm, keeping the case order stamps current and pruning old notifications.
// Every job is safe to run on any number of replicas at once: push delivery leases rows
// (public.push_claim), reminders are deduplicated by key and single-flighted by an advisory
// lock, as is the restamp, and the rest are idempotent.
package workers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand/v2"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"lpl-api/internal/db"
	"lpl-api/internal/webpush"
)

// Config sets each job's period; zero switches a job off.
type Config struct {
	PushInterval      time.Duration
	SLAInterval       time.Duration
	DashboardInterval time.Duration
	RestampInterval   time.Duration
	PruneInterval     time.Duration
	// RetentionDays is how long notifications are kept (at least 7).
	RetentionDays int
}

const (
	pushBatch       = 100
	pushConcurrency = 8
	// pushMaxAttempts matches the v5 dispatcher: after five transient failures a row is
	// settled as failed rather than retried for ever.
	pushMaxAttempts = 5
	// pushLease must outlast a batch: 100 rows × devices at 8 in flight, 15 s timeout each.
	pushLease = 5 * time.Minute
	// pushTTL is both the push service's TTL and the age beyond which a row is not sent.
	pushTTL      = 24 * time.Hour
	pruneBatch   = 5000
	keyCheckGap  = 10 * time.Minute
	settleBudget = 15 * time.Second
	// A restamp statement retakes at most this many stamps; a tick keeps going (a change of
	// service levels makes every stamp stale) until none are left or its budget is spent.
	restampBatch  = 20000
	restampBudget = 30 * time.Second
)

// Workers runs the jobs.
type Workers struct {
	db     db.Runner
	sender *webpush.Sender // nil: push is not configured
	log    *slog.Logger
	cfg    Config

	mu           sync.Mutex
	keyCheckedAt time.Time
}

// New builds the workers. sender may be nil, which leaves push delivery off.
func New(r db.Runner, sender *webpush.Sender, log *slog.Logger, cfg Config) *Workers {
	if log == nil {
		log = slog.Default()
	}
	return &Workers{db: r, sender: sender, log: log, cfg: cfg}
}

type job struct {
	name  string
	every time.Duration
	run   func(context.Context) (int, error)
}

// Run blocks until ctx is done and every job has finished the tick it was in.
func (w *Workers) Run(ctx context.Context) {
	jobs := []job{
		{"push", w.cfg.PushInterval, w.PushOnce},
		{"sla_reminders", w.cfg.SLAInterval, w.SLAOnce},
		{"dashboard_refresh", w.cfg.DashboardInterval, w.DashboardOnce},
		// Stamps close at whole-day turns of clocks and dates, most of them together at 00:00
		// UTC; a page evaluates any stale case live meanwhile, so the sooner the better.
		{"case_restamp", w.cfg.RestampInterval, w.RestampOnce},
		{"prune_notifications", w.cfg.PruneInterval, w.PruneOnce},
	}
	if w.sender == nil && w.cfg.PushInterval > 0 {
		w.log.Info("push delivery is off: VAPID keys are not configured")
	}
	var wg sync.WaitGroup
	for _, j := range jobs {
		if j.every <= 0 || (j.name == "push" && w.sender == nil) {
			continue
		}
		wg.Go(func() { w.loop(ctx, j) })
	}
	wg.Wait()
}

func (w *Workers) loop(ctx context.Context, j job) {
	// Replicas started together should not tick in step: first run after a random fraction
	// of the period (at most a minute), then every period.
	first := time.Duration(rand.Int64N(int64(min(j.every, time.Minute)))) + time.Second
	t := time.NewTimer(first)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		w.tick(ctx, j)
		t.Reset(j.every)
	}
}

func (w *Workers) tick(ctx context.Context, j job) {
	start := time.Now()
	defer func() {
		if p := recover(); p != nil {
			w.log.Error("worker panicked", "job", j.name, "panic", fmt.Sprint(p))
		}
	}()
	n, err := j.run(ctx)
	ms := time.Since(start).Milliseconds()
	switch {
	case err != nil && ctx.Err() == nil:
		w.log.Error("worker failed", "job", j.name, "error", err.Error(), "ms", ms)
	case n > 0:
		w.log.Info("worker", "job", j.name, "count", n, "ms", ms)
	}
}

// jsonRow runs a query returning one json/jsonb value and decodes it.
func jsonRow(ctx context.Context, ex db.Executor, out any, sql string, args ...any) error {
	var raw []byte
	if err := ex.QueryRow(ctx, sql, args...).Scan(&raw); err != nil {
		return err
	}
	return json.Unmarshal(raw, out)
}

// ---------------------------------------------------------------------------
// Service-level reminders, dashboard, pruning.
// ---------------------------------------------------------------------------

// SLAOnce writes due-soon and breached reminders (public.emit_sla_notifications). One
// replica at a time: the others find the lock taken and skip the tick.
func (w *Workers) SLAOnce(ctx context.Context) (int, error) {
	var n int
	err := w.db.WithSystem(ctx, func(ctx context.Context, ex db.Executor) error {
		var mine bool
		if err := ex.QueryRow(ctx, "select pg_try_advisory_xact_lock(hashtext('lpl.sla_reminders'))").Scan(&mine); err != nil || !mine {
			return err
		}
		return ex.QueryRow(ctx, "select public.emit_sla_notifications()").Scan(&n)
	})
	return n, err
}

// RestampOnce retakes the case order stamps that are no longer valid
// (public.case_restamp_due): those whose window has closed and, after the service levels
// change, all of them. Returns how many it retook; 0 while another replica holds the lock.
func (w *Workers) RestampOnce(ctx context.Context) (int, error) {
	total := 0
	deadline := time.Now().Add(restampBudget)
	for {
		var n int
		err := w.db.WithSystem(ctx, func(ctx context.Context, ex db.Executor) error {
			return ex.QueryRow(ctx, "select public.case_restamp_due($1)", restampBatch).Scan(&n)
		})
		total += n
		if err != nil || n < restampBatch || ctx.Err() != nil || time.Now().After(deadline) {
			return total, err
		}
	}
}

// DashboardOnce recomputes the shared dashboard when it is stale. Returns 1 when it did.
func (w *Workers) DashboardOnce(ctx context.Context) (int, error) {
	var ms int
	err := w.db.WithSystem(ctx, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select public.dashboard_refresh()").Scan(&ms)
	})
	if ms > 0 {
		w.log.Debug("dashboard refreshed", "compute_ms", ms)
		return 1, err
	}
	return 0, err
}

// PruneOnce deletes notifications past retention, a batch per transaction.
func (w *Workers) PruneOnce(ctx context.Context) (int, error) {
	total := 0
	for range 1000 {
		var n int
		err := w.db.WithSystem(ctx, func(ctx context.Context, ex db.Executor) error {
			var mine bool
			if err := ex.QueryRow(ctx, "select pg_try_advisory_xact_lock(hashtext('lpl.prune_notifications'))").Scan(&mine); err != nil || !mine {
				return err
			}
			return ex.QueryRow(ctx, "select public.prune_notifications_system($1, $2)", w.cfg.RetentionDays, pruneBatch).Scan(&n)
		})
		total += n
		if err != nil || n < pruneBatch || ctx.Err() != nil {
			return total, err
		}
	}
	return total, nil
}

// ---------------------------------------------------------------------------
// Push delivery.
// ---------------------------------------------------------------------------

type claimed struct {
	ID          string    `json:"id"`
	RecipientID string    `json:"recipient_id"`
	Priority    string    `json:"priority"`
	Title       string    `json:"title"`
	Body        *string   `json:"body"`
	Link        *string   `json:"link"`
	At          time.Time `json:"at"`
	Attempts    int       `json:"attempts"`
}

type target struct {
	ID       string `json:"id"`
	UserID   string `json:"user_id"`
	Endpoint string `json:"endpoint"`
	P256dh   string `json:"p256dh"`
	Auth     string `json:"auth"`
}

// settlement is the argument of public.push_settle.
type settlement struct {
	Settled []settled `json:"settled"`
	Retry   []retry   `json:"retry"`
	Revoke  []string  `json:"revoke"`
}
type settled struct {
	ID      string `json:"id"`
	Outcome string `json:"outcome"`
}
type retry struct {
	ID    string `json:"id"`
	After int    `json:"after"`
}

// PushOnce delivers pending notifications until the queue is empty (or 20 batches, so a
// flood cannot starve the next tick's newer rows of their turn). Returns the rows handled.
func (w *Workers) PushOnce(ctx context.Context) (int, error) {
	if w.sender == nil {
		return 0, nil
	}
	total := 0
	for range 20 {
		n, err := w.pushBatch(ctx)
		total += n
		if err != nil || n < pushBatch || ctx.Err() != nil {
			return total, err
		}
	}
	return total, nil
}

func (w *Workers) pushBatch(ctx context.Context) (int, error) {
	var rows []claimed
	var targets []target
	err := w.db.WithSystem(ctx, func(ctx context.Context, ex db.Executor) error {
		if err := jsonRow(ctx, ex, &rows, "select coalesce(jsonb_agg(c), '[]') from public.push_claim($1, $2, $3) c",
			pushBatch, int(pushLease/time.Second), int(pushTTL/time.Second)); err != nil {
			return fmt.Errorf("claim: %w", err)
		}
		if len(rows) == 0 {
			return nil
		}
		recipients := make([]string, 0, len(rows))
		for _, r := range rows {
			recipients = append(recipients, r.RecipientID)
		}
		if err := jsonRow(ctx, ex, &targets, "select coalesce(jsonb_agg(t), '[]') from public.push_targets($1::text[]) t", recipients); err != nil {
			return fmt.Errorf("targets: %w", err)
		}
		return nil
	})
	if err != nil || len(rows) == 0 {
		return 0, err
	}
	w.checkKey(ctx)

	devices := map[string][]target{}
	for _, t := range targets {
		devices[t.UserID] = append(devices[t.UserID], t)
	}

	// One result per (notification, device), sent pushConcurrency at a time.
	type attempt struct {
		row, dev int
		res      webpush.Result
	}
	var jobs []attempt
	for i, r := range rows {
		for d := range devices[r.RecipientID] {
			jobs = append(jobs, attempt{row: i, dev: d})
		}
	}
	sem := make(chan struct{}, pushConcurrency)
	var wg sync.WaitGroup
	for k := range jobs {
		a := &jobs[k]
		r := rows[a.row]
		dev := devices[r.RecipientID][a.dev]
		sem <- struct{}{}
		wg.Go(func() {
			defer func() { <-sem }()
			a.res = w.sender.Send(ctx, webpush.Subscription{Endpoint: dev.Endpoint, P256dh: dev.P256dh, Auth: dev.Auth}, payload(r), urgency(r.Priority))
		})
	}
	wg.Wait()

	// Fold the attempts into one outcome per notification.
	type tally struct {
		delivered, transient, gone, rejected int
		retryAfter                           time.Duration
	}
	tallies := make([]tally, len(rows))
	s := settlement{Settled: []settled{}, Retry: []retry{}, Revoke: []string{}}
	for _, a := range jobs {
		t := &tallies[a.row]
		dev := devices[rows[a.row].RecipientID][a.dev]
		switch a.res.Outcome {
		case webpush.Delivered:
			t.delivered++
		case webpush.Transient:
			t.transient++
			t.retryAfter = max(t.retryAfter, a.res.RetryAfter)
		case webpush.Gone, webpush.Refused:
			t.gone++
			s.Revoke = append(s.Revoke, dev.ID)
		case webpush.Rejected:
			t.rejected++
		}
		if a.res.Outcome != webpush.Delivered {
			lvl := slog.LevelDebug
			if a.res.Outcome == webpush.Rejected || a.res.Outcome == webpush.Refused {
				lvl = slog.LevelWarn // a bad VAPID key, a malformed subscription, a foreign endpoint
			}
			errText := ""
			if a.res.Err != nil {
				errText = a.res.Err.Error()
			}
			w.log.Log(ctx, lvl, "push not delivered", "notification", rows[a.row].ID, "subscription", dev.ID,
				"host", endpointHost(dev.Endpoint), "outcome", a.res.Outcome.String(), "status", a.res.Status, "error", errText)
		}
	}
	var delivered, retried, failed int
	for i, r := range rows {
		t := tallies[i]
		switch {
		case len(devices[r.RecipientID]) == 0:
			s.Settled = append(s.Settled, settled{r.ID, "no_device"})
		case t.transient > 0 && r.Attempts < pushMaxAttempts:
			// Devices that already have it get it again with the same tag, which replaces
			// the notification on screen rather than adding a second one.
			s.Retry = append(s.Retry, retry{r.ID, int(max(t.retryAfter, backoff(r.Attempts)) / time.Second)})
			retried++
		case t.delivered > 0:
			s.Settled = append(s.Settled, settled{r.ID, "sent"})
			delivered++
		case t.transient > 0:
			s.Settled = append(s.Settled, settled{r.ID, "failed"})
			failed++
		case t.rejected > 0:
			s.Settled = append(s.Settled, settled{r.ID, "rejected"})
			failed++
		default:
			s.Settled = append(s.Settled, settled{r.ID, "gone"})
		}
	}

	// Record the outcome even while shutting down: the pushes went out.
	sctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), settleBudget)
	defer cancel()
	body, _ := json.Marshal(s)
	err = w.db.WithSystem(sctx, func(ctx context.Context, ex db.Executor) error {
		_, err := ex.Exec(ctx, "select public.push_settle($1::jsonb)", string(body))
		return err
	})
	if err != nil {
		return len(rows), fmt.Errorf("settle: %w", err)
	}
	if retried > 0 || failed > 0 || len(s.Revoke) > 0 {
		w.log.Info("push batch", "claimed", len(rows), "delivered", delivered, "retrying", retried, "failed", failed, "revoked", len(s.Revoke))
	}
	return len(rows), nil
}

// backoff after the n-th attempt: 30 s, 2 min, 8 min, 32 min, capped at an hour.
func backoff(n int) time.Duration {
	d := 30 * time.Second
	for i := 1; i < n && d < time.Hour; i++ {
		d *= 4
	}
	return min(d, time.Hour)
}

// payload is what the service worker (src/sw.ts) reads. Links stay inside the application.
func payload(r claimed) []byte {
	link := "#/"
	if r.Link != nil && strings.HasPrefix(*r.Link, "#/") {
		link = *r.Link
	}
	m := map[string]string{"id": r.ID, "title": clip(r.Title, 200), "link": clip(link, 500)}
	if r.Body != nil && *r.Body != "" {
		m["body"] = clip(*r.Body, 1000)
	}
	b, _ := json.Marshal(m)
	if len(b) > webpush.MaxPlaintext { // only with a body of four-byte characters or escapes
		delete(m, "body")
		b, _ = json.Marshal(m)
	}
	return b
}

func clip(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	return string(r[:n-1]) + "…"
}

// keyForm turns standard base64 into base64url, the form the sender reports.
var keyForm = strings.NewReplacer("+", "-", "/", "_")

func urgency(priority string) string {
	switch priority {
	case "high":
		return "high"
	case "low":
		return "low"
	}
	return "normal"
}

func endpointHost(endpoint string) string {
	if u, err := url.Parse(endpoint); err == nil {
		return u.Host
	}
	return ""
}

// checkKey warns (at most every ten minutes) when the public key browsers subscribe with,
// set in Settings, is not the one this server signs with: every push would then be refused.
func (w *Workers) checkKey(ctx context.Context) {
	w.mu.Lock()
	due := time.Since(w.keyCheckedAt) > keyCheckGap
	if due {
		w.keyCheckedAt = time.Now()
	}
	w.mu.Unlock()
	if !due {
		return
	}
	var configured *string
	err := w.db.WithSystem(ctx, func(ctx context.Context, ex db.Executor) error {
		return ex.QueryRow(ctx, "select config -> 'push' ->> 'vapidPublicKey' from public.org_config where id = 'org'").Scan(&configured)
	})
	if err != nil && !db.IsNoRows(err) {
		return
	}
	switch {
	case configured == nil || strings.TrimSpace(*configured) == "":
		w.log.Warn("push: no VAPID public key in Settings, so no browser can subscribe; enter this server's VAPID_PUBLIC_KEY there")
	case keyForm.Replace(strings.TrimRight(strings.TrimSpace(*configured), "=")) != w.sender.PublicKey():
		w.log.Warn("push: the VAPID public key in Settings is not this server's VAPID_PUBLIC_KEY; browsers subscribed with it cannot receive pushes")
	}
}
