// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package webpush

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// VAPID identifies this application server to push services (RFC 8292). The key pair is the
// one whose public half the browser subscribed with (Settings → Push notifications).
type VAPID struct {
	key       *ecdsa.PrivateKey
	publicB64 string
	subject   string
}

// jwtLifetime is how long a signed token is valid; RFC 8292 allows at most 24 hours.
const jwtLifetime = 12 * time.Hour

// ParseVAPID reads the key pair in the form `web-push generate-vapid-keys` prints: base64url
// of the uncompressed public point (65 bytes) and of the private scalar (32 bytes). The two
// must belong together, and the subject must be a mailto: or https: contact.
func ParseVAPID(publicKey, privateKey, subject string) (*VAPID, error) {
	pubRaw, err := decodeKey(publicKey)
	if err != nil {
		return nil, fmt.Errorf("VAPID_PUBLIC_KEY: %w", err)
	}
	privRaw, err := decodeKey(privateKey)
	if err != nil {
		return nil, fmt.Errorf("VAPID_PRIVATE_KEY: %w", err)
	}
	key, err := ecdsa.ParseRawPrivateKey(elliptic.P256(), privRaw)
	if err != nil {
		return nil, fmt.Errorf("VAPID_PRIVATE_KEY: %w", err)
	}
	pub, err := key.PublicKey.Bytes()
	if err != nil {
		return nil, fmt.Errorf("VAPID_PRIVATE_KEY: %w", err)
	}
	if string(pub) != string(pubRaw) {
		return nil, errors.New("VAPID_PUBLIC_KEY is not the public half of VAPID_PRIVATE_KEY")
	}
	switch {
	case strings.HasPrefix(subject, "mailto:") && len(subject) > len("mailto:"):
	case strings.HasPrefix(subject, "https://"):
		if u, err := url.Parse(subject); err != nil || u.Host == "" {
			return nil, fmt.Errorf("VAPID_SUBJECT %q is not a URL", subject)
		}
	default:
		return nil, fmt.Errorf("VAPID_SUBJECT must be a mailto: or https: contact, got %q", subject)
	}
	return &VAPID{key: key, publicB64: base64.RawURLEncoding.EncodeToString(pub), subject: subject}, nil
}

// PublicKey is the application server key, base64url, as browsers and org settings hold it.
func (v *VAPID) PublicKey() string { return v.publicB64 }

// Authorization is the header value for a request to endpoint: `vapid t=<jwt>, k=<key>`.
// The token's audience is the endpoint's origin, as RFC 8292 section 2 requires.
func (v *VAPID) Authorization(endpoint string, now time.Time) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("webpush: endpoint %q is not a URL", endpoint)
	}
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"typ":"JWT","alg":"ES256"}`))
	claims, err := json.Marshal(map[string]any{"aud": u.Scheme + "://" + u.Host, "exp": now.Add(jwtLifetime).Unix(), "sub": v.subject})
	if err != nil {
		return "", err
	}
	signing := header + "." + base64.RawURLEncoding.EncodeToString(claims)
	digest := sha256.Sum256([]byte(signing))
	r, s, err := ecdsa.Sign(rand.Reader, v.key, digest[:])
	if err != nil {
		return "", err
	}
	// JWS ES256: the fixed-width concatenation R || S, not ASN.1.
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	s.FillBytes(sig[32:])
	return "vapid t=" + signing + "." + base64.RawURLEncoding.EncodeToString(sig) + ", k=" + v.publicB64, nil
}
