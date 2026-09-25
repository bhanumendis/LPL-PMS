// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package auth

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"sync"
	"time"
)

// JWKS fetches and caches a JSON Web Key Set, such as GoTrue's
// /.well-known/jwks.json on projects that sign tokens with asymmetric keys.
type JWKS struct {
	url        string
	client     *http.Client
	minRefresh time.Duration
	now        func() time.Time

	mu      sync.Mutex
	keys    map[string]any
	fetched time.Time
}

// NewJWKS returns a cache for the key set at url. Nothing is fetched until a key is needed.
func NewJWKS(url string) *JWKS {
	return &JWKS{
		url:        url,
		client:     &http.Client{Timeout: 10 * time.Second},
		minRefresh: time.Minute,
		now:        time.Now,
		keys:       map[string]any{},
	}
}

// Key returns the public key with the given id, refreshing the set when the id is unknown
// and the last fetch is older than the refresh floor (so an unknown kid cannot be used to
// hammer the upstream).
func (j *JWKS) Key(ctx context.Context, kid string) (any, error) {
	j.mu.Lock()
	defer j.mu.Unlock()
	if k, ok := j.keys[kid]; ok {
		return k, nil
	}
	if j.now().Sub(j.fetched) < j.minRefresh {
		return nil, ErrUnknownKey
	}
	if err := j.refreshLocked(ctx); err != nil {
		return nil, err
	}
	if k, ok := j.keys[kid]; ok {
		return k, nil
	}
	return nil, ErrUnknownKey
}

func (j *JWKS) refreshLocked(ctx context.Context) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, j.url, nil)
	if err != nil {
		return err
	}
	res, err := j.client.Do(req)
	if err != nil {
		return fmt.Errorf("fetch JWKS: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("fetch JWKS: upstream answered %d", res.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return err
	}
	keys, err := parseJWKS(body)
	if err != nil {
		return err
	}
	j.keys = keys
	j.fetched = j.now()
	return nil
}

type jwk struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Alg string `json:"alg"`
	Crv string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
	N   string `json:"n"`
	E   string `json:"e"`
}

// parseJWKS builds Go public keys from a JWKS document. Unsupported entries are skipped.
func parseJWKS(doc []byte) (map[string]any, error) {
	var set struct {
		Keys []jwk `json:"keys"`
	}
	if err := json.Unmarshal(doc, &set); err != nil {
		return nil, fmt.Errorf("parse JWKS: %w", err)
	}
	out := map[string]any{}
	for _, k := range set.Keys {
		switch k.Kty {
		case "EC":
			if k.Crv != "P-256" {
				continue
			}
			pub, err := p256FromJWK(k.X, k.Y)
			if err != nil {
				continue
			}
			out[k.Kid] = pub
		case "RSA":
			n, errN := bigFromSegment(k.N)
			e, errE := bigFromSegment(k.E)
			if errN != nil || errE != nil || !e.IsInt64() {
				continue
			}
			out[k.Kid] = &rsa.PublicKey{N: n, E: int(e.Int64())}
		}
	}
	if len(out) == 0 {
		return nil, errors.New("parse JWKS: no usable keys")
	}
	return out, nil
}

// p256FromJWK builds a P-256 key from the JWK's affine coordinates through the uncompressed
// point encoding (0x04 || X || Y), which also rejects a point that is not on the curve.
func p256FromJWK(xs, ys string) (*ecdsa.PublicKey, error) {
	x, errX := decodeSegment(xs)
	y, errY := decodeSegment(ys)
	if errX != nil || errY != nil || len(x) > 32 || len(y) > 32 {
		return nil, errors.New("invalid P-256 coordinates")
	}
	point := make([]byte, 65)
	point[0] = 4
	copy(point[1+32-len(x):33], x)
	copy(point[33+32-len(y):], y)
	return ecdsa.ParseUncompressedPublicKey(elliptic.P256(), point)
}

func bigFromSegment(s string) (*big.Int, error) {
	b, err := decodeSegment(s)
	if err != nil {
		return nil, err
	}
	return new(big.Int).SetBytes(b), nil
}
