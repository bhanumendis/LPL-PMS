/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Supabase adapter — PostgREST for data, GoTrue for identity, hand-rolled over fetch so the
 * single-file build carries no extra dependency.
 *
 * Three things matter about this file:
 *   1. Passwords never touch it. GoTrue holds them; the browser sees only tokens.
 *   2. Reads are not filtered here. `select` returns whatever row-level security allows,
 *      so a counsellor loading the workspace receives their own caseload and nothing else.
 *      See supabase/schema.sql — the policies are the access control, not this code.
 *   3. Registration is closed. The only sign-up the database accepts is the first
 *      administrator on an empty project. Every other account is created by an
 *      administrator through the admin-users Edge Function (supabase/functions/admin-users).
 */
import type { AuditEntry, AuditState, CaseRecord, CasesState, OrgConfig, OrgState, PromptTemplate, PromptsState, User } from "./types";
import type { AuditEventType, Change, EntityType } from "./audit";
import type { AuditQuery } from "./store";
import { defaultAudit, defaultCases, defaultConfig, defaultPrompts, normalizeConfig } from "./defaults";
import type { NotificationRow, NotificationState, NotificationType, Priority } from "@/notifications/types";
import type { PushDevice, PushSubscriptionInput } from "@/notifications/push";
import { BROWSER_STORAGE_ALLOWED } from "./runtime";

export interface ServerConfig { url: string; anonKey: string }

const SERVER_KEY = "lpl:pms:server";
const SESSION_KEY = "lpl:pms:server-session";

/**
 * Build-time connection: VITE_API_URL points at lpl-api (or, during development, straight at
 * a Supabase project), VITE_API_ANON_KEY is the public key. The v5 names are still read.
 */
function buildTimeConfig(): ServerConfig | null {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const url = env.VITE_API_URL || env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_API_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
  return url && anonKey ? { url: url.replace(/\/+$/, ""), anonKey } : null;
}

/**
 * Production: the build-time connection and nothing else. Development: a connection entered
 * in Settings wins over the build-time one, so a local build can be pointed at a test stack.
 */
export function readServerConfig(): ServerConfig | null {
  if (!BROWSER_STORAGE_ALLOWED) return buildTimeConfig();
  try {
    const raw = localStorage.getItem(SERVER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ServerConfig;
      if (parsed?.url && parsed?.anonKey) return { url: parsed.url.replace(/\/+$/, ""), anonKey: parsed.anonKey };
    }
  } catch { /* fall through to build-time */ }
  return buildTimeConfig();
}

export function writeServerConfig(cfg: ServerConfig | null): void {
  if (!BROWSER_STORAGE_ALLOWED) return;
  try {
    if (cfg) localStorage.setItem(SERVER_KEY, JSON.stringify({ url: cfg.url.replace(/\/+$/, ""), anonKey: cfg.anonKey }));
    else localStorage.removeItem(SERVER_KEY);
  } catch { /* storage unavailable; the build-time connection still applies */ }
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

interface Session { accessToken: string; refreshToken: string; expiresAt: number }

function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch { return null; }
}

