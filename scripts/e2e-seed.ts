/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Seed for the browser suite (scripts/e2e-ui.sh): the 400 generated cases of the parity
 * fixture, one account per role, and a manifest naming the records the suite visits.
 * Prints SQL on stdout; writes the manifest to the path given as the first argument.
 */
import { writeFileSync } from "node:fs";
import { buildParityFixture } from "../src/test/parity-fixture";
import type { CaseRecord } from "../src/lib/types";

const out = process.argv[2];
if (!out) throw new Error("usage: vite-node scripts/e2e-seed.ts <manifest.json>");

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const cases = buildParityFixture().cases as CaseRecord[];
const sql: string[] = ["begin;"];
for (const c of cases) sql.push(`insert into public.cases (id, ref, rev, data) values (${q(c.id)}, ${q(c.ref)}, 1, ${q(JSON.stringify(c))}::jsonb);`);

// The student signs in to an open case of counsellor c1 with a pending step.
const mine = cases.find((c) => c.status === "open" && c.counsellorId === "c1" && c.studentUserId)!;
const workspace = cases.find((c) => c.status === "open" && c.counsellorId === "c1" && (c.gates ?? []).some((g) => g.status === "pending")) ?? mine;
const accounts = [
  { id: "adm", auth: "00000000-0000-0000-0000-00000000a002", email: "admin@test.local", name: "Placement Admin", role: "admin" },
  { id: "tl1", auth: "00000000-0000-0000-0000-00000000a003", email: "tl@test.local", name: "Team Leader One", role: "team_leader" },
  { id: "c2", auth: null, email: "c2@test.local", name: "Counsellor Two", role: "counsellor" },
  { id: "c3", auth: null, email: "c3@test.local", name: "Counsellor Three", role: "counsellor" },
  { id: mine.studentUserId!, auth: "00000000-0000-0000-0000-00000000a005", email: "student@test.local", name: mine.student.name, role: "student" },
];
for (const a of accounts) {
  sql.push(`insert into public.app_users (id, email, name, role, active, created_at) values (${q(a.id)}, ${q(a.email)}, ${q(a.name)}, ${q(a.role)}, true, now());`);
  if (a.auth) sql.push(`insert into auth.users (id, email, raw_app_meta_data, email_confirmed_at) values (${q(a.auth)}, ${q(a.email)}, ${q(JSON.stringify({ provisioned: "admin-users", app_user_id: a.id }))}::jsonb, now());`);
}
sql.push("commit;");
process.stdout.write(sql.join("\n") + "\n");

writeFileSync(out, JSON.stringify({
  auth: {
    super_admin: "00000000-0000-0000-0000-00000000a001",
    admin: "00000000-0000-0000-0000-00000000a002",
    team_leader: "00000000-0000-0000-0000-00000000a003",
    counsellor: "00000000-0000-0000-0000-0000000000c1",
    student: "00000000-0000-0000-0000-00000000a005",
  },
  workspaceCase: workspace.id,
  studentCase: mine.id,
}, null, 2));
