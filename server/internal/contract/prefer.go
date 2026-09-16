// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
package contract

import "strings"

// Prefer is the parsed Prefer header. The frontend sends
// "return=minimal,resolution=merge-duplicates" on upserts and "return=minimal" on
// PATCH and DELETE.
type Prefer struct {
	Return     string
	Resolution string
	Count      string
	Missing    string
}

// ParsePrefer parses a comma-separated Prefer header; unknown preferences are ignored.
func ParsePrefer(h string) Prefer {
	var p Prefer
	for _, tok := range strings.Split(h, ",") {
		k, v, _ := strings.Cut(strings.TrimSpace(tok), "=")
		k = strings.ToLower(strings.TrimSpace(k))
		v = strings.ToLower(strings.TrimSpace(v))
		switch k {
		case "return":
			p.Return = v
		case "resolution":
			p.Resolution = v
		case "count":
			p.Count = v
		case "missing":
			p.Missing = v
		}
	}
	return p
}
