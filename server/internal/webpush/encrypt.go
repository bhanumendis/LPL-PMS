// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
//
// Package webpush delivers Web Push messages with the standard library only: message
// encryption (RFC 8291, the aes128gcm content coding of RFC 8188), VAPID authentication
// (RFC 8292) and the HTTP request to the push service (RFC 8030). It replaces the npm
// web-push library the push-dispatch Edge Function used.
package webpush

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"strings"
)

// recordSize is the aes128gcm record size the message header announces. A push message is
// a single record, so the plaintext (plus its delimiter and the 16-byte tag) must fit in it.
const recordSize = 4096

// headerLen is salt (16) + record size (4) + key id length (1) + the sender's public key (65).
const headerLen = 16 + 4 + 1 + 65

// MaxPlaintext is the largest payload one message can carry: RFC 8291 section 4 caps the
// encrypted body at 4096 bytes, of which the header, delimiter and tag take 103.
const MaxPlaintext = recordSize - headerLen - 1 - 16

// Subscription is what a browser's PushManager.subscribe() hands back: the push service
// endpoint and the user agent's keys, base64url as PushSubscription.toJSON() gives them.
type Subscription struct {
	Endpoint string
	P256dh   string
	Auth     string
}

// Encrypt encrypts plaintext for the subscription's keys with a fresh ephemeral key and salt.
func Encrypt(plaintext []byte, p256dh, auth string) ([]byte, error) {
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	as, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	return encrypt(plaintext, p256dh, auth, salt, as)
}

// encrypt is Encrypt with the salt and application server key supplied (the test vectors).
func encrypt(plaintext []byte, p256dh, auth string, salt []byte, as *ecdh.PrivateKey) ([]byte, error) {
	if len(plaintext) > MaxPlaintext {
		return nil, fmt.Errorf("webpush: payload of %d bytes exceeds %d", len(plaintext), MaxPlaintext)
	}
	uaRaw, err := decodeKey(p256dh)
	if err != nil {
		return nil, fmt.Errorf("webpush: p256dh: %w", err)
	}
	ua, err := ecdh.P256().NewPublicKey(uaRaw) // rejects points off the curve
	if err != nil {
		return nil, fmt.Errorf("webpush: p256dh: %w", err)
	}
	secret, err := decodeKey(auth)
	if err != nil {
		return nil, fmt.Errorf("webpush: auth: %w", err)
	}
	if len(secret) != 16 {
		return nil, fmt.Errorf("webpush: auth secret is %d bytes, want 16", len(secret))
	}
	shared, err := as.ECDH(ua)
	if err != nil {
		return nil, fmt.Errorf("webpush: key agreement: %w", err)
	}
	asPub := as.PublicKey().Bytes()
	cek, nonce, err := deriveKeys(shared, secret, ua.Bytes(), asPub, salt)
	if err != nil {
		return nil, err
	}
	gcm, err := newGCM(cek)
	if err != nil {
		return nil, err
	}
	// One record, the last: the plaintext followed by the 0x02 delimiter and no padding.
	record := append(append(make([]byte, 0, len(plaintext)+1), plaintext...), 0x02)

	out := make([]byte, headerLen, headerLen+len(record)+gcm.Overhead())
	copy(out, salt)
	binary.BigEndian.PutUint32(out[16:20], recordSize)
	out[20] = byte(len(asPub))
	copy(out[21:], asPub)
	return gcm.Seal(out, nonce, record, nil), nil
}

// Decrypt reverses Encrypt given the user agent's private key and auth secret: what a
// browser does on receipt. The dispatcher never needs it; the tests and fake push services do.
func Decrypt(body []byte, ua *ecdh.PrivateKey, auth []byte) ([]byte, error) {
	if len(body) < headerLen+16+1 {
		return nil, errors.New("webpush: message too short")
	}
	salt := body[:16]
	rs := binary.BigEndian.Uint32(body[16:20])
	if idlen := int(body[20]); idlen != 65 {
		return nil, fmt.Errorf("webpush: key id is %d bytes, want 65", idlen)
	}
	asPub, err := ecdh.P256().NewPublicKey(body[21:headerLen])
	if err != nil {
		return nil, fmt.Errorf("webpush: sender key: %w", err)
	}
	ciphertext := body[headerLen:]
	if uint32(len(ciphertext)) > rs {
		return nil, errors.New("webpush: more than one record")
	}
	shared, err := ua.ECDH(asPub)
	if err != nil {
		return nil, err
	}
	cek, nonce, err := deriveKeys(shared, auth, ua.PublicKey().Bytes(), asPub.Bytes(), salt)
	if err != nil {
		return nil, err
	}
	gcm, err := newGCM(cek)
	if err != nil {
		return nil, err
	}
	record, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("webpush: %w", err)
	}
	// Strip padding (zeros) back to the delimiter, which must mark the last record.
	i := len(record) - 1
	for i >= 0 && record[i] == 0 {
		i--
	}
	if i < 0 || record[i] != 0x02 {
		return nil, errors.New("webpush: missing last-record delimiter")
	}
	return record[:i], nil
}

// deriveKeys is RFC 8291 section 3.3 followed by RFC 8188 section 2.2.
func deriveKeys(shared, auth, uaPub, asPub, salt []byte) (cek, nonce []byte, err error) {
	keyInfo := append(append([]byte("WebPush: info\x00"), uaPub...), asPub...)
	ikm, err := hkdf.Key(sha256.New, shared, auth, string(keyInfo), 32)
	if err != nil {
		return nil, nil, err
	}
	prk, err := hkdf.Extract(sha256.New, ikm, salt)
	if err != nil {
		return nil, nil, err
	}
	if cek, err = hkdf.Expand(sha256.New, prk, "Content-Encoding: aes128gcm\x00", 16); err != nil {
		return nil, nil, err
	}
	if nonce, err = hkdf.Expand(sha256.New, prk, "Content-Encoding: nonce\x00", 12); err != nil {
		return nil, nil, err
	}
	return cek, nonce, nil
}

func newGCM(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}

// decodeKey accepts base64url with or without padding, and standard base64, since
// subscriptions stored by different browsers and libraries have used each.
func decodeKey(s string) ([]byte, error) {
	s = strings.TrimRight(strings.TrimSpace(s), "=")
	s = strings.NewReplacer("+", "-", "/", "_").Replace(s)
	return base64.RawURLEncoding.DecodeString(s)
}
