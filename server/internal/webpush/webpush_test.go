// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package webpush

import (
	"context"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"io"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

var b64 = base64.RawURLEncoding

func mustDecode(t *testing.T, s string) []byte {
	t.Helper()
	b, err := b64.DecodeString(s)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

// vector is one fixed-input encryption: the keys, salt and plaintext, and the exact message.
type vector struct {
	name, plaintext, asPrivate, uaPrivate, uaPublic, auth, salt, message string
}

var vectors = []vector{{
	// RFC 8291 Appendix A.
	name:      "RFC 8291 appendix A",
	plaintext: "When I grow up, I want to be a watermelon",
	asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
	uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
	uaPublic:  "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
	auth:      "BTBZMqHH6r4Tts7J_aSIgg",
	salt:      "DGv6ra1nlYgDCS1FRnbzlw",
	message: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
		"pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
}}

func TestEncryptMatchesFixedVectors(t *testing.T) {
	for _, v := range append(vectors, crossVectors...) {
		t.Run(v.name, func(t *testing.T) {
			as, err := ecdh.P256().NewPrivateKey(mustDecode(t, v.asPrivate))
			if err != nil {
				t.Fatal(err)
			}
			got, err := encrypt([]byte(v.plaintext), v.uaPublic, v.auth, mustDecode(t, v.salt), as)
			if err != nil {
				t.Fatal(err)
			}
			if b64.EncodeToString(got) != v.message {
				t.Fatalf("message differs\n got %s\nwant %s", b64.EncodeToString(got), v.message)
			}
			ua, err := ecdh.P256().NewPrivateKey(mustDecode(t, v.uaPrivate))
			if err != nil {
				t.Fatal(err)
			}
			if b64.EncodeToString(ua.PublicKey().Bytes()) != v.uaPublic {
				t.Fatal("user agent key pair in the vector does not match")
			}
			plain, err := Decrypt(mustDecode(t, v.message), ua, mustDecode(t, v.auth))
			if err != nil || string(plain) != v.plaintext {
				t.Fatalf("decrypt: %q, %v", plain, err)
			}
		})
	}
}

func newUA(t *testing.T) (*ecdh.PrivateKey, []byte, Subscription) {
	t.Helper()
	ua, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	auth := make([]byte, 16)
	_, _ = rand.Read(auth)
	return ua, auth, Subscription{P256dh: b64.EncodeToString(ua.PublicKey().Bytes()), Auth: b64.EncodeToString(auth)}
}

func TestEncryptRoundTripsAndNeverRepeats(t *testing.T) {
	ua, auth, sub := newUA(t)
	for _, n := range []int{0, 1, 100, MaxPlaintext} {
		msg := strings.Repeat("x", n)
		a, err := Encrypt([]byte(msg), sub.P256dh, sub.Auth)
		if err != nil {
			t.Fatal(n, err)
		}
		b, _ := Encrypt([]byte(msg), sub.P256dh, sub.Auth)
		if string(a) == string(b) {
			t.Fatal("two encryptions of one message are identical: salt or key reused")
		}
		if len(a) > recordSize {
			t.Fatalf("%d-byte payload made a %d-byte message", n, len(a))
		}
		got, err := Decrypt(a, ua, auth)
		if err != nil || string(got) != msg {
			t.Fatalf("%d: %v", n, err)
		}
	}
	// Standard base64 and padding, as some stored subscriptions have them, decode the same.
	std := base64.StdEncoding.EncodeToString(ua.PublicKey().Bytes())
	if _, err := Encrypt([]byte("x"), std, base64.StdEncoding.EncodeToString(auth)); err != nil {
		t.Fatal(err)
	}
}

func TestEncryptRefusesBadInput(t *testing.T) {
	_, _, sub := newUA(t)
	if _, err := Encrypt(make([]byte, MaxPlaintext+1), sub.P256dh, sub.Auth); err == nil {
		t.Fatal("oversized payload accepted")
	}
	offCurve := append([]byte{4}, make([]byte, 64)...)
	offCurve[64] = 1
	if _, err := Encrypt([]byte("x"), b64.EncodeToString(offCurve), sub.Auth); err == nil {
		t.Fatal("a point off the curve was accepted")
	}
	if _, err := Encrypt([]byte("x"), sub.P256dh, b64.EncodeToString([]byte("short"))); err == nil {
		t.Fatal("a 5-byte auth secret was accepted")
	}
	if _, err := Encrypt([]byte("x"), "not base64!", sub.Auth); err == nil {
		t.Fatal("garbage key accepted")
	}
}

func testVAPID(t *testing.T) (*VAPID, *ecdsa.PublicKey, string, string) {
	t.Helper()
	k, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	pub, priv := b64.EncodeToString(k.PublicKey().Bytes()), b64.EncodeToString(k.Bytes())
	v, err := ParseVAPID(pub, priv, "mailto:it@lyceum.lk")
	if err != nil {
		t.Fatal(err)
	}
	pk, err := ecdsa.ParseUncompressedPublicKey(elliptic.P256(), k.PublicKey().Bytes())
	if err != nil {
		t.Fatal(err)
	}
	return v, pk, pub, priv
}

// verifyVAPID checks an Authorization header as a push service would and returns the claims.
func verifyVAPID(t *testing.T, header string, pub *ecdsa.PublicKey, wantKey string) map[string]any {
	t.Helper()
	rest, ok := strings.CutPrefix(header, "vapid t=")
	if !ok {
		t.Fatalf("scheme: %q", header)
	}
	token, k, ok := strings.Cut(rest, ", k=")
	if !ok || k != wantKey {
		t.Fatalf("k=%q, want %q", k, wantKey)
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("token has %d parts", len(parts))
	}
	var head map[string]string
	if err := json.Unmarshal(mustDecode(t, parts[0]), &head); err != nil || head["alg"] != "ES256" || head["typ"] != "JWT" {
		t.Fatalf("header %v %v", head, err)
	}
	sig := mustDecode(t, parts[2])
	if len(sig) != 64 {
		t.Fatalf("signature is %d bytes, want 64 (R||S)", len(sig))
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if !ecdsa.Verify(pub, digest[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
		t.Fatal("signature does not verify")
	}
	var claims map[string]any
	if err := json.Unmarshal(mustDecode(t, parts[1]), &claims); err != nil {
		t.Fatal(err)
	}
	return claims
}

func TestVAPIDTokenVerifiesForTheEndpointOrigin(t *testing.T) {
	v, pub, pubB64, _ := testVAPID(t)
	now := time.Unix(1_790_000_000, 0)
	h, err := v.Authorization("https://fcm.googleapis.com/fcm/send/abc:def?x=1", now)
	if err != nil {
		t.Fatal(err)
	}
	c := verifyVAPID(t, h, pub, pubB64)
	if c["aud"] != "https://fcm.googleapis.com" || c["sub"] != "mailto:it@lyceum.lk" {
		t.Fatalf("claims %v", c)
	}
	if exp := int64(c["exp"].(float64)); exp <= now.Unix() || exp > now.Add(24*time.Hour).Unix() {
		t.Fatalf("exp %d is not within 24 hours of now", exp)
	}
}

func TestParseVAPIDRefusesMismatchedOrMalformedKeys(t *testing.T) {
	_, _, pub, priv := testVAPID(t)
	_, _, otherPub, _ := testVAPID(t)
	cases := map[string][3]string{
		"mismatched pair": {otherPub, priv, "mailto:it@lyceum.lk"},
		"bad private":     {pub, "AAAA", "mailto:it@lyceum.lk"},
		"no subject":      {pub, priv, ""},
		"http subject":    {pub, priv, "http://lyceum.lk"},
		"empty mailto":    {pub, priv, "mailto:"},
	}
	for name, c := range cases {
		if _, err := ParseVAPID(c[0], c[1], c[2]); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	if _, err := ParseVAPID(pub, priv, "https://placements.lyceum.lk/contact"); err != nil {
		t.Fatal(err)
	}
}

func TestSenderAdmitsOnlyPushServices(t *testing.T) {
	v, _, _, _ := testVAPID(t)
	s := NewSender(v, nil)
	for endpoint, want := range map[string]bool{
		"https://fcm.googleapis.com/fcm/send/x":                true,
		"https://updates.push.services.mozilla.com/wpush/v2/x": true,
		"https://web.push.apple.com/QK":                        true,
		"https://wns2-par02p.notify.windows.com/w/?token=x":    true,
		"http://fcm.googleapis.com/fcm/send/x":                 false,
		"https://fcm.googleapis.com:8443/x":                    false,
		"https://user@fcm.googleapis.com/x":                    false,
		"https://evilfcm.googleapis.com.attacker.lk/x":         false,
		"https://notfcm.googleapis.com.evil/x":                 false,
		"https://169.254.169.254/latest/meta-data":             false,
		"https://localhost/x":                                  false,
		"https://attacker.lk/?fcm.googleapis.com":              false,
		"fcm.googleapis.com/x":                                 false,
	} {
		if got := s.Allowed(endpoint); got != want {
			t.Errorf("%s: allowed=%v, want %v", endpoint, got, want)
		}
	}
	if r := s.Send(context.Background(), Subscription{Endpoint: "https://169.254.169.254/x"}, []byte("x"), ""); r.Outcome != Refused {
		t.Fatalf("outcome %v", r.Outcome)
	}
}

func TestSenderPostsAnEncryptedMessageAndClassifiesAnswers(t *testing.T) {
	v, pub, pubB64, _ := testVAPID(t)
	ua, auth, sub := newUA(t)
	status := http.StatusCreated
	var got []byte
	var hdr http.Header
	var path string
	ts := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hdr, path = r.Header.Clone(), r.URL.Path
		got, _ = io.ReadAll(r.Body)
		if status == http.StatusFound {
			http.Redirect(w, r, "https://169.254.169.254/", status)
			return
		}
		if status == http.StatusTooManyRequests {
			w.Header().Set("Retry-After", "120")
		}
		w.WriteHeader(status)
	}))
	defer ts.Close()
	s := NewSender(v, nil).WithClient(ts.Client())
	s.AllowHost = func(h string) bool { return h == "127.0.0.1" }
	sub.Endpoint = ts.URL + "/push/abc"

	r := s.Send(context.Background(), sub, []byte(`{"title":"Hello"}`), "high")
	if r.Outcome != Delivered || r.Status != 201 {
		t.Fatalf("%+v", r)
	}
	if path != "/push/abc" || hdr.Get("Content-Encoding") != "aes128gcm" || hdr.Get("TTL") != "86400" || hdr.Get("Urgency") != "high" {
		t.Fatalf("request: %s %v", path, hdr)
	}
	if c := verifyVAPID(t, hdr.Get("Authorization"), pub, pubB64); c["aud"] != ts.URL {
		t.Fatalf("aud %v, want %s", c["aud"], ts.URL)
	}
	if plain, err := Decrypt(got, ua, auth); err != nil || string(plain) != `{"title":"Hello"}` {
		t.Fatalf("%q %v", plain, err)
	}

	for code, want := range map[int]Outcome{
		404: Gone, 410: Gone, 429: Transient, 500: Transient, 503: Transient,
		400: Rejected, 401: Rejected, 403: Rejected, 413: Rejected, http.StatusFound: Rejected,
	} {
		status = code
		r := s.Send(context.Background(), sub, []byte("x"), "")
		if r.Outcome != want || r.Err == nil {
			t.Errorf("%d: %+v, want %v", code, r, want)
		}
		if code == 429 && r.RetryAfter != 2*time.Minute {
			t.Errorf("Retry-After: %v", r.RetryAfter)
		}
	}

	ts.Close()
	if r := s.Send(context.Background(), sub, []byte("x"), ""); r.Outcome != Transient {
		t.Fatalf("unreachable service: %+v", r)
	}
}
