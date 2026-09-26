// Lyceum Placements — Placement Management System
// Copyright © Bhanu Mendis - LGH IT
package schema

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"
)

var migrationName = regexp.MustCompile(`^(\d{14})_[a-z0-9_]+\.sql$`)

func TestRequiredIsTheNewestMigration(t *testing.T) {
	dir := filepath.Join("..", "..", "..", "supabase", "migrations")
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var versions []string
	for _, e := range entries {
		m := migrationName.FindStringSubmatch(e.Name())
		if m == nil {
			t.Fatalf("%s is not named <14-digit version>_<name>.sql", e.Name())
		}
		versions = append(versions, m[1])
		body, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			t.Fatal(err)
		}
		// The first migrations predate the table; v6_write_path records them.
		if m[1] >= "20260925000100" && !strings.Contains(string(body), "'"+m[1]+"'") {
			t.Errorf("%s does not record its version %s in public.schema_migrations", e.Name(), m[1])
		}
	}
	sort.Strings(versions)
	if newest := versions[len(versions)-1]; Required != newest {
		t.Fatalf("schema.Required is %s but the newest migration is %s: move Required", Required, newest)
	}
}
