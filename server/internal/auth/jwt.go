// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package auth

import (
	"crypto"
	"crypto/ecdsa"
	"crypto/hmac"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"strings"
	"time"
)

// header is the part of a JOSE header this service reads.
type header struct {
	Alg string `json:"alg"`
	Kid string `json:"kid"`
	Typ string `json:"typ"`
}

// claims are the registered claims the verifier checks; everything else is passed through
// untouched inside ClaimsJSON.
type claims struct {
	Role string   `json:"role"`
	Sub  string   `json:"sub"`
	Exp  *float64 `json:"exp"`
	Nbf  *float64 `json:"nbf"`
}

// decodeSegment decodes a base64url segment with or without padding.
func decodeSegment(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(strings.TrimRight(s, "="))
}

// verifyCompact checks the signature and the time claims of a compact JWS and returns the
// principal it describes. keyFor supplies the verification key for a header.
func verifyCompact(token string, keyFor func(header) (any, error), now time.Time, leeway time.Duration) (Principal, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return Principal{}, ErrMalformed
	}
	rawHeader, err := decodeSegment(parts[0])
	if err != nil {
		return Principal{}, ErrMalformed
	}
	var h header
	if err := json.Unmarshal(rawHeader, &h); err != nil {
		return Principal{}, ErrMalformed
	}
	payload, err := decodeSegment(parts[1])
	if err != nil {
		return Principal{}, ErrMalformed
	}
	sig, err := decodeSegment(parts[2])
	if err != nil {
		return Principal{}, ErrMalformed
	}
	key, err := keyFor(h)
	if err != nil {
		return Principal{}, err
	}
	signingInput := []byte(parts[0] + "." + parts[1])
	if !verifySignature(h.Alg, key, signingInput, sig) {
		return Principal{}, ErrSignature
	}

	var c claims
	if err := json.Unmarshal(payload, &c); err != nil {
		return Principal{}, ErrMalformed
	}
	unix := float64(now.Unix())
	if c.Exp != nil && unix-leeway.Seconds() >= *c.Exp {
		return Principal{}, ErrExpired
	}
	if c.Nbf != nil && unix+leeway.Seconds() < *c.Nbf {
		return Principal{}, ErrNotYetValid
	}
	role := c.Role
	if role == "" {
		// PostgREST runs a token without a role claim as the anonymous role.
		role = "anon"
	}
	return Principal{
		Anonymous:  role == "anon",
		Role:       role,
		Sub:        c.Sub,
		ClaimsJSON: string(payload),
	}, nil
}

func verifySignature(alg string, key any, signingInput, sig []byte) bool {
	switch alg {
	case "HS256":
		secret, ok := key.([]byte)
		if !ok {
			return false
		}
		mac := hmac.New(sha256.New, secret)
		mac.Write(signingInput)
		return hmac.Equal(mac.Sum(nil), sig)
	case "ES256":
		pub, ok := key.(*ecdsa.PublicKey)
		if !ok || len(sig) != 64 {
			return false
		}
		sum := sha256.Sum256(signingInput)
		r := new(big.Int).SetBytes(sig[:32])
		s := new(big.Int).SetBytes(sig[32:])
		return ecdsa.Verify(pub, sum[:], r, s)
	case "RS256":
		pub, ok := key.(*rsa.PublicKey)
		if !ok {
			return false
		}
		sum := sha256.Sum256(signingInput)
		return rsa.VerifyPKCS1v15(pub, crypto.SHA256, sum[:], sig) == nil
	default:
		return false
	}
}

// SignHS256 produces a compact JWS over the given claims with a shared secret. It exists
// for the test suites and the dbtool "mint" command, not for the request path.
func SignHS256(claimSet map[string]any, secret []byte) (string, error) {
	payload, err := json.Marshal(claimSet)
	if err != nil {
		return "", err
	}
	head := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	body := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(head + "." + body))
	return head + "." + body + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}
