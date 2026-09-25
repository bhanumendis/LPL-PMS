// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
//
// Package gotrue is the small client for GoTrue's admin API that the admin-users handler
// needs: create a user, set a password, ban or unban. It authenticates with the service
// role key, which therefore never has to leave the server.
package gotrue

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Admin is what the handler depends on; tests substitute a fake.
type Admin interface {
	// CreateUser creates a confirmed identity and returns its id (auth.users.id).
	CreateUser(ctx context.Context, req CreateUserRequest) (string, error)
	// UpdatePassword sets a new password on an existing identity.
	UpdatePassword(ctx context.Context, authID, password string) error
	// SetBanDuration bans ("876000h") or unbans ("none") an identity.
	SetBanDuration(ctx context.Context, authID, duration string) error
}

// CreateUserRequest mirrors supabase-js auth.admin.createUser.
type CreateUserRequest struct {
	Email        string         `json:"email"`
	Password     string         `json:"password"`
	EmailConfirm bool           `json:"email_confirm"`
	UserMetadata map[string]any `json:"user_metadata,omitempty"`
	AppMetadata  map[string]any `json:"app_metadata,omitempty"`
}

// Error carries GoTrue's status and message. The handler returns Message to the browser
// exactly as the Edge Function returned error.message.
type Error struct {
	Status  int
	Message string
}

func (e *Error) Error() string { return e.Message }

// Client talks to GoTrue over HTTP.
type Client struct {
	base string
	key  string
	http *http.Client
}

// NewClient builds a client for the GoTrue base URL (see config.GoTrueURL).
func NewClient(base, serviceKey string) *Client {
	return &Client{base: strings.TrimRight(base, "/"), key: serviceKey, http: &http.Client{Timeout: 15 * time.Second}}
}

// CreateUser implements Admin.
func (c *Client) CreateUser(ctx context.Context, req CreateUserRequest) (string, error) {
	var out struct {
		ID string `json:"id"`
	}
	if err := c.do(ctx, http.MethodPost, "/admin/users", req, &out); err != nil {
		return "", err
	}
	if out.ID == "" {
		return "", &Error{Status: 400, Message: "The identity provider refused the request."}
	}
	return out.ID, nil
}

// UpdatePassword implements Admin.
func (c *Client) UpdatePassword(ctx context.Context, authID, password string) error {
	return c.do(ctx, http.MethodPut, "/admin/users/"+url.PathEscape(authID), map[string]any{"password": password}, nil)
}

// SetBanDuration implements Admin.
func (c *Client) SetBanDuration(ctx context.Context, authID, duration string) error {
	return c.do(ctx, http.MethodPut, "/admin/users/"+url.PathEscape(authID), map[string]any{"ban_duration": duration}, nil)
}

func (c *Client) do(ctx context.Context, method, path string, body any, out any) error {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rdr = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.base+path, rdr)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.key)
	req.Header.Set("apikey", c.key)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		return &Error{Status: http.StatusBadGateway, Message: "Could not reach the identity provider: " + err.Error()}
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 400 {
		return &Error{Status: res.StatusCode, Message: errorMessage(raw, res.StatusCode)}
	}
	if out != nil && len(bytes.TrimSpace(raw)) > 0 {
		if err := json.Unmarshal(raw, out); err != nil {
			return &Error{Status: http.StatusBadGateway, Message: "Unexpected reply from the identity provider."}
		}
	}
	return nil
}

// errorMessage extracts the human message from the shapes GoTrue has used over time.
func errorMessage(raw []byte, status int) string {
	var m map[string]any
	if json.Unmarshal(raw, &m) == nil {
		for _, k := range []string{"msg", "message", "error_description", "error"} {
			if s, ok := m[k].(string); ok && s != "" {
				return s
			}
		}
	}
	return fmt.Sprintf("The identity provider answered %d.", status)
}
