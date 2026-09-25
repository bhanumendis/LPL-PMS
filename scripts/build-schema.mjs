/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * supabase/schema.sql is generated: it is every file in supabase/migrations, in version
 * order, inside one transaction. A new project runs schema.sql once; an existing project
 * runs only the migrations it has not applied (public.schema_migrations records them).
 * Because both paths execute the same statements, a fresh install and an upgraded one end
 * in the same catalogue, which CI proves by dumping and comparing the two.
 *
 *   node scripts/build-schema.mjs          write supabase/schema.sql
 *   node scripts/build-schema.mjs --check  exit 1 when schema.sql is out of date
 */
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = path.join(root, "supabase", "migrations");
const out = path.join(root, "supabase", "schema.sql");

const files = fs.readdirSync(dir).filter((f) => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort();
const stray = fs.readdirSync(dir).filter((f) => f.endsWith(".sql") && !files.includes(f));
if (stray.length) {
  console.error(`Migration files must be named <14-digit version>_<snake_case>.sql: ${stray.join(", ")}`);
  process.exit(1);
}

const parts = files.map((f) => {
  const body = fs.readFileSync(path.join(dir, f), "utf8").replace(/\s+$/, "");
  if (/^\s*(begin|commit|rollback)\s*;/im.test(body)) {
    console.error(`${f}: migrations must not manage their own transaction; schema.sql wraps them in one.`);
    process.exit(1);
  }
  return `-- ===========================================================================\n-- ${f}\n-- ===========================================================================\n\n${body}\n`;
});

const text = `-- Lyceum Placements — Placement Management System
-- Copyright © Bhanu Mendis - LGH IT
--
-- GENERATED FILE. Do not edit: change or add a file in supabase/migrations and run
--   node scripts/build-schema.mjs
--
-- New project: run this whole file once in the SQL editor (or psql). It is idempotent and
-- runs as one transaction, so a failure leaves the database unchanged.
-- Existing project: run only the migration files newer than the latest version recorded in
-- public.schema_migrations, in order. See docs/OPERATIONS.md.
--
-- Migrations included: ${files.map((f) => f.slice(0, 14)).join(", ")}

begin;

${parts.join("\n")}
commit;
`;

if (process.argv.includes("--check")) {
  const current = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (current !== text) {
    console.error("supabase/schema.sql is out of date. Run: node scripts/build-schema.mjs");
    process.exit(1);
  }
  console.log(`schema.sql is up to date (${files.length} migrations)`);
} else {
  fs.writeFileSync(out, text);
  console.log(`wrote supabase/schema.sql from ${files.length} migrations`);
}
