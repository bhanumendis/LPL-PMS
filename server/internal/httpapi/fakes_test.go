// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package httpapi

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"lpl-api/internal/auth"
	"lpl-api/internal/config"
	"lpl-api/internal/db"
	"lpl-api/internal/gotrue"
)

const (
	adminSub   = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	studentSub = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
)

type call struct {
	SQL  string
	Args []any
}

type fakeRow struct {
	vals []any
	err  error
}

func (r fakeRow) Scan(dest ...any) error {
	if r.err != nil {
		return r.err
	}
	for i, d := range dest {
		if i >= len(r.vals) {
			break
		}
		assign(d, r.vals[i])
	}
	return nil
}

// assign stores val into the pointer dest, wrapping into a pointer type when the
// destination is itself a pointer (as scanning a nullable column into *string does).
func assign(dest, val any) {
	dv := reflect.ValueOf(dest).Elem()
	if val == nil {
		dv.Set(reflect.Zero(dv.Type()))
		return
	}
	v := reflect.ValueOf(val)
	switch {
	case v.Type().AssignableTo(dv.Type()):
		dv.Set(v)
	case dv.Kind() == reflect.Ptr && v.Type().AssignableTo(dv.Type().Elem()):
		p := reflect.New(dv.Type().Elem())
		p.Elem().Set(v)
		dv.Set(p)
	case v.Type().ConvertibleTo(dv.Type()):
		dv.Set(v.Convert(dv.Type()))
	default:
		panic("fakeRow: cannot assign " + v.Type().String() + " to " + dv.Type().String())
	}
}

// fakeExec records statements and answers QueryRow from a queue.
type fakeExec struct {
	calls   []call
	rows    []fakeRow
	execErr error
}

func (f *fakeExec) Exec(_ context.Context, sql string, args ...any) (pgconn.CommandTag, error) {
	f.calls = append(f.calls, call{SQL: sql, Args: args})
	return pgconn.NewCommandTag("OK 1"), f.execErr
}

func (f *fakeExec) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	f.calls = append(f.calls, call{SQL: sql, Args: args})
	if len(f.rows) == 0 {
		return fakeRow{err: pgx.ErrNoRows}
	}
	r := f.rows[0]
	f.rows = f.rows[1:]
	return r
}

type fakeRunner struct {
	ex        *fakeExec
	users     []auth.Principal
	system    int
	userErr   error
	systemErr error
}

func (f *fakeRunner) WithUser(ctx context.Context, p auth.Principal, fn func(context.Context, db.Executor) error) error {
	f.users = append(f.users, p)
	if f.userErr != nil {
		return f.userErr
	}
	return fn(ctx, f.ex)
}

func (f *fakeRunner) WithSystem(ctx context.Context, fn func(context.Context, db.Executor) error) error {
	f.system++
	if f.systemErr != nil {
		return f.systemErr
	}
	return fn(ctx, f.ex)
}

type fakeResolver struct{ tokens map[string]auth.Principal }

func (f fakeResolver) Resolve(_ context.Context, authorization string) (auth.Principal, error) {
	tok, ok := strings.CutPrefix(authorization, "Bearer ")
	if !ok || tok == "" || tok == "anon-key" {
		return auth.Anon(), nil
	}
	if p, ok := f.tokens[tok]; ok {
		return p, nil
	}
	return auth.Principal{}, auth.ErrSignature
}

type fakeGoTrue struct {
	created   []gotrue.CreateUserRequest
	passwords map[string]string
	bans      map[string]string
	createID  string
	err       error
}

func (f *fakeGoTrue) CreateUser(_ context.Context, req gotrue.CreateUserRequest) (string, error) {
	f.created = append(f.created, req)
	if f.err != nil {
		return "", f.err
	}
	return f.createID, nil
}

func (f *fakeGoTrue) UpdatePassword(_ context.Context, id, pw string) error {
	if f.err != nil {
		return f.err
	}
	if f.passwords == nil {
		f.passwords = map[string]string{}
	}
	f.passwords[id] = pw
	return nil
}

func (f *fakeGoTrue) SetBanDuration(_ context.Context, id, d string) error {
	if f.err != nil {
		return f.err
	}
	if f.bans == nil {
		f.bans = map[string]string{}
	}
	f.bans[id] = d
	return nil
}

func principals() map[string]auth.Principal {
	return map[string]auth.Principal{
		"admin-token":   {Role: "authenticated", Sub: adminSub, ClaimsJSON: `{"role":"authenticated","sub":"` + adminSub + `"}`},
		"student-token": {Role: "authenticated", Sub: studentSub, ClaimsJSON: `{"role":"authenticated","sub":"` + studentSub + `"}`},
		"service-token": {Role: "service_role", ClaimsJSON: `{"role":"service_role"}`},
	}
}

type testEnv struct {
	h      http.Handler
	ex     *fakeExec
	runner *fakeRunner
	gotrue *fakeGoTrue
}

func newEnv(t *testing.T, opts ...func(*Deps)) *testEnv {
	t.Helper()
	ex := &fakeExec{}
	runner := &fakeRunner{ex: ex}
	gt := &fakeGoTrue{createID: "11111111-1111-4111-8111-111111111111"}
	d := Deps{
		Config: config.Config{
			AnonKey: "anon-key", ServiceRoleKey: "service-key",
			MaxBodyBytes: 1 << 20, RequestTimeout: 5 * time.Second, CORSAllowOrigins: []string{"*"},
		},
		Runner:   runner,
		Resolver: fakeResolver{tokens: principals()},
		GoTrue:   gt,
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		AuthProxy: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
			_, _ = io.WriteString(w, "proxied "+r.URL.Path+"?"+r.URL.RawQuery)
		}),
	}
	for _, o := range opts {
		o(&d)
	}
	s, err := New(d)
	if err != nil {
		t.Fatal(err)
	}
	return &testEnv{h: s.Handler(), ex: ex, runner: runner, gotrue: gt}
}

// do performs a request with the apikey header set unless headers overrides it.
func (e *testEnv) do(method, target, token, body string, headers map[string]string) *httptest.ResponseRecorder {
	var rdr io.Reader
	if body != "" {
		rdr = strings.NewReader(body)
	}
	req := httptest.NewRequest(method, target, rdr)
	req.Header.Set("apikey", "anon-key")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if body != "" {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		if v == "" {
			req.Header.Del(k)
		} else {
			req.Header.Set(k, v)
		}
	}
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	return rec
}

func pgErr(code, message string) error { return &pgconn.PgError{Code: code, Message: message} }

func mustContain(t *testing.T, body, want string) {
	t.Helper()
	if !strings.Contains(body, want) {
		t.Fatalf("body %q does not contain %q", body, want)
	}
}
