# ADR-001: HTTP stack for lpl-api

**Status:** Accepted · **Date:** 11 September 2026 · **Deciders:** Bhanu Mendis

## Context

lpl-api serves about twenty fixed routes with two path parameters, must reproduce
PostgREST's and GoTrue's JSON shapes byte for byte, reverse-proxies one upstream, and needs
a strict CORS and API-key story. No templating, websockets or streaming.

## Decision

Go's standard `net/http` with the Go 1.22+ `ServeMux` (method and pattern routing),
`httputil.ReverseProxy` for GoTrue, middleware as `func(http.Handler) http.Handler`, and
`encoding/json` for bodies. Database access through `pgx` v5 directly; no ORM, no query
builder, no additional dependencies.

## Options considered

| Option | Complexity | Fit | Team familiarity | Verdict |
|---|---|---|---|---|
| `net/http` + Go 1.22 mux | Low | Covers every route; stdlib proxy; zero deps | High (it is the standard) | **Chosen** |
| Chi | Low | Idiomatic, `net/http`-compatible; helpers we would barely use | High | Fallback if Option B grows past ~60 routes |
| Gin | Medium | Own context, binding and JSON conventions fight byte-exact borrowed shapes | Medium | Rejected |
| Echo | Medium | As Gin | Medium | Rejected |
| Fiber | Medium | fasthttp: no `httputil.ReverseProxy`, no standard middleware | Low | Rejected |

## Consequences

Easier: onboarding, `httptest`-based testing, upgrades, reasoning about exact responses.
Harder: nothing material at this size. Revisit when Option B intent endpoints arrive.
