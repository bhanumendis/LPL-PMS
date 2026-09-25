// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
//
// Package parity holds the golden-traffic format shared by cmd/lpl-record (which captures
// what Supabase answers while the real frontend drives it) and test/contract (which replays
// the capture against lpl-api and diffs the answers).
package parity

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"regexp"
	"strings"
	"sync"
)

// Record is one request/response pair, one JSON object per line (NDJSON).
type Record struct {
	Seq                 int    `json:"seq"`
	At                  string `json:"at"`
	Method              string `json:"method"`
	Path                string `json:"path"`
	Query               string `json:"query,omitempty"`
	Role                string `json:"role"`
	Sub                 string `json:"sub,omitempty"`
	Prefer              string `json:"prefer,omitempty"`
	ContentType         string `json:"content_type,omitempty"`
	RequestBody         string `json:"request_body,omitempty"`
	Status              int    `json:"status"`
	ResponseContentType string `json:"response_content_type,omitempty"`
	ContentRange        string `json:"content_range,omitempty"`
	ResponseBody        string `json:"response_body,omitempty"`
	DurationMs          int64  `json:"duration_ms"`
}

// Load reads NDJSON records.
func Load(r io.Reader) ([]Record, error) {
	var out []Record
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 1<<20), 64<<20)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if len(line) == 0 {
			continue
		}
		var rec Record
		if err := json.Unmarshal(line, &rec); err != nil {
			return nil, err
		}
		out = append(out, rec)
	}
	return out, sc.Err()
}

// Writer appends records, numbering them, flushing after each so a crash loses nothing.
type Writer struct {
	mu  sync.Mutex
	w   *bufio.Writer
	enc *json.Encoder
	seq int
}

// NewWriter wraps w.
func NewWriter(w io.Writer) *Writer {
	bw := bufio.NewWriter(w)
	return &Writer{w: bw, enc: json.NewEncoder(bw)}
}

// Write appends one record.
func (w *Writer) Write(rec *Record) error {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.seq++
	rec.Seq = w.seq
	if err := w.enc.Encode(rec); err != nil {
		return err
	}
	return w.w.Flush()
}

// PeekToken labels a bearer token with its role and subject WITHOUT verifying it. The
// recorder is a labelling tool, never an authority. The anon key, or no token, is "anon";
// a non-JWT credential is "opaque".
func PeekToken(authorization, anonKey string) (role, sub string) {
	authorization = strings.TrimSpace(authorization)
	if len(authorization) < 7 || !strings.EqualFold(authorization[:7], "bearer ") {
		return "anon", ""
	}
	tok := strings.TrimSpace(authorization[7:])
	if tok == "" || tok == anonKey {
		return "anon", ""
	}
	parts := strings.Split(tok, ".")
	if len(parts) != 3 {
		return "opaque", ""
	}
	payload, err := base64.RawURLEncoding.DecodeString(strings.TrimRight(parts[1], "="))
	if err != nil {
		return "opaque", ""
	}
	var c struct {
		Role string `json:"role"`
		Sub  string `json:"sub"`
	}
	if err := json.Unmarshal(payload, &c); err != nil || c.Role == "" {
		return "anon", ""
	}
	return c.Role, c.Sub
}

var (
	tsRe   = regexp.MustCompile(`\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})`)
	uuidRe = regexp.MustCompile(`[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)
	hashRe = regexp.MustCompile(`\b[0-9a-f]{32}\b`)
	refRe  = regexp.MustCompile(`\b([A-Z]{2,6})-\d{4}-(\d{4})\b`)
)

// Normalize masks the values that legitimately differ between two runs of the same journey:
// timestamps, uuids, md5 digests (workspace_version) and the year inside a case reference.
func Normalize(body string) string {
	body = tsRe.ReplaceAllString(body, "<ts>")
	body = uuidRe.ReplaceAllString(body, "<uuid>")
	body = hashRe.ReplaceAllString(body, "<hash>")
	body = refRe.ReplaceAllString(body, "$1-<yyyy>-$2")
	return body
}
