/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Writes the summary parity fixture (see src/test/parity-fixture.ts). Run: npm run parity:update
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildParityFixture } from "../src/test/parity-fixture";

const out = "server/test/integration/testdata/summary_parity.json";
mkdirSync("server/test/integration/testdata", { recursive: true });
writeFileSync(out, JSON.stringify(buildParityFixture()) + "\n");
console.log(`wrote ${out}`);
// The store module opens a BroadcastChannel on import, which would keep Node running.
process.exit(0);
