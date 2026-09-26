/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Commands for the palette: destinations, staff, and a few actions, from the session. Cases are
 * searched on the server as the query is typed (CommandPalette), never enumerated here.
 */
import type { SessionCtx } from "@/App";
import { caseScopeOf, ROLE_LABEL } from "@/lib/rbac";
import type { Destination } from "./nav";

export type CommandGroup = "Go to" | "Cases" | "People" | "Actions";
export interface Command { id: string; group: CommandGroup; label: string; hint?: string; keywords?: string; run: () => void }

const GROUP_ORDER: Record<CommandGroup, number> = { "Go to": 0, Actions: 1, Cases: 2, People: 3 };

export function buildCommands(s: SessionCtx, primary: Destination[], more: Destination | null): Command[] {
  const { user, go, can, snap, users, toggleTheme, theme, signOut } = s;
  if (!user) return [];
  const out: Command[] = [];
  for (const d of primary) {
    out.push({ id: `go:${d.page}`, group: "Go to", label: d.label, hint: d.shortcut, run: () => go({ page: d.page }) });
    for (const c of d.children ?? []) if (c.page !== d.page) out.push({ id: `go:${c.page}`, group: "Go to", label: c.label, run: () => go({ page: c.page }) });
  }
  for (const c of more?.children ?? []) out.push({ id: `go:${c.page}`, group: "Go to", label: c.label, run: () => go({ page: c.page }) });

  const scope = caseScopeOf(snap.org.config, user.role);
  if (user.role !== "student") {
    if (can("case.write") && (scope === "all" || scope === "assigned")) out.push({ id: "act:create", group: "Actions", label: "Create student", hint: "Opens a case", keywords: "new case enquiry", run: () => go({ page: "cases", id: "new" }) });
    if (can("staff.read")) {
      for (const u of Object.values(users)) {
        if (u.role === "student" || !u.active) continue;
        out.push({ id: `user:${u.id}`, group: "People", label: u.name, hint: `${ROLE_LABEL[u.role]}${u.branch ? ` · ${u.branch}` : ""}`, keywords: u.email, run: () => go({ page: "staff" }) });
      }
    }
  }
  out.push({ id: "act:theme", group: "Actions", label: theme === "dark" ? "Switch to light appearance" : "Switch to dark appearance", keywords: "theme dark light", run: toggleTheme });
  out.push({ id: "act:signout", group: "Actions", label: "Sign out", run: signOut });
  return out;
}

/** Case-insensitive substring match over label, hint and keywords; label prefix matches rank first. */
export function filterCommands(commands: Command[], q: string, limit = 12): Command[] {
  const s = q.trim().toLowerCase();
  const scored = commands.flatMap((c, i) => {
    if (!s) return c.group === "Cases" || c.group === "People" ? [] : [{ c, i, score: GROUP_ORDER[c.group] }];
    const label = c.label.toLowerCase();
    const hay = `${label} ${(c.hint ?? "").toLowerCase()} ${(c.keywords ?? "").toLowerCase()}`;
    if (label.startsWith(s)) return [{ c, i, score: 0 }];
    if (label.includes(s)) return [{ c, i, score: 1 }];
    if (hay.includes(s)) return [{ c, i, score: 2 }];
    return [];
  });
  // Declaration order breaks ties so destinations keep the dock's order.
  scored.sort((a, b) => a.score - b.score || GROUP_ORDER[a.c.group] - GROUP_ORDER[b.c.group] || a.i - b.i);
  return scored.slice(0, limit).map((x) => x.c);
}
