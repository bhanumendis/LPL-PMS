// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
//
// admin-users — the Edge Function supabase/functions/admin-users/index.ts, in Go, with the
// same contract, status codes and messages:
//
//	POST /functions/v1/admin-users   Authorization: Bearer <caller access token>
//	{ action: "create",       app_user_id, password }   -> { auth_id }
//	{ action: "set_password", app_user_id, password }   -> { auth_id }
//	{ action: "deactivate",   app_user_id }             -> { auth_id }
//	{ action: "reactivate",   app_user_id }             -> { auth_id }
//
// The caller must hold account.write (create, set_password) or account.delete (deactivate,
// reactivate) under public.app_can(), evaluated with the caller's own token. The profile
// row must already exist; its email is the sign-in email. Identity work is done through
// GoTrue's admin API with the service role key, which never leaves this process.
package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"

	"lpl-api/internal/db"
	"lpl-api/internal/gotrue"
)

type profile struct {
	ID     string
	Email  string
	Name   string
	Phone  string
	AuthID string
	Active bool
}

func writeFn(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func fnError(w http.ResponseWriter, status int, message string) {
	writeFn(w, status, map[string]string{"error": message})
}

// adminUsers serves /functions/v1/admin-users.
func (s *Server) adminUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fnError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}
	if s.gotrue == nil {
		fnError(w, http.StatusInternalServerError, "The function environment is incomplete.")
		return
	}
	authorization := r.Header.Get("Authorization")
	if !strings.HasPrefix(authorization, "Bearer ") {
		fnError(w, http.StatusUnauthorized, "Sign in required.")
		return
	}
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		fnError(w, http.StatusBadRequest, "Invalid JSON body.")
		return
	}
	var body map[string]any
	if err := json.Unmarshal(raw, &body); err != nil || body == nil {
		fnError(w, http.StatusBadRequest, "Invalid JSON body.")
		return
	}
	action := stringField(body, "action")
	appUserID := strings.TrimSpace(stringField(body, "app_user_id"))
	password := stringField(body, "password")
	if appUserID == "" {
		fnError(w, http.StatusBadRequest, "app_user_id is required.")
		return
	}

	// Who is calling, and do they hold the matrix cell for this action? Resolved through the
	// same SECURITY DEFINER helper the policies use, under the caller's own claims, so a forged
	// or expired token gets no role. An invalid token answers 403 here, as the function did.
	needed := "account.write"
	if action == "deactivate" || action == "reactivate" {
		needed = "account.delete"
	}
	allowed := false
	if p, perr := s.resolver.Resolve(r.Context(), authorization); perr == nil && p.Role == "authenticated" {
		if err := s.runner.WithUser(r.Context(), p, func(ctx context.Context, ex db.Executor) error {
			return ex.QueryRow(ctx, "select public.app_can($1::text)", needed).Scan(&allowed)
		}); err != nil {
			allowed = false
		}
	}
	if !allowed {
		fnError(w, http.StatusForbidden, fmt.Sprintf("This action requires the %s permission.", needed))
		return
	}

	var prof profile
	found := false
	err = s.runner.WithSystem(r.Context(), func(ctx context.Context, ex db.Executor) error {
		var authID *string
		row := ex.QueryRow(ctx, "select id, email, name, coalesce(phone, ''), auth_id::text, active from public.app_users where id = $1::text", appUserID)
		if err := row.Scan(&prof.ID, &prof.Email, &prof.Name, &prof.Phone, &authID, &prof.Active); err != nil {
			if db.IsNoRows(err) {
				return nil
			}
			return err
		}
		found = true
		if authID != nil {
			prof.AuthID = *authID
		}
		return nil
	})
	if err != nil {
		fnError(w, http.StatusInternalServerError, dbMessage(err))
		return
	}
	if !found {
		fnError(w, http.StatusNotFound, "No profile with that id. Create the profile first.")
		return
	}

	switch action {
	case "create":
		if prof.AuthID != "" {
			fnError(w, http.StatusConflict, "This profile already has a sign-in.")
			return
		}
		if problem := PasswordProblem(password); problem != "" {
			fnError(w, http.StatusBadRequest, problem)
			return
		}
		// app_metadata can only be written with the service role, which is how the database
		// trigger tells a provisioned identity from a public sign-up.
		authID, cerr := s.gotrue.CreateUser(r.Context(), gotrue.CreateUserRequest{
			Email:        strings.ToLower(prof.Email),
			Password:     password,
			EmailConfirm: true,
			UserMetadata: map[string]any{"name": prof.Name, "phone": prof.Phone},
			AppMetadata:  map[string]any{"provisioned": "admin-users", "app_user_id": prof.ID},
		})
		if cerr != nil {
			fnError(w, http.StatusBadRequest, gotrueMessage(cerr))
			return
		}
		// The trigger normally links the identity already; this matches the function's own
		// explicit link and is a no-op when the trigger got there first.
		lerr := s.runner.WithSystem(r.Context(), func(ctx context.Context, ex db.Executor) error {
			_, err := ex.Exec(ctx, "update public.app_users set auth_id = $1::uuid where id = $2::text and auth_id is null", authID, prof.ID)
			return err
		})
		if lerr != nil {
			fnError(w, http.StatusInternalServerError, "Identity created but not linked: "+dbMessage(lerr))
			return
		}
		writeFn(w, http.StatusOK, map[string]string{"auth_id": authID})
	case "set_password":
		if prof.AuthID == "" {
			fnError(w, http.StatusConflict, "This profile has no sign-in yet.")
			return
		}
		if problem := PasswordProblem(password); problem != "" {
			fnError(w, http.StatusBadRequest, problem)
			return
		}
		if err := s.gotrue.UpdatePassword(r.Context(), prof.AuthID, password); err != nil {
			fnError(w, http.StatusBadRequest, gotrueMessage(err))
			return
		}
		writeFn(w, http.StatusOK, map[string]string{"auth_id": prof.AuthID})
	case "deactivate":
		if prof.AuthID == "" {
			writeFn(w, http.StatusOK, map[string]string{"auth_id": ""})
			return
		}
		// A banned identity cannot obtain a new token; the active flag on the profile removes
		// the role from any token that is still live.
		if err := s.gotrue.SetBanDuration(r.Context(), prof.AuthID, "876000h"); err != nil {
			fnError(w, http.StatusBadRequest, gotrueMessage(err))
			return
		}
		writeFn(w, http.StatusOK, map[string]string{"auth_id": prof.AuthID})
	case "reactivate":
		if prof.AuthID == "" {
			writeFn(w, http.StatusOK, map[string]string{"auth_id": ""})
			return
		}
		if err := s.gotrue.SetBanDuration(r.Context(), prof.AuthID, "none"); err != nil {
			fnError(w, http.StatusBadRequest, gotrueMessage(err))
			return
		}
		writeFn(w, http.StatusOK, map[string]string{"auth_id": prof.AuthID})
	default:
		fnError(w, http.StatusBadRequest, "Unknown action.")
	}
}

func stringField(m map[string]any, key string) string {
	if v, ok := m[key]; ok && v != nil {
		if s, ok := v.(string); ok {
			return s
		}
		return fmt.Sprint(v)
	}
	return ""
}

// dbMessage is what supabase-js exposed as error.message: the Postgres message.
func dbMessage(err error) string {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Message
	}
	return err.Error()
}

func gotrueMessage(err error) string {
	var ge *gotrue.Error
	if errors.As(err, &ge) && ge.Message != "" {
		return ge.Message
	}
	if err == nil || err.Error() == "" {
		return "The identity provider refused the request."
	}
	return err.Error()
}
