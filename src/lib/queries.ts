/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The read model: every list, count, register and dashboard the interface shows, behind one
 * interface with two implementations.
 *
 *   - On a server the database answers (public.cases_page and its siblings, in
 *     supabase/migrations/…_v6_case_index.sql): it filters, pages and aggregates under
 *     row-level security, so a browser never holds more than the page it shows.
 *   - In browser storage (development and tests) this file answers from the workspace in
 *     memory, with the same filters, the same order and the same keyset paging.
 *
 * This file is the specification the SQL follows. The parity fixture records the ordered
 * answers of these functions to a set of queries, and the Go integration suite requires the
 * database to return the same rows in the same order.
 */
import type { CaseRecord, CaseStatus, GateStatus, OrgConfig, Role, User } from "./types";
import { addMonths, retentionPolicy, type RetentionState } from "./logic";
import { byCodePoint, dashboardOf, evaluateCase, instant, summarizeCase, worstDays, SEVERITY_RANK, type CaseSummary, type DashboardSummary, type Severity } from "./summary";
import { can, canReadCase } from "./rbac";

// ---------------------------------------------------------------------------
// Queries and rows
// ---------------------------------------------------------------------------

export type CaseSort = "updated" | "gate" | "severity" | "urgency" | "retention";

export interface CaseFilter {
  /** Substring of reference, name, email or destination (three characters or more to be selective). */
  q?: string;
  status?: CaseStatus[];
  /** Pipeline stage 1–9 of an open case. */
  stage?: number;
  /** A profile id, or "none" for unassigned. */
  counsellor?: string;
  ids?: string[];
  /** Anything flagged: severity other than none. */
  attention?: boolean;
  severity?: Severity[];
  clock?: "breached" | "due";
  gate?: "pending" | "returned";
  docs?: boolean;
  profile?: boolean;
  holdReview?: boolean;
  retention?: RetentionState[];
}

/** The position after which the next page starts. Opaque: hand back what a row carried. */
export interface Cursor { k: (string | number | boolean)[]; id: string }

export interface CaseQuery extends CaseFilter {
  sort?: CaseSort;
  /** Reverses the sort's natural direction. */
  dir?: "asc" | "desc";
  limit?: number;
  after?: Cursor | null;
  /** Pins "now" (tests). */
  now?: string;
}

/** A case as a list shows it: its summary and what it means now, never the document. */
export interface CaseRow extends CaseSummary {
  breached: number;
  dueSoon: number;
  /** 0 bad, 1 warn, 2 info, 3 none. */
  severityRank: number;
  retention: RetentionState;
  retentionDueAt: string | null;
  /** The most overdue live clock in days; null when no clock runs. */
  worstDays: number | null;
  cursor: Cursor;
}

export interface Page<T, C = Cursor> { rows: T[]; next: C | null }

export interface Dashboard extends DashboardSummary { computedAt: string }

export interface TransferRow {
  caseId: string; caseRef: string; id: string; at: string | null; step: number | null;
  recipient: string | null; recipientType: string | null; recipientApproved: boolean | null; country: string | null;
  dataCategories: string[] | null; lawfulBasis: string | null; safeguard: string | null; note: string | null; byName: string | null;
  cursor: RegisterCursor;
}
export interface TransferQuery { q?: string; safeguard?: "none"; type?: string; limit?: number; after?: RegisterCursor | null }

export interface GateRow {
  caseId: string; caseRef: string; studentName: string | null; id: string; gate: number | null; round: number | null; status: GateStatus | null;
  submittedAt: string | null; submittedBy: string | null; decidedAt: string | null; decidedBy: string | null;
  suggestions: string | null; addressedAt: string | null;
  cursor: RegisterCursor;
}
export interface GateQuery { status?: "pending" | "decided"; gate?: 16 | 19; limit?: number; after?: RegisterCursor | null }
export interface GateStats { pending: number; oldestPendingAt: string | null; decided: number; approved: number; firstRoundApproved: number; avgTurnaroundDays: number | null }

/** Registers page by (instant, case, row id). */
export interface RegisterCursor { at: string; case: string; transfer?: string; gate?: string }

export interface UserRow extends User { hasSignIn: boolean; caseId: string | null; caseRef: string | null; cursor: UserCursor }
export interface UserCursor { name: string; id: string }
export interface UserQuery { role?: Role | "staff"; q?: string; active?: boolean; limit?: number; after?: UserCursor | null }

