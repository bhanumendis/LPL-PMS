package gotrue

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCreateUserSendsWhatTheEdgeFunctionSent(t *testing.T) {
	var got map[string]any
	var auth, apikey, path, method string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth, apikey, path, method = r.Header.Get("Authorization"), r.Header.Get("apikey"), r.URL.Path, r.Method
		_ = json.NewDecoder(r.Body).Decode(&got)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"11111111-1111-1111-1111-111111111111","email":"a@b.c"}`))
	}))
	defer srv.Close()

	c := NewClient(srv.URL+"/", "service-key")
	id, err := c.CreateUser(context.Background(), CreateUserRequest{
		Email: "a@b.c", Password: "Password123!", EmailConfirm: true,
		UserMetadata: map[string]any{"name": "A", "phone": ""},
		AppMetadata:  map[string]any{"provisioned": "admin-users", "app_user_id": "u1"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if id != "11111111-1111-1111-1111-111111111111" {
		t.Fatalf("id %q", id)
	}
	if method != http.MethodPost || path != "/admin/users" || auth != "Bearer service-key" || apikey != "service-key" {
		t.Fatalf("request: %s %s auth=%q apikey=%q", method, path, auth, apikey)
	}
	if got["email_confirm"] != true || got["app_metadata"].(map[string]any)["provisioned"] != "admin-users" {
		t.Fatalf("body: %v", got)
	}
}

func TestErrorMessageShapes(t *testing.T) {
	cases := map[string]string{
		`{"code":422,"msg":"User already registered"}`:              "User already registered",
		`{"error":"invalid_grant","error_description":"Bad login"}`: "Bad login",
		`{"message":"nope"}`: "nope",
		`{"code":"weak_password","error_code":"x","msg":"Password weak"}`: "Password weak",
		`not json`:                  "The identity provider answered 400.",
		`{"error":{"nested":true}}`: "The identity provider answered 400.",
	}
	for raw, want := range cases {
		if got := errorMessage([]byte(raw), 400); got != want {
			t.Errorf("%s: got %q want %q", raw, got, want)
		}
	}
}

func TestBanAndPasswordUsePut(t *testing.T) {
	var bodies []map[string]any
	var paths []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var m map[string]any
		_ = json.NewDecoder(r.Body).Decode(&m)
		bodies = append(bodies, m)
		paths = append(paths, r.Method+" "+r.URL.Path)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"id":"x"}`))
	}))
	defer srv.Close()
	c := NewClient(srv.URL, "k")
	if err := c.UpdatePassword(context.Background(), "abc", "Password123!"); err != nil {
		t.Fatal(err)
	}
	if err := c.SetBanDuration(context.Background(), "abc", "876000h"); err != nil {
		t.Fatal(err)
	}
	if paths[0] != "PUT /admin/users/abc" || bodies[0]["password"] != "Password123!" {
		t.Fatalf("password call: %v %v", paths, bodies)
	}
	if paths[1] != "PUT /admin/users/abc" || bodies[1]["ban_duration"] != "876000h" {
		t.Fatalf("ban call: %v %v", paths, bodies)
	}
}

func TestUpstreamErrorIsReturned(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnprocessableEntity)
		_, _ = w.Write([]byte(`{"code":422,"msg":"User already registered"}`))
	}))
	defer srv.Close()
	_, err := NewClient(srv.URL, "k").CreateUser(context.Background(), CreateUserRequest{Email: "a@b.c"})
	e, ok := err.(*Error)
	if !ok || e.Status != 422 || e.Message != "User already registered" {
		t.Fatalf("got %v", err)
	}
}
