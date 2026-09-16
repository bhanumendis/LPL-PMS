// Golden replay: re-issues traffic recorded from a Supabase project (cmd/lpl-record)
// against lpl-api on a fresh database and diffs the answers.
//
// Set GOLDEN_FILE and TEST_DATABASE_URL to run it. Until the first recording exists this
// test only skips. Scope and assumptions:
//
//   - Only /rest/v1 records are replayed. Auth calls are GoTrue's business and are proxied
//     unchanged; /functions/v1 calls create identities, which the harness seeds itself.
//   - Every recorded subject is mapped to a fresh identity: the first authenticated
//     subject is the bootstrap Administrator; every other subject is provisioned as soon
//     as the profile row the recording created for it exists (found through the
//     recording's own "app_users?auth_id=eq.<sub>" lookups).
//   - Bodies are compared after parity.Normalize masks timestamps, uuids, digests and the
//     year inside case references. Status codes are compared exactly.
package contract

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"

	"lpl-api/internal/auth"
	"lpl-api/internal/config"
	"lpl-api/internal/db"
	"lpl-api/internal/httpapi"
	"lpl-api/internal/parity"
)

const secret = "replay-secret-at-least-32-characters-long"

type seed struct {
	AppID string
	Email string
}

func TestReplayGolden(t *testing.T) {
	golden := os.Getenv("GOLDEN_FILE")
	dsn := os.Getenv("TEST_DATABASE_URL")
	if golden == "" || dsn == "" {
		t.Skip("set GOLDEN_FILE and TEST_DATABASE_URL to replay recorded traffic")
	}
	f, err := os.Open(golden)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	records, err := parity.Load(f)
	if err != nil {
		t.Fatal(err)
	}
	ctx := context.Background()
	for _, file := range []string{filepath.Join("..", "sql", "auth_shim.sql"), filepath.Join("..", "..", "..", "supabase", "schema.sql")} {
		if err := applySQL(ctx, dsn, file); err != nil {
			t.Fatalf("apply %s: %v", file, err)
		}
	}
	pool, err := db.Open(ctx, dsn, 4, false, "service_role")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	exec := func(stmt string, args ...any) {
		t.Helper()
		if err := pool.WithSystem(ctx, func(ctx context.Context, ex db.Executor) error {
			_, err := ex.Exec(ctx, stmt, args...)
			return err
		}); err != nil {
			t.Fatalf("%s: %v", stmt, err)
		}
	}
	exec("truncate public.cases, public.audit, public.prompts, public.org_config, public.app_users")
	exec("delete from auth.users")
	exec("select setval('public.case_ref_seq', 1, false)")

	srv, err := httpapi.New(httpapi.Deps{
		Config:   config.Config{AnonKey: "anon-key", ServiceRoleKey: "service-key", GoTrueURL: "http://gotrue.invalid", MaxBodyBytes: 16 << 20, RequestTimeout: 30 * time.Second, CORSAllowOrigin: "*"},
		Runner:   pool,
		Resolver: auth.NewVerifier("anon-key", secret, "", 0),
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	if err != nil {
		t.Fatal(err)
	}
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	// Identity map from the recording's own profile lookups.
	seeds := map[string]seed{}
	for _, r := range records {
		if r.Method != http.MethodGet || r.Path != "/rest/v1/app_users" || !strings.Contains(r.Query, "auth_id=eq.") || r.Status != 200 {
			continue
		}
		var rows []map[string]any
		if json.Unmarshal([]byte(r.ResponseBody), &rows) != nil || len(rows) == 0 {
			continue
		}
		id, _ := rows[0]["id"].(string)
		email, _ := rows[0]["email"].(string)
		if r.Sub != "" && id != "" {
			seeds[r.Sub] = seed{AppID: id, Email: email}
		}
	}
	seeded := map[string]bool{}
	seedBootstrap := func(sub string) {
		s, ok := seeds[sub]
		if !ok {
			t.Fatalf("no profile lookup recorded for the first subject %s; cannot seed the administrator", sub)
		}
		exec("insert into auth.users (id, email, email_confirmed_at) values ($1::uuid, $2::text, now())", sub, s.Email)
		exec("update public.app_users set id = $1::text where auth_id = $2::uuid", s.AppID, sub)
		seeded[sub] = true
	}
	seedProvisioned := func() {
		for sub, s := range seeds {
			if seeded[sub] {
				continue
			}
			var exists bool
			_ = pool.WithSystem(ctx, func(ctx context.Context, ex db.Executor) error {
				return ex.QueryRow(ctx, "select exists (select 1 from public.app_users where id = $1::text and auth_id is null)", s.AppID).Scan(&exists)
			})
			if !exists {
				continue
			}
			meta := fmt.Sprintf(`{"provisioned":"admin-users","app_user_id":%q}`, s.AppID)
			exec("insert into auth.users (id, email, raw_app_meta_data, email_confirmed_at) values ($1::uuid, $2::text, $3::jsonb, now())", sub, s.Email, meta)
			seeded[sub] = true
		}
	}

	tokens := map[string]string{}
	tokenFor := func(sub string) string {
		if tok, ok := tokens[sub]; ok {
			return tok
		}
		tok, err := auth.SignHS256(map[string]any{"role": "authenticated", "sub": sub, "aud": "authenticated", "exp": time.Now().Add(2 * time.Hour).Unix()}, []byte(secret))
		if err != nil {
			t.Fatal(err)
		}
		tokens[sub] = tok
		return tok
	}

	mismatches := 0
	for _, r := range records {
		if !strings.HasPrefix(r.Path, "/rest/v1/") {
			continue
		}
		if r.Role == "authenticated" && r.Sub != "" && !seeded[r.Sub] && len(seeded) == 0 {
			seedBootstrap(r.Sub)
		}
		target := ts.URL + r.Path
		if r.Query != "" {
			target += "?" + r.Query
		}
		var body io.Reader
		if r.RequestBody != "" {
			body = strings.NewReader(r.RequestBody)
		}
		req, err := http.NewRequest(r.Method, target, body)
		if err != nil {
			t.Fatal(err)
		}
		req.Header.Set("apikey", "anon-key")
		if r.Role == "authenticated" && r.Sub != "" {
			req.Header.Set("Authorization", "Bearer "+tokenFor(r.Sub))
		} else {
			req.Header.Set("Authorization", "Bearer anon-key")
		}
		if r.Prefer != "" {
			req.Header.Set("Prefer", r.Prefer)
		}
		if r.ContentType != "" {
			req.Header.Set("Content-Type", r.ContentType)
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		got, _ := io.ReadAll(res.Body)
		res.Body.Close()
		if res.StatusCode != r.Status {
			mismatches++
			t.Errorf("seq %d %s %s: status %d, recorded %d\n  got: %s\n  rec: %s", r.Seq, r.Method, r.Path, res.StatusCode, r.Status, trim(string(got)), trim(r.ResponseBody))
		} else if r.Method == http.MethodGet || strings.HasPrefix(r.Path, "/rest/v1/rpc/") {
			if parity.Normalize(string(got)) != parity.Normalize(r.ResponseBody) {
				mismatches++
				t.Errorf("seq %d %s %s: body differs\n  got: %s\n  rec: %s", r.Seq, r.Method, r.Path, trim(parity.Normalize(string(got))), trim(parity.Normalize(r.ResponseBody)))
			}
		}
		if r.Method == http.MethodPost && r.Path == "/rest/v1/app_users" {
			seedProvisioned()
		}
	}
	t.Logf("replayed %d records, %d mismatches", len(records), mismatches)
}

func trim(s string) string {
	if len(s) > 400 {
		return s[:400] + "…"
	}
	return s
}

func applySQL(ctx context.Context, dsn, file string) error {
	sqlText, err := os.ReadFile(file)
	if err != nil {
		return err
	}
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return err
	}
	defer conn.Close(ctx)
	results, err := conn.PgConn().Exec(ctx, string(sqlText)).ReadAll()
	if err != nil {
		return err
	}
	for _, r := range results {
		if r.Err != nil {
			return r.Err
		}
	}
	return nil
}