/** What every backend answers. */
export interface ReadModel {
  casesPage(q: CaseQuery): Promise<Page<CaseRow>>;
  /** Counted up to `cap` (default 10,000): a result equal to the cap means "at least". */
  casesCount(f: CaseFilter & { now?: string }, cap?: number): Promise<number>;
  dashboard(): Promise<Dashboard>;
  transfersPage(q: TransferQuery): Promise<Page<TransferRow, RegisterCursor>>;
  gatesPage(q: GateQuery): Promise<Page<GateRow, RegisterCursor>>;
  gateStats(): Promise<GateStats>;
  usersPage(q: UserQuery): Promise<Page<UserRow, UserCursor>>;
}

export const PAGE_LIMIT_MAX = 200;
export const clampLimit = (n: number | undefined, fallback = 50): number => Math.min(Math.max(Math.trunc(n ?? fallback), 1), PAGE_LIMIT_MAX);

// ---------------------------------------------------------------------------
// The wire form (public.cases_page takes one JSON argument, snake_case keys)
// ---------------------------------------------------------------------------

export function caseQueryToWire(q: CaseQuery & { cap?: number }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && k !== "ids" && v.length === 0)) continue;
    out[k === "holdReview" ? "hold_review" : k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The reference implementation
// ---------------------------------------------------------------------------

const INT_MAX = 2147483647;
type KeyVal = string | number | boolean;

/** Instants in cursors are ISO strings, with Postgres's spelling of the two infinities. */
const tsKey = (ms: number): string => (ms === Infinity ? "infinity" : ms === -Infinity ? "-infinity" : new Date(ms).toISOString());
const keyNum = (v: KeyVal): number => {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  if (v === "infinity") return Infinity;
  if (v === "-infinity") return -Infinity;
  return Date.parse(v);
};
const ms = (iso: string | null | undefined, missing: number): number => (iso ? Date.parse(iso) : missing);

/** list_at: the document's updatedAt, or −∞. */
const listAtOf = (s: CaseSummary): number => ms(s.updatedAt, -Infinity);

export function retentionDueAtOf(s: CaseSummary, config: OrgConfig): string | null {
  if (!s.retentionAnchorAt || !s.retentionKind) return null;
  const p = retentionPolicy(config);
  const months = s.retentionKind === "exited" ? p.exitedMonths : s.retentionKind === "completed" ? p.completedMonths : p.dormantMonths;
  return addMonths(s.retentionAnchorAt, months).toISOString();
}

/** The row for one case at `now`, without its cursor. */
export function caseRowOf(c: CaseRecord, config: OrgConfig, now: number): Omit<CaseRow, "cursor"> {
  const s = summarizeCase(c);
  const st = evaluateCase(s, config, now);
  return {
    ...s,
    breached: st.breached, dueSoon: st.dueSoon, severityRank: SEVERITY_RANK[st.severity], retention: st.retention,
    retentionDueAt: retentionDueAtOf(s, config), worstDays: worstDays(st),
  };
}

const searchText = (r: CaseSummary): string => [r.ref, r.studentName, r.studentEmail, r.destination].join(" ").toLowerCase();
const DAY = 86_400_000;

/** public.case_filter: the same conditions, read off the row. */
export function caseMatches(r: Omit<CaseRow, "cursor">, f: CaseFilter, now: number): boolean {
  const open = r.status === "open";
  if (f.q && !searchText(r).includes(f.q.toLowerCase())) return false;
  if (f.status?.length && !f.status.includes(r.status)) return false;
  if (typeof f.stage === "number" && !(open && r.stage === f.stage)) return false;
  if (f.counsellor === "none" ? r.counsellorId != null : f.counsellor ? r.counsellorId !== f.counsellor : false) return false;
  if (f.ids && !f.ids.includes(r.id)) return false;
  if (f.attention && r.severityRank >= 3) return false;
  if (f.severity?.length && !f.severity.map((x) => SEVERITY_RANK[x]).includes(r.severityRank)) return false;
  if (f.clock === "breached" && !(r.breached > 0)) return false;
  if (f.clock === "due" && !(r.breached > 0 || r.dueSoon > 0)) return false;
  if (f.gate === "pending" && !(open && r.gatePending != null)) return false;
  if (f.gate === "returned" && !(open && r.gateReturned != null)) return false;
  if (f.docs && !(open && r.docsUploaded > 0)) return false;
  if (f.profile && !(open && r.profileSubmitted)) return false;
  if (f.holdReview && !((r.status === "hold" || r.status === "deferred") && r.holdReviewAt != null && Date.parse(r.holdReviewAt) <= now - DAY)) return false;
  if (f.retention?.length && !f.retention.includes(r.retention)) return false;
  return true;
}

interface SortSpec { keys: ((r: Omit<CaseRow, "cursor">) => KeyVal)[]; desc: boolean[]; idDesc: boolean }

/** public.case_sort_keys and the direction rules of public.cases_page. */
export function caseSortSpec(q: CaseQuery): SortSpec {
  const sort = q.sort ?? "updated";
  const oneStatus = q.status?.length === 1 || typeof q.stage === "number";
  let base: [(r: Omit<CaseRow, "cursor">) => KeyVal, boolean][];
  switch (sort) {
    case "updated": base = [...(oneStatus ? [] : [[(r: Omit<CaseRow, "cursor">) => r.status === "open", true] as [(r: Omit<CaseRow, "cursor">) => KeyVal, boolean]]), [(r) => tsKey(listAtOf(r)), true]]; break;
    case "gate": base = [[(r) => tsKey(ms(r.gatePendingAt, Infinity)), false]]; break;
    case "severity": base = [[(r) => r.severityRank, false], [(r) => tsKey(listAtOf(r)), true]]; break;
    case "urgency": base = [[(r) => r.worstDays ?? INT_MAX, false]]; break;
    case "retention": base = [[(r) => tsKey(ms(r.retentionDueAt, Infinity)), false]]; break;
    default: throw new Error(`Unknown sort ${String(sort)}`);
  }
  const flip = q.dir != null && q.dir !== (sort === "updated" ? "desc" : "asc");
  const desc = base.map(([, d]) => d !== flip);
  return { keys: base.map(([f]) => f), desc, idDesc: desc.every((d) => d === desc[0]) && desc[0] };
}

function compareKeyed(a: KeyVal[], aid: string, b: KeyVal[], bid: string, desc: boolean[], idDesc: boolean): number {
  for (let i = 0; i < desc.length; i++) {
    const x = keyNum(a[i]), y = keyNum(b[i]);
    if (x !== y) return (x < y ? -1 : 1) * (desc[i] ? -1 : 1);
  }
  return byCodePoint(aid, bid) * (idDesc ? -1 : 1);
}

/** Keyset paging over rows already filtered: sort, skip to the cursor, take a page. */
function pageOf<R, C>(rows: R[], key: (r: R) => { k: KeyVal[]; id: string }, cmp: (a: { k: KeyVal[]; id: string }, b: { k: KeyVal[]; id: string }) => number,
  after: { k: KeyVal[]; id: string } | null | undefined, limit: number, cursorOf: (r: R, k: { k: KeyVal[]; id: string }) => C): { rows: (R & { cursor: C })[]; next: C | null } {
  const keyed = rows.map((r) => ({ r, key: key(r) })).sort((a, b) => cmp(a.key, b.key));
  const start = after ? keyed.findIndex((x) => cmp(x.key, after) > 0) : 0;
  const slice = start < 0 ? [] : keyed.slice(start, start + limit);
  const out = slice.map((x) => ({ ...x.r, cursor: cursorOf(x.r, x.key) }));
  return { rows: out, next: out.length === limit ? out[out.length - 1].cursor : null };
}

export function localCasesPage(cases: CaseRecord[], q: CaseQuery, config: OrgConfig, nowMs?: number): Page<CaseRow> {
  const now = q.now ? Date.parse(q.now) : nowMs ?? Date.now();
  const spec = caseSortSpec(q);
  const rows = cases.map((c) => caseRowOf(c, config, now)).filter((r) => caseMatches(r, q, now));
  return pageOf(rows,
    (r) => ({ k: spec.keys.map((f) => f(r)), id: r.id }),
    (a, b) => compareKeyed(a.k, a.id, b.k, b.id, spec.desc, spec.idDesc),
    q.after, clampLimit(q.limit), (_r, k) => ({ k: k.k, id: k.id }));
}

export function localCasesCount(cases: CaseRecord[], f: CaseFilter & { now?: string }, config: OrgConfig, cap = 10_000, nowMs?: number): number {
  const now = f.now ? Date.parse(f.now) : nowMs ?? Date.now();
  let n = 0;
  for (const c of cases) if (caseMatches(caseRowOf(c, config, now), f, now) && ++n >= cap) break;
  return Math.min(n, Math.max(cap, 1));
}

export function localDashboard(cases: CaseRecord[], config: OrgConfig, nowMs = Date.now()): Dashboard {
  return { ...dashboardOf(cases.map(summarizeCase), config, nowMs), computedAt: new Date(nowMs).toISOString() };
}

const registerCmp = (desc: boolean) => (a: { k: KeyVal[]; id: string }, b: { k: KeyVal[]; id: string }) => {
  const x = keyNum(a.k[0]), y = keyNum(b.k[0]);
  if (x !== y) return (x < y ? -1 : 1) * (desc ? -1 : 1);
  const c = byCodePoint(String(a.k[1]), String(b.k[1])) || byCodePoint(a.id, b.id);
  return c * (desc ? -1 : 1);
};
const registerAfter = (c: RegisterCursor | null | undefined, rowKey: "transfer" | "gate") =>
  c ? { k: [c.at, c.case] as KeyVal[], id: c[rowKey] ?? "" } : null;

export function localTransfersPage(cases: CaseRecord[], q: TransferQuery): Page<TransferRow, RegisterCursor> {
  const text = q.q?.toLowerCase();
  const rows: Omit<TransferRow, "cursor">[] = [];
  for (const c of cases) (c.transfers ?? []).forEach((t, i) => {
    const r: Omit<TransferRow, "cursor"> = {
      caseId: c.id, caseRef: c.ref, id: t.id ?? String(i + 1), at: instant(t.at), step: typeof t.step === "number" ? t.step : null,
      recipient: t.recipient ?? null, recipientType: t.recipientType ?? null, recipientApproved: typeof t.recipientApproved === "boolean" ? t.recipientApproved : null,
      country: t.country ?? null, dataCategories: Array.isArray(t.dataCategories) ? t.dataCategories : null, lawfulBasis: t.lawfulBasis ?? null,
      safeguard: t.safeguard ?? null, note: t.note ?? null, byName: t.byName ?? null,
    };
    if (text && !`${r.recipient ?? ""} ${r.country ?? ""} ${r.caseRef}`.toLowerCase().includes(text)) return;
    if (q.safeguard === "none" && r.safeguard !== "None recorded") return;
    if (q.type && r.recipientType !== q.type) return;
    rows.push(r);
  });
  return pageOf(rows, (r) => ({ k: [tsKey(ms(r.at, -Infinity)), r.caseId], id: r.id }), registerCmp(true),
    registerAfter(q.after, "transfer"), clampLimit(q.limit), (r, k) => ({ at: String(k.k[0]), case: r.caseId, transfer: r.id }));
}

export function localGatesPage(cases: CaseRecord[], q: GateQuery): Page<GateRow, RegisterCursor> {
  const pending = q.status === "pending";
  const rows: Omit<GateRow, "cursor">[] = [];
  for (const c of cases) (c.gates ?? []).forEach((g, i) => {
    if (!g || typeof g !== "object") return;
    const decided = g.status === "approved" || g.status === "returned";
    if (pending ? g.status !== "pending" : !decided) return;
    if (q.gate && g.gate !== q.gate) return;
    rows.push({
      caseId: c.id, caseRef: c.ref, studentName: c.student?.name ?? null, id: g.id ?? String(i + 1), gate: typeof g.gate === "number" ? g.gate : null, round: typeof g.round === "number" ? g.round : null,
      status: g.status ?? null, submittedAt: instant(g.submittedAt), submittedBy: g.submittedBy ?? null, decidedAt: instant(g.decidedAt),
      decidedBy: g.decidedBy ?? null, suggestions: g.suggestions ?? null, addressedAt: instant(g.addressedAt),
    });
  });
  return pageOf(rows,
    (r) => ({ k: [tsKey(pending ? ms(r.submittedAt, Infinity) : ms(r.decidedAt, -Infinity)), r.caseId], id: r.id }),
    registerCmp(!pending), registerAfter(q.after, "gate"), clampLimit(q.limit), (r, k) => ({ at: String(k.k[0]), case: r.caseId, gate: r.id }));
}

export function localGateStats(cases: CaseRecord[]): GateStats {
  let pending = 0, decided = 0, approved = 0, firstRoundApproved = 0, turnSum = 0, turnN = 0;
  let oldest: string | null = null;
  for (const c of cases) for (const g of c.gates ?? []) {
    if (g.status === "pending") {
      pending++;
      const at = instant(g.submittedAt);
      if (at && (!oldest || at < oldest)) oldest = at;
    } else if (g.status === "approved" || g.status === "returned") {
      decided++;
      if (g.status === "approved") { approved++; if (g.round === 1) firstRoundApproved++; }
      const sub = instant(g.submittedAt);
      if (sub) { turnSum += (ms(instant(g.decidedAt) ?? sub, 0) - Date.parse(sub)) / DAY; turnN++; }
    }
  }
  return { pending, oldestPendingAt: oldest, decided, approved, firstRoundApproved, avgTurnaroundDays: turnN ? Math.round((turnSum / turnN) * 10) / 10 : null };
}

/** The users_read policy, for browser storage. */
export function userVisible(config: OrgConfig, viewer: User | null, u: User, viewerCases: CaseRecord[]): boolean {
  if (!viewer || !viewer.active) return false;
  if (u.id === viewer.id) return true;
  if (can(config, viewer, "staff.read")) return true;
  if (can(config, viewer, "staff.view") && u.role !== "student") return true;
  return viewerCases.some((c) => c.studentUserId === viewer.id && c.counsellorId === u.id);
}

export function localUsersPage(users: User[], q: UserQuery, cases: CaseRecord[] = []): Page<UserRow, UserCursor> {
  const text = q.q?.toLowerCase();
  const rows = users.filter((u) =>
    (!q.role || (q.role === "staff" ? u.role !== "student" : u.role === q.role))
    && (!text || `${u.name} ${u.email}`.toLowerCase().includes(text))
    && (q.active == null || u.active === q.active));
  const nameKey = (u: User) => u.name.toLowerCase();
  const sorted = rows.sort((a, b) => byCodePoint(nameKey(a), nameKey(b)) || byCodePoint(a.id, b.id));
  const after = q.after;
  const start = after ? sorted.findIndex((u) => (byCodePoint(nameKey(u), after.name) || byCodePoint(u.id, after.id)) > 0) : 0;
  const limit = clampLimit(q.limit);
  const slice = start < 0 ? [] : sorted.slice(start, start + limit);
  const caseOf = (u: User) => (u.role === "student" ? cases.filter((c) => c.studentUserId === u.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] : undefined);
  const out: UserRow[] = slice.map((u) => { const c = caseOf(u); return { ...u, hasSignIn: !!u.passwordHash, caseId: c?.id ?? null, caseRef: c?.ref ?? null, cursor: { name: nameKey(u), id: u.id } }; });
  return { rows: out, next: out.length === limit ? out[out.length - 1].cursor : null };
}

/** The browser-storage read model over a workspace, as the given user would see it. */
export function localReadModel(ws: () => { cases: CaseRecord[]; users: User[]; config: OrgConfig; viewer: User | null }): ReadModel {
  const visible = () => {
    const w = ws();
    return { ...w, cases: w.cases.filter((c) => canReadCase(w.config, w.viewer, c)) };
  };
  return {
    casesPage: async (q) => { const w = visible(); return localCasesPage(w.cases, q, w.config); },
    casesCount: async (f, cap) => { const w = visible(); return localCasesCount(w.cases, f, w.config, cap); },
    dashboard: async () => { const w = visible(); return localDashboard(w.cases, w.config); },
    transfersPage: async (q) => {
      const w = visible();
      return can(w.config, w.viewer, "dataprotection.read") ? localTransfersPage(w.cases, q) : { rows: [], next: null };
    },
    gatesPage: async (q) => localGatesPage(visible().cases, q),
    gateStats: async () => localGateStats(visible().cases),
    usersPage: async (q) => {
      const w = ws();
      return localUsersPage(w.users.filter((u) => userVisible(w.config, w.viewer, u, w.cases)), q, w.cases.filter((c) => canReadCase(w.config, w.viewer, c)));
    },
  };
}
