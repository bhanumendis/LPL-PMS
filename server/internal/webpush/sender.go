// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package webpush

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// DefaultHosts are the push services browsers subscribe with: Chrome, Edge (legacy), Samsung
// and most Chromium browsers (FCM), Firefox (Mozilla autopush), Safari (Apple) and Edge on
// Windows (WNS). An endpoint is a URL a signed-in user supplied, so the dispatcher posts only
// to these (or to PUSH_ENDPOINT_HOSTS) and never to an address inside the network.
var DefaultHosts = []string{"fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"}

// Outcome classifies one delivery attempt.
type Outcome int

const (
	// Delivered: the push service accepted the message (2xx).
	Delivered Outcome = iota
	// Gone: the subscription no longer exists (404, 410); revoke it.
	Gone
	// Transient: try again later (429, 5xx, network failure or timeout).
	Transient
	// Rejected: the service refused this message for good (another 4xx: a bad VAPID key,
	// an oversized payload). Retrying the same request cannot succeed.
	Rejected
	// Refused: the endpoint is not a push service this server will contact; revoke it.
	Refused
)

func (o Outcome) String() string {
	return [...]string{"delivered", "gone", "transient", "rejected", "refused"}[o]
}

// Result is the outcome of one request, with the status and error for the log.
type Result struct {
	Outcome    Outcome
	Status     int
	Err        error
	RetryAfter time.Duration // from a 429 or 503, when the service said
}

// Sender posts encrypted messages to push services.
type Sender struct {
	vapid  *VAPID
	hosts  []string
	client *http.Client
	// TTL is how long the push service keeps an undelivered message (default 24 hours).
	TTL time.Duration
	// AllowHost overrides the host check (tests against a local fake push service).
	AllowHost func(host string) bool
	now       func() time.Time
}

// NewSender builds a Sender that contacts only the given hosts (DefaultHosts when empty).
// A host admits itself and its subdomains.
func NewSender(v *VAPID, hosts []string) *Sender {
	if len(hosts) == 0 {
		hosts = DefaultHosts
	}
	return &Sender{
		vapid: v,
		hosts: hosts,
		client: &http.Client{
			Timeout: 15 * time.Second,
			// A push service answers; it does not redirect. Following one would let an
			// endpoint bounce the request to an address the allow-list never saw.
			CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
		},
		TTL: 24 * time.Hour,
		now: time.Now,
	}
}

// WithClient replaces the HTTP client (tests: a TLS test server's client).
func (s *Sender) WithClient(c *http.Client) *Sender {
	c.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	s.client = c
	return s
}

// PublicKey is the VAPID public key the sender signs with.
func (s *Sender) PublicKey() string { return s.vapid.PublicKey() }

// Allowed reports whether the endpoint is an https URL on an admitted push service.
func (s *Sender) Allowed(endpoint string) bool {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Host == "" {
		return false
	}
	if p := u.Port(); p != "" && p != "443" && s.AllowHost == nil {
		return false
	}
	host := strings.ToLower(u.Hostname())
	if s.AllowHost != nil {
		return s.AllowHost(host)
	}
	for _, h := range s.hosts {
		if host == h || strings.HasSuffix(host, "."+h) {
			return true
		}
	}
	return false
}

// Send encrypts payload for the subscription and posts it. urgency is RFC 8030's
// very-low | low | normal | high.
func (s *Sender) Send(ctx context.Context, sub Subscription, payload []byte, urgency string) Result {
	if !s.Allowed(sub.Endpoint) {
		return Result{Outcome: Refused, Err: errors.New("endpoint is not an admitted push service")}
	}
	body, err := Encrypt(payload, sub.P256dh, sub.Auth)
	if err != nil {
		// Malformed keys: this subscription can never receive a message.
		return Result{Outcome: Rejected, Err: err}
	}
	authz, err := s.vapid.Authorization(sub.Endpoint, s.now())
	if err != nil {
		return Result{Outcome: Rejected, Err: err}
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, sub.Endpoint, bytes.NewReader(body))
	if err != nil {
		return Result{Outcome: Refused, Err: err}
	}
	req.Header.Set("Authorization", authz)
	req.Header.Set("Content-Encoding", "aes128gcm")
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("TTL", strconv.Itoa(int(s.TTL/time.Second)))
	if urgency != "" {
		req.Header.Set("Urgency", urgency)
	}
	resp, err := s.client.Do(req)
	if err != nil {
		return Result{Outcome: Transient, Err: err}
	}
	defer resp.Body.Close()
	msg, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 64<<10))
	r := Result{Status: resp.StatusCode}
	switch c := resp.StatusCode; {
	case c >= 200 && c < 300:
		r.Outcome = Delivered
		return r
	case c == http.StatusNotFound || c == http.StatusGone:
		r.Outcome = Gone
	case c == http.StatusTooManyRequests || c >= 500:
		r.Outcome = Transient
		if secs, err := strconv.Atoi(strings.TrimSpace(resp.Header.Get("Retry-After"))); err == nil && secs > 0 {
			r.RetryAfter = time.Duration(secs) * time.Second
		}
	default:
		r.Outcome = Rejected
	}
	r.Err = errors.New(resp.Status + ": " + strings.TrimSpace(string(msg)))
	return r
}
