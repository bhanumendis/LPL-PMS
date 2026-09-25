// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strconv"
	"strings"
	"time"
)

type ctxKeyRequestID struct{}

// RequestID returns the request id installed by the requestID middleware.
func RequestID(ctx context.Context) string {
	v, _ := ctx.Value(ctxKeyRequestID{}).(string)
	return v
}

func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if id == "" || len(id) > 64 {
			var b [8]byte
			_, _ = rand.Read(b[:])
			id = hex.EncodeToString(b[:])
		}
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKeyRequestID{}, id)))
	})
}

func recoverer(next http.Handler, log *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				if rec == http.ErrAbortHandler {
					panic(rec)
				}
				log.Error("panic", "request_id", RequestID(r.Context()), "path", r.URL.Path, "panic", fmt.Sprint(rec), "stack", string(debug.Stack()))
				writePostgrest(w, http.StatusInternalServerError, "PGRST000", "internal error", "", "")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// statusWriter records the status and size for the access log. It forwards Flush so the
// reverse proxy can stream, and Unwrap so http.ResponseController still works.
type statusWriter struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (s *statusWriter) WriteHeader(code int) {
	if s.status == 0 {
		s.status = code
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusWriter) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

func (s *statusWriter) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (s *statusWriter) Unwrap() http.ResponseWriter { return s.ResponseWriter }

func logging(next http.Handler, log *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(sw, r)
		status := sw.status
		if status == 0 {
			status = http.StatusOK
		}
		log.Info("request",
			"request_id", RequestID(r.Context()),
			"method", r.Method,
			"path", r.URL.Path,
			"status", status,
			"bytes", sw.bytes,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

// securityHeaders stamps every response. The API only ever returns JSON or plain text, so
// nothing it serves may be framed, sniffed into another type, cached or run as a document.
func securityHeaders(next http.Handler, hsts bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		h.Set("Cache-Control", "no-store")
		if hsts {
			h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

// cors admits the configured origins only. A response to any other origin carries no CORS
// headers, so the browser refuses to hand it to the page; a preflight from one is refused
// outright. Requests without an Origin (servers, curl, health probes) pass unchanged.
func cors(next http.Handler, allowed []string) http.Handler {
	wildcard := false
	set := map[string]bool{}
	for _, o := range allowed {
		if o == "*" {
			wildcard = true
		}
		set[o] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		h := w.Header()
		h.Add("Vary", "Origin")
		ok := origin != "" && (wildcard || set[origin])
		if ok {
			if wildcard {
				h.Set("Access-Control-Allow-Origin", "*")
			} else {
				h.Set("Access-Control-Allow-Origin", origin)
			}
			h.Set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type, prefer, range, x-request-id")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			h.Set("Access-Control-Expose-Headers", "content-range, content-type, x-request-id, retry-after")
			h.Set("Access-Control-Max-Age", "86400")
		}
		if r.Method == http.MethodOptions {
			if origin != "" && !ok {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// clientIP is the TCP peer, or the address the nearest trusted proxy recorded when the
// service runs behind hops proxies that append to X-Forwarded-For.
func clientIP(r *http.Request, hops int) string {
	if hops > 0 {
		var parts []string
		for _, v := range r.Header.Values("X-Forwarded-For") {
			for _, p := range strings.Split(v, ",") {
				if p = strings.TrimSpace(p); p != "" {
					parts = append(parts, p)
				}
			}
		}
		if len(parts) >= hops {
			return parts[len(parts)-hops]
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// limitClass decides which budget a request spends. Token refreshes are not counted as
// sign-in attempts: every open tab refreshes hourly, and they cannot guess a password.
func limitClass(r *http.Request) string {
	p := r.URL.Path
	switch {
	case r.Method == http.MethodPost && p == "/auth/v1/token" && r.URL.Query().Get("grant_type") == "password",
		r.Method == http.MethodPost && (p == "/auth/v1/signup" || p == "/auth/v1/recover" || p == "/auth/v1/otp"):
		return "auth"
	case strings.HasPrefix(p, "/functions/v1/"):
		return "admin"
	case strings.HasPrefix(p, "/rest/v1/"):
		return "api"
	}
	return ""
}

// rateLimit answers 429 with Retry-After in the shape the endpoint's client expects.
func (s *Server) rateLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		class := limitClass(r)
		l := s.limits[class]
		if l == nil || r.Method == http.MethodOptions {
			next.ServeHTTP(w, r)
			return
		}
		ip := clientIP(r, s.cfg.TrustedProxyHops)
		ok, wait := l.Allow(class + "|" + ip)
		if ok {
			next.ServeHTTP(w, r)
			return
		}
		secs := int(wait/time.Second) + 1
		w.Header().Set("Retry-After", strconv.Itoa(secs))
		s.log.Warn("rate limited", "request_id", RequestID(r.Context()), "class", class, "client_ip", ip, "path", r.URL.Path)
		switch class {
		case "auth":
			writeJSON(w, http.StatusTooManyRequests, map[string]any{"code": 429, "error_code": "over_request_rate_limit", "msg": "Too many attempts. Wait a minute and try again."})
		case "admin":
			writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "Too many requests. Wait a minute and try again."})
		default:
			writePostgrest(w, http.StatusTooManyRequests, "PGRST429", "Too many requests. Wait a minute and try again.", "", "")
		}
	})
}

func withTimeout(next http.Handler, d time.Duration) http.Handler {
	if d <= 0 {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), d)
		defer cancel()
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func maxBody(next http.Handler, n int64) http.Handler {
	if n <= 0 {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, n)
		}
		next.ServeHTTP(w, r)
	})
}

// apikeyGate reproduces the Supabase gateway's check: every call carries the anon key (or
// the service key) in the apikey header or query parameter. The error bodies are Kong's.
func (s *Server) apikeyGate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
			next.ServeHTTP(w, r)
			return
		}
		key := r.Header.Get("apikey")
		if key == "" {
			key = r.URL.Query().Get("apikey")
		}
		switch {
		case key == "":
			writeGateway(w, http.StatusUnauthorized, "No API key found in request", "No `apikey` request header or url param was found.")
		case key != s.cfg.AnonKey && key != s.cfg.ServiceRoleKey:
			writeGateway(w, http.StatusUnauthorized, "Invalid API key", "Double check your Supabase `anon` or `service_role` API key.")
		default:
			next.ServeHTTP(w, r)
		}
	})
}