function writeSession(s: Session | null): void {
  try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

export class ServerError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export type AdminUserResult = { ok: true; authId: string } | { ok: false; error: string; notDeployed?: boolean };

class Client {
  private session: Session | null = readSession();
  private refreshing: Promise<void> | null = null;

  constructor(readonly cfg: ServerConfig) {}

  get signedIn(): boolean { return this.session !== null; }

  private headers(json = true): Record<string, string> {
    const h: Record<string, string> = { apikey: this.cfg.anonKey, Authorization: `Bearer ${this.session?.accessToken ?? this.cfg.anonKey}` };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }

  private async ensureFresh(): Promise<void> {
    if (!this.session) return;
    if (this.session.expiresAt - Date.now() > 60_000) return;
    if (!this.refreshing) {
      this.refreshing = this.refresh().finally(() => { this.refreshing = null; });
    }
    await this.refreshing;
  }

  private async refresh(): Promise<void> {
    const rt = this.session?.refreshToken;
    if (!rt) return;
    const res = await fetch(`${this.cfg.url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST", headers: { apikey: this.cfg.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) { this.setSession(null); return; }
    this.setSession(await res.json() as GoTrueToken);
  }

  private setSession(tok: GoTrueToken | null): void {
    if (!tok) { this.session = null; writeSession(null); return; }
    this.session = { accessToken: tok.access_token, refreshToken: tok.refresh_token, expiresAt: Date.now() + tok.expires_in * 1000 };
    writeSession(this.session);
  }

  // ---- auth ----

  async signIn(email: string, password: string): Promise<{ authId: string } | { error: string }> {
    const res = await fetch(`${this.cfg.url}/auth/v1/token?grant_type=password`, {
      method: "POST", headers: { apikey: this.cfg.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: readableAuthError(body, res.status) };
    this.setSession(body as GoTrueToken);
    return { authId: (body as GoTrueToken).user.id };
  }

  /**
   * Used once, to bootstrap the first administrator on an empty project. The database
   * trigger rejects every later sign-up that an administrator has not provisioned.
   */
  async bootstrapSignUp(email: string, password: string, meta: Record<string, unknown>): Promise<{ authId: string; needsConfirmation: boolean } | { error: string }> {
    const res = await fetch(`${this.cfg.url}/auth/v1/signup`, {
      method: "POST", headers: { apikey: this.cfg.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password, data: meta }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: readableAuthError(body, res.status) };
    const tok = body as Partial<GoTrueToken> & { id?: string };
    if (tok.access_token) { this.setSession(tok as GoTrueToken); return { authId: tok.user!.id, needsConfirmation: false }; }
    // Email confirmation is on: GoTrue returns the user without a session.
    return { authId: String(tok.id ?? ""), needsConfirmation: true };
  }

  async signOut(): Promise<void> {
    if (this.session) {
      await fetch(`${this.cfg.url}/auth/v1/logout`, { method: "POST", headers: this.headers() }).catch(() => undefined);
    }
    this.setSession(null);
  }

  async currentAuthId(): Promise<string | null> {
    if (!this.session) return null;
    await this.ensureFresh();
    if (!this.session) return null;
    const res = await fetch(`${this.cfg.url}/auth/v1/user`, { headers: this.headers(false) });
    if (!res.ok) { this.setSession(null); return null; }
    const u = await res.json() as { id: string };
    return u.id;
  }

  // ---- administrator-only account management (Edge Function, service role stays on the server) ----

  async adminUsers(action: "create" | "set_password" | "deactivate" | "reactivate", payload: Record<string, unknown>): Promise<AdminUserResult> {
    await this.ensureFresh();
    let res: Response;
    try {
      res = await fetch(`${this.cfg.url}/functions/v1/admin-users`, { method: "POST", headers: this.headers(), body: JSON.stringify({ action, ...payload }) });
    } catch {
      return { ok: false, error: "Could not reach the admin-users function. Check the project URL and that the function is deployed.", notDeployed: true };
    }
    const body = await res.json().catch(() => ({})) as { auth_id?: string; error?: string };
    if (res.status === 404) return { ok: false, error: "The admin-users Edge Function is not deployed on this project. Deploy supabase/functions/admin-users, then try again.", notDeployed: true };
    if (!res.ok) return { ok: false, error: body.error || `The server refused the request (${res.status}).` };
    return { ok: true, authId: String(body.auth_id ?? "") };
  }

  // ---- PostgREST ----

  async select<T>(table: string, query = ""): Promise<T[]> {
    await this.ensureFresh();
    const res = await fetch(`${this.cfg.url}/rest/v1/${table}?select=*${query}`, { headers: this.headers(false) });
    if (!res.ok) throw new ServerError(await readableRestError(res), res.status);
    return await res.json() as T[];
  }

  /**
   * Upsert. Postgres applies the INSERT and SELECT policies (and BEFORE INSERT triggers) to an
   * upsert even when the row exists, so it is reserved for tables whose policies allow both
   * for the caller — today only the caller's own push subscriptions.
   */
  async upsert(table: string, rows: unknown[], onConflict = "id"): Promise<void> {
    if (!rows.length) return;
    await this.ensureFresh();
    const res = await fetch(`${this.cfg.url}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: { ...this.headers(), Prefer: "return=minimal,resolution=merge-duplicates" },
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new ServerError(await readableRestError(res), res.status);
  }

  /** A plain INSERT of new rows: only the insert policy applies. A duplicate id answers 409. */
  async insert(table: string, rows: unknown[]): Promise<void> {
    if (!rows.length) return;
    await this.ensureFresh();
    const res = await fetch(`${this.cfg.url}/rest/v1/${table}`, {
      method: "POST",
      headers: { ...this.headers(), Prefer: "return=minimal" },
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new ServerError(await readableRestError(res), res.status);
  }

  /** Anonymous-safe check for "this project has no administrator yet". */
  async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    await this.ensureFresh();
    const res = await fetch(`${this.cfg.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: this.headers(), body: JSON.stringify(args) });
    if (!res.ok) throw new ServerError(await readableRestError(res), res.status);
    return await res.json() as T;
  }

  /** A plain UPDATE of existing rows: only the update policy and the BEFORE UPDATE guards apply. */
  async patch(table: string, query: string, values: Record<string, unknown>): Promise<void> {
    await this.ensureFresh();
    const res = await fetch(`${this.cfg.url}/rest/v1/${table}?${query}`, {
      method: "PATCH", headers: { ...this.headers(), Prefer: "return=minimal" }, body: JSON.stringify(values),
    });
    if (!res.ok) throw new ServerError(await readableRestError(res), res.status);
  }

  async remove(table: string, query: string): Promise<void> {
    await this.ensureFresh();
    const res = await fetch(`${this.cfg.url}/rest/v1/${table}?${query}`, { method: "DELETE", headers: { ...this.headers(), Prefer: "return=minimal" } });
    if (!res.ok) throw new ServerError(await readableRestError(res), res.status);
  }
}

interface GoTrueToken { access_token: string; refresh_token: string; expires_in: number; user: { id: string } }

function readableAuthError(body: unknown, status: number): string {
  const b = body as { error_description?: string; msg?: string; message?: string; error?: string };
  const raw = b?.error_description || b?.msg || b?.message || b?.error;
  if (status === 400 && /invalid login/i.test(raw ?? "")) return "The email or password is incorrect.";
  if (status === 422 && /already registered/i.test(raw ?? "")) return "An account with this email already exists.";
  // The closed-registration trigger aborts the sign-up transaction; GoTrue reports that as a
  // generic database error, so both wordings map to the same explanation.
  if (/registration is closed|database error saving new user/i.test(raw ?? "")) return "Registration is closed. Accounts are created by an administrator.";
  if (status === 429) return "Too many attempts. Wait a minute and try again.";
  return raw || `The server refused the request (${status}).`;
}

async function readableRestError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null) as { message?: string; hint?: string } | null;
  if (res.status === 401 || res.status === 403) return "Your session does not permit that. Sign in again, or ask an administrator to check your role.";
  if (res.status === 409 && body?.hint === "stale_revision") return body.message ?? "This record was changed by someone else. Reload and try again.";
  // Database and gateway internals never reach the user. The API's request id is the reference
  // support looks up in the server log.
  if (res.status >= 500) {
    const ref = res.headers.get("x-request-id");
    return `The server could not complete the request. Try again in a moment.${ref ? ` Reference ${ref}.` : ""}`;
  }
  if (res.status === 429) return "Too many requests. Wait a minute and try again.";
  return body?.message ? `${body.message}${body.hint ? ` — ${body.hint}` : ""}` : `Request failed (${res.status}).`;
}

// ---------------------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------------------

interface OrgRow { id: string; config: OrgConfig }
interface UserRow {
  id: string; auth_id: string | null; email: string; name: string; phone: string | null; branch: string | null;
  role: User["role"]; active: boolean; created_at: string; created_by: string | null; last_sign_in_at: string | null;
}
interface CaseRow { id: string; ref: string; status: string; counsellor_id: string | null; student_user_id: string | null; rev: number; updated_at: string; data: CaseRecord }
interface AuditRow {
  id: string; at: string; actor_id: string; actor_name: string; actor_role: User["role"]; action: string; target: string | null; detail: string | null;
  event_type?: string | null; entity_type?: string | null; entity_id?: string | null; entity_label?: string | null; outcome?: string | null;
  source?: string | null; session_id?: string | null; summary?: string | null; changes?: Change[] | null; meta?: Record<string, unknown> | null; has_changes?: boolean | null;
}
interface PromptRow { id: string; title: string; status: string; version: number; updated_at: string; updated_by: string; data: PromptTemplate }
interface NotificationDbRow {
  id: string; recipient_id: string; at: string; type: NotificationType; priority: Priority; title: string; body: string | null;
  case_id: string | null; case_ref: string | null; step: number | null; link: string | null; group_key: string | null; dedupe_key: string | null;
  read_at: string | null; pushed_at: string | null;
}

function toNotification(r: NotificationDbRow): NotificationRow {
  return {
    id: r.id, recipientId: r.recipient_id, at: r.at, type: r.type, priority: r.priority, title: r.title, body: r.body ?? undefined,
    caseId: r.case_id ?? undefined, caseRef: r.case_ref ?? undefined, step: r.step ?? undefined, link: r.link ?? undefined,
    groupKey: r.group_key ?? undefined, dedupeKey: r.dedupe_key ?? undefined, readAt: r.read_at ?? undefined,
  };
}

function toUser(r: UserRow): User {
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone ?? undefined, branch: r.branch ?? undefined,
    role: r.role, passwordHash: "", active: r.active, createdAt: r.created_at,
    createdBy: r.created_by ?? undefined, lastSignInAt: r.last_sign_in_at ?? undefined,
  };
}

/** The profile columns a client may send; id, auth_id and timestamps belong to the database. */
type UserColumns = Pick<UserRow, "email" | "name" | "phone" | "branch" | "role" | "active" | "created_by" | "last_sign_in_at">;

function userColumns(u: User): UserColumns {
  return {
    email: u.email.trim().toLowerCase(), name: u.name, phone: u.phone ?? null, branch: u.branch ?? null,
    role: u.role, active: u.active, created_by: u.createdBy ?? null, last_sign_in_at: u.lastSignInAt ?? null,
  };
}

/**
 * Only the columns that actually changed. The profile guard compares old and new values
 * column by column, so sending an unchanged column costs nothing but sending a normalised
 * one (an email in a different case, say) would trip a permission it has no reason to need.
 */
function changedColumns<T extends object>(before: T, after: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(after) as (keyof T)[]) if (JSON.stringify(after[k]) !== JSON.stringify(before[k])) out[k] = after[k];
  return out;
}

function fromAudit(e: AuditEntry): AuditRow {
  return {
    id: e.id, at: e.at, actor_id: e.actorId, actor_name: e.actorName, actor_role: e.actorRole, action: e.action, target: e.target ?? null, detail: e.detail ?? null,
    event_type: e.eventType ?? null, entity_type: e.entityType ?? null, entity_id: e.entityId ?? null, entity_label: e.entityLabel ?? null,
    outcome: e.outcome ?? "success", source: e.source ?? null, session_id: e.sessionId ?? null, summary: e.summary ?? null,
    changes: e.changes?.length ? e.changes : null, meta: e.meta ?? null,
  };
}

function toAudit(r: AuditRow): AuditEntry {
  return {
    id: r.id, at: r.at, actorId: r.actor_id, actorName: r.actor_name, actorRole: r.actor_role, action: r.action, target: r.target ?? undefined, detail: r.detail ?? undefined,
    eventType: (r.event_type ?? undefined) as AuditEventType | undefined, entityType: (r.entity_type ?? undefined) as EntityType | undefined,
    entityId: r.entity_id ?? undefined, entityLabel: r.entity_label ?? undefined, outcome: (r.outcome ?? undefined) as AuditEntry["outcome"],
    source: r.source ?? undefined, sessionId: r.session_id ?? undefined, summary: r.summary ?? undefined,
    changes: r.changes ?? undefined, meta: r.meta ?? undefined, hasChanges: r.has_changes ?? (r.changes ? r.changes.length > 0 : undefined),
  };
}

function promptColumns(p: PromptTemplate): Omit<PromptRow, "id"> {
  return { title: p.title, status: p.status, version: p.version, updated_at: p.updatedAt, updated_by: p.updatedBy, data: p };
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

export class SupabaseBackend {
  readonly kind = "server" as const;
  readonly polling = true;
  readonly client: Client;

  /** The configuration document exactly as stored, so a save changes only the keys that moved. */
  private storedConfig: Record<string, unknown> = {};

  constructor(cfg: ServerConfig) { this.client = new Client(cfg); }

  // ---- identity passthroughs ----
  signIn(email: string, password: string) { return this.client.signIn(email, password); }
  bootstrapSignUp(email: string, password: string, meta: Record<string, unknown>) { return this.client.bootstrapSignUp(email, password, meta); }
  signOut() { return this.client.signOut(); }
  currentAuthId() { return this.client.currentAuthId(); }
  get signedIn() { return this.client.signedIn; }

  /** Administrator creates a sign-in with a temporary password. The profile row must already exist. */
  createSignIn(input: { appUserId: string; email: string; password: string; name: string; phone?: string }) {
    return this.client.adminUsers("create", { app_user_id: input.appUserId, email: input.email.trim().toLowerCase(), password: input.password, name: input.name, phone: input.phone ?? "" });
  }
  setTemporaryPassword(appUserId: string, password: string) {
    return this.client.adminUsers("set_password", { app_user_id: appUserId, password });
  }
  setSignInActive(appUserId: string, active: boolean) {
    return this.client.adminUsers(active ? "reactivate" : "deactivate", { app_user_id: appUserId });
  }

  async load() {
    // Before anyone signs in the anon key can read nothing, so present an empty workspace
    // rather than an error and let the sign-in screen do its job.
    if (!this.client.signedIn) {
      // needs_bootstrap() is the one thing an anonymous caller may ask: it decides whether
      // the first screen is "create the administrator" or "sign in".
      const empty = await this.client.rpc<boolean>("needs_bootstrap").catch(() => false);
      return { org: { config: { ...defaultConfig(), setupComplete: !empty }, users: {} } as OrgState, cases: defaultCases(), audit: defaultAudit(), prompts: defaultPrompts() };
    }
    // The audit log is no longer part of the snapshot: the explorer pages it through audit_page.
    const [orgRows, userRows, caseRows, promptRows] = await Promise.all([
      this.client.select<OrgRow>("org_config"),
      this.client.select<UserRow>("app_users"),
      this.client.select<CaseRow>("cases", "&order=updated_at.desc"),
      // Prompts are administrator-only; other roles receive an empty set from RLS.
      this.client.select<PromptRow>("prompts", "&order=updated_at.desc").catch(() => [] as PromptRow[]),
    ]);
    this.storedConfig = (orgRows[0]?.config ?? {}) as unknown as Record<string, unknown>;
    const config = { ...normalizeConfig(orgRows[0]?.config ?? {}), setupComplete: true };
    const users: Record<string, User> = {};
    userRows.forEach((r) => { users[r.id] = toUser(r); });
    const cases: Record<string, CaseRecord> = {};
    caseRows.forEach((r) => { cases[r.id] = r.data; });
    const prompts: Record<string, PromptTemplate> = {};
    promptRows.forEach((r) => { prompts[r.id] = r.data; });
    return {
      org: { config, users } as OrgState,
      cases: { cases, rev: caseRows.reduce((n, r) => n + (r.rev ?? 0), 0) } as CasesState,
      audit: defaultAudit(),
      prompts: { prompts, rev: promptRows.reduce((n, r) => n + (r.version ?? 0), 0) } as PromptsState,
    };
  }

  /**
   * Writes only what changed, as INSERTs for new rows and PATCHes for existing ones. The
   * configuration is one JSON document whose top-level keys answer to different permissions
   * (permissions → role.write, processors → dataprotection.write, the rest → settings.write),
   * so the saved document is the stored one with only the changed keys replaced: a Team
   * Leader editing processors never appears to touch a key they may not write.
   */
  async saveOrg(next: OrgState, prev: OrgState) {
    const moved = (Object.keys(next.config) as (keyof OrgState["config"])[])
      .filter((k) => k !== "rev" && k !== "setupComplete" && JSON.stringify(next.config[k]) !== JSON.stringify(prev.config[k]));
    if (moved.length) {
      const doc: Record<string, unknown> = { ...this.storedConfig };
      for (const k of moved) doc[k] = next.config[k];
      doc.rev = next.config.rev;
      await this.client.patch("org_config", "id=eq.org", { config: doc });
      this.storedConfig = doc;
    }
    const fresh: User[] = [];
    for (const u of Object.values(next.users)) {
      const before = prev.users[u.id];
      if (!before) { fresh.push(u); continue; }
      const diff = changedColumns(userColumns(before), userColumns(u));
      if (Object.keys(diff).length) await this.client.patch("app_users", `id=eq.${encodeURIComponent(u.id)}`, diff);
    }
    if (fresh.length) await this.client.insert("app_users", fresh.map((u) => ({ id: u.id, created_at: u.createdAt, ...userColumns(u) })));
  }

  /**
   * A changed case is saved through save_case() with its next revision; the database accepts
   * it only when the stored revision is exactly one behind (HTTP 409 otherwise) and reports a
   * case the caller can no longer change (403/404) instead of matching nothing silently. The
   * row's status and the columns row-level security reads are derived from the document.
   */
  async saveCases(next: CasesState, prev: CasesState) {
    const created: CaseRecord[] = [];
    for (const c of Object.values(next.cases)) {
      const before = prev.cases[c.id];
      if (!before) { created.push(c); continue; }
      if (before.rev === c.rev && before.updatedAt === c.updatedAt) continue;
      await this.client.rpc<number>("save_case", { p_id: c.id, p_rev: c.rev, p_data: c });
    }
    if (created.length) await this.client.insert("cases", created.map((c) => ({ id: c.id, ref: c.ref, rev: 1, data: { ...c, rev: 1 } })));
    const removed = Object.keys(prev.cases).filter((id) => !next.cases[id]);
    for (const id of removed) await this.client.remove("cases", `id=eq.${encodeURIComponent(id)}`);
  }

  async savePrompts(next: PromptsState, prev: PromptsState) {
    const created: PromptTemplate[] = [];
    for (const p of Object.values(next.prompts)) {
      const before = prev.prompts[p.id];
      if (!before) { created.push(p); continue; }
      if (JSON.stringify(before) !== JSON.stringify(p)) await this.client.patch("prompts", `id=eq.${encodeURIComponent(p.id)}`, promptColumns(p));
    }
    if (created.length) await this.client.insert("prompts", created.map((p) => ({ id: p.id, ...promptColumns(p) })));
    const removed = Object.keys(prev.prompts).filter((id) => !next.prompts[id]);
    for (const id of removed) await this.client.remove("prompts", `id=eq.${encodeURIComponent(id)}`);
  }

  /** Audit rows are only ever inserted; the attribution trigger overwrites the actor columns. */
  async pushAudit(entry: AuditEntry) {
    await this.client.insert("audit", [fromAudit(entry)]);
  }

  /** One keyset page of the audit log, newest first; RLS (audit.read) decides what comes back. */
  async auditPage(q: AuditQuery): Promise<AuditEntry[]> {
    const rows = await this.client.rpc<AuditRow[]>("audit_page", {
      p_before: q.before ?? null, p_actor: q.actorId ?? null, p_event_type: q.eventType ?? null, p_entity_type: q.entityType ?? null,
      p_entity_id: q.entityId ?? null, p_from: q.from ?? null, p_to: q.to ?? null, p_q: q.q?.trim() || null, p_limit: q.limit ?? 50,
    });
    return (Array.isArray(rows) ? rows : []).map(toAudit);
  }

  async auditDetail(id: string): Promise<Pick<AuditEntry, "changes" | "meta"> | null> {
    const rows = await this.client.rpc<{ id: string; changes: Change[] | null; meta: Record<string, unknown> | null }[]>("audit_detail", { p_id: id });
    const r = Array.isArray(rows) ? rows[0] : undefined;
    return r ? { changes: r.changes ?? undefined, meta: r.meta ?? undefined } : null;
  }

  /**
   * Maps a GoTrue identity to the LPL profile. The database trigger in schema.sql links
   * the identity to the profile an administrator created for that email address.
   */
  async profileForAuth(authId: string): Promise<User | null> {
    const rows = await this.client.select<UserRow>("app_users", `&auth_id=eq.${encodeURIComponent(authId)}`);
    return rows[0] ? toUser(rows[0]) : null;
  }

  /** Email domains whose accounts may hold SUPER ADMIN (read-only for every application role). */
  async groupItDomains(): Promise<string[]> {
    const rows = await this.client.select<{ domain: string }>("group_it_domains", "&order=domain.asc");
    return rows.map((r) => r.domain);
  }

  /** Before the first account exists: the domains the first (SUPER ADMIN) account may use. */
  async bootstrapDomains(): Promise<string[]> {
    const d = await this.client.rpc<string[] | null>("bootstrap_domains");
    return Array.isArray(d) ? d : [];
  }

  /** Reference numbers come from a database sequence so that two staff cannot issue the same one. */
  async nextCaseRef(prefix: string): Promise<string> {
    return await this.client.rpc<string>("next_case_ref", { prefix });
  }

  async touchSignIn(userId: string): Promise<void> {
    await this.client.patch("app_users", `id=eq.${encodeURIComponent(userId)}`, { last_sign_in_at: new Date().toISOString() }).catch(() => undefined);
  }

  /**
   * Whole-workspace restore is a browser-storage feature. On a server it would overwrite live
   * records from a file with no revision checks, so production data is backed up and restored
   * with the database's own tools instead (docs/OPERATIONS.md).
   */
  async replaceAll(_w: { org: OrgState; cases: CasesState; audit: AuditState; prompts: PromptsState }): Promise<void> {
    throw new ServerError("Restoring a workspace file is not available on a server. Restore from a database backup instead.", 405);
  }

  // ---- notifications: written by database triggers, read through RLS-scoped RPCs ----

  async notificationState(): Promise<NotificationState> {
    if (!this.client.signedIn) return { unread: 0, latest: null };
    const rows = await this.client.rpc<{ unread: number; latest: string | null }[] | { unread: number; latest: string | null }>("notification_state");
    const r = Array.isArray(rows) ? rows[0] : rows;
    return { unread: Number(r?.unread ?? 0), latest: r?.latest ?? null };
  }
  async notificationsPage(_userId: string, before: string | null, limit: number, unreadOnly: boolean): Promise<NotificationRow[]> {
    const rows = await this.client.rpc<NotificationDbRow[]>("notifications_page", { p_before: before, p_limit: limit, p_unread_only: unreadOnly });
    return (rows ?? []).map(toNotification);
  }
  async markNotificationsRead(_userId: string, ids: string[]): Promise<number> {
    return Number(await this.client.rpc<number>("mark_notifications_read", { p_ids: ids }));
  }
  async markAllNotificationsRead(): Promise<number> {
    return Number(await this.client.rpc<number>("mark_all_notifications_read"));
  }

  // ---- push subscriptions (own rows under RLS) ----
  async savePushSubscription(userId: string, sub: PushSubscriptionInput): Promise<void> {
    const now = new Date().toISOString();
    await this.client.upsert("push_subscriptions", [{ user_id: userId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, user_agent: sub.userAgent, last_seen_at: now, revoked_at: null }], "endpoint");
  }
  async revokePushSubscription(_userId: string, endpoint: string): Promise<void> {
    await this.client.patch("push_subscriptions", `endpoint=eq.${encodeURIComponent(endpoint)}`, { revoked_at: new Date().toISOString() });
  }
  async listPushSubscriptions(userId: string): Promise<PushDevice[]> {
    const rows = await this.client.select<{ endpoint: string; created_at: string; last_seen_at: string; user_agent: string | null }>("push_subscriptions", `&user_id=eq.${encodeURIComponent(userId)}&revoked_at=is.null&order=created_at.desc`);
    return rows.map((r) => ({ endpoint: r.endpoint, createdAt: r.created_at, lastSeenAt: r.last_seen_at, userAgent: r.user_agent ?? undefined }));
  }

  /** Cheap change probe used by polling; null when the project predates the function. */
  async version(): Promise<string | null> {
    if (!this.client.signedIn) return null;
    return await this.client.rpc<string>("workspace_version").catch(() => null);
  }

  /** Wiping a live database from a browser is not a feature. */
  async clear(): Promise<void> {
    throw new ServerError("Resetting the workspace is not available on a server.", 405);
  }
}
