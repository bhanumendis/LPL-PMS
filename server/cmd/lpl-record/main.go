// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
//
// lpl-record — a recording reverse proxy for capturing golden traffic. Run it in front of a
// Supabase project, point the frontend's dev server (npm run dev, which carries no CSP) at
// it, walk through the journeys, and every request/response pair lands in an NDJSON file
// that test/contract replays against lpl-api.
//
//	lpl-record -upstream https://<ref>.supabase.co -listen :8788 -out golden.ndjson -anon-key <anon key>
//
// Tokens are labelled (role, subject) but never stored; bodies are stored as-is and may
// contain personal data, so the output is git-ignored.
package main

import (
	"bytes"
	"context"
	"flag"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"time"

	"lpl-api/internal/parity"
)

type recKey struct{}

type started struct {
	rec   *parity.Record
	start time.Time
}

func main() {
	listen := flag.String("listen", ":8788", "address to listen on")
	upstream := flag.String("upstream", "", "Supabase project URL, e.g. https://ref.supabase.co")
	out := flag.String("out", "golden.ndjson", "NDJSON file to append records to")
	anonKey := flag.String("anon-key", os.Getenv("ANON_KEY"), "anon key, so anonymous calls are labelled (default $ANON_KEY)")
	flag.Parse()
	if *upstream == "" {
		log.Fatal("-upstream is required")
	}
	target, err := url.Parse(*upstream)
	if err != nil || target.Scheme == "" || target.Host == "" {
		log.Fatalf("-upstream must be an absolute URL: %v", err)
	}
	f, err := os.OpenFile(*out, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		log.Fatal(err)
	}
	defer f.Close()
	writer := parity.NewWriter(f)

	proxy := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			rec := &parity.Record{
				At:          time.Now().UTC().Format(time.RFC3339Nano),
				Method:      pr.In.Method,
				Path:        pr.In.URL.Path,
				Query:       pr.In.URL.RawQuery,
				Prefer:      pr.In.Header.Get("Prefer"),
				ContentType: pr.In.Header.Get("Content-Type"),
			}
			rec.Role, rec.Sub = parity.PeekToken(pr.In.Header.Get("Authorization"), *anonKey)
			if pr.Out.Body != nil {
				b, _ := io.ReadAll(io.LimitReader(pr.Out.Body, 16<<20))
				rec.RequestBody = string(b)
				pr.Out.Body = io.NopCloser(bytes.NewReader(b))
				pr.Out.ContentLength = int64(len(b))
			}
			// Let the transport negotiate compression so recorded bodies are plain text.
			pr.Out.Header.Del("Accept-Encoding")
			pr.Out = pr.Out.WithContext(context.WithValue(pr.Out.Context(), recKey{}, &started{rec: rec, start: time.Now()}))
			pr.SetURL(target)
		},
		ModifyResponse: func(res *http.Response) error {
			st, _ := res.Request.Context().Value(recKey{}).(*started)
			if st == nil {
				return nil
			}
			b, err := io.ReadAll(io.LimitReader(res.Body, 16<<20))
			if err != nil {
				return err
			}
			res.Body = io.NopCloser(bytes.NewReader(b))
			st.rec.Status = res.StatusCode
			st.rec.ResponseContentType = res.Header.Get("Content-Type")
			st.rec.ContentRange = res.Header.Get("Content-Range")
			st.rec.ResponseBody = string(b)
			st.rec.DurationMs = time.Since(st.start).Milliseconds()
			return writer.Write(st.rec)
		},
	}

	log.Printf("recording %s -> %s into %s", *listen, target, *out)
	srv := &http.Server{Addr: *listen, Handler: proxy, ReadHeaderTimeout: 10 * time.Second}
	log.Fatal(srv.ListenAndServe())
}
