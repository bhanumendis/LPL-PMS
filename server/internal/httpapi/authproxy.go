// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package httpapi

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// newAuthProxy forwards /auth/v1/* to GoTrue unchanged. GoTrue keeps owning passwords,
// refresh tokens, bans and email confirmation; re-implementing those in Go would be risk
// without benefit. Upstream CORS headers are dropped because the cors middleware already
// stamped the response (a duplicated Access-Control-Allow-Origin is rejected by browsers).
func newAuthProxy(base string, log *slog.Logger) (http.Handler, error) {
	target, err := url.Parse(base)
	if err != nil || target.Scheme == "" || target.Host == "" {
		return nil, fmt.Errorf("GOTRUE_URL %q is not an absolute URL", base)
	}
	rp := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			// /auth/v1/token?grant_type=password → <base>/token?grant_type=password
			pr.Out.URL.Path = strings.TrimPrefix(pr.In.URL.Path, "/auth/v1")
			pr.Out.URL.RawPath = ""
			pr.SetURL(target)
			pr.SetXForwarded()
		},
		ModifyResponse: func(res *http.Response) error {
			for k := range res.Header {
				if strings.HasPrefix(strings.ToLower(k), "access-control-") {
					res.Header.Del(k)
				}
			}
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			log.Error("auth proxy", "request_id", RequestID(r.Context()), "path", r.URL.Path, "error", err.Error())
			writeJSON(w, http.StatusBadGateway, map[string]any{"code": 502, "msg": "The identity provider could not be reached."})
		},
	}
	return rp, nil
}
