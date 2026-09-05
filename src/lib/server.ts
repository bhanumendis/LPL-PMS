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
import { defaultAudit, defaultCases, defaultConfig, defaultPrompts, normalizeConfig } from "./defaults";

export interface ServerConfig { url: string; anonKey: string }

const SERVER_KEY = "lpl:pms:server";
const SESSION_KEY = "lpl:pms:server-session";

/** Build-time configuration, used when the app is served rather than opened as a file. */
function buildTimeConfig(): ServerConfig | null {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  return url && anonKey ? { url: url.replace(/\/+$/, ""), anonKey } : null;
}

/** A connection entered in Settings wins over the build-time one, so one file can be repointed. */
export function readServerConfig(): ServerConfig | null {
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

  /** Anonymous-safe check for "this project has no administrator yet". */
  async rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    await this.ensureFresh();
    const res = await fetch(`${this.cfg.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: this.headers(), body: JSON.stringify(args) });
    if (!res.ok) throw new ServerError(await readableRestError(res), res.status);
    return await res.json() as T;
  }

  /** A plain UPDATE. Upsert would also need the INSERT policy, which most roles lack. */
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
interface AuditRow { id: string; at: string; actor_id: string; actor_name: string; actor_role: User["role"]; action: string; target: string | null; detail: string | null }
interface PromptRow { id: string; title: string; status: string; version: number; updated_at: string; updated_by: string; data: PromptTemplate }

function toUser(r: UserRow): User {
  return {
    id: r.id, name: r.name, email: r.email, phone: r.phone ?? undefined, branch: r.branch ?? undefined,
    role: r.role, passwordHash: "", active: r.active, createdAt: r.created_at,
    createdBy: r.created_by ?? undefined, lastSignInAt: r.last_sign_in_at ?? undefined,
  };
}

function fromUser(u: User, authId?: string | null): Omit<UserRow, "auth_id"> & { auth_id?: string | null } {
  const row: Omit<UserRow, "auth_id"> & { auth_id?: string | null } = {
    id: u.id, email: u.email.toLowerCase(), name: u.name, phone: u.phone ?? null, branch: u.branch ?? null,
    role: u.role, active: u.active, created_at: u.createdAt, created_by: u.createdBy ?? null,
    last_sign_in_at: u.lastSignInAt ?? null,
  };
  if (authId !== undefined) row.auth_id = authId;
  return row;
}

function fromCase(c: CaseRecord): CaseRow {
  return {
    id: c.id, ref: c.ref, status: c.status, counsellor_id: c.counsellorId ?? null,
    student_user_id: c.studentUserId ?? null, rev: c.rev ?? 0, updated_at: c.updatedAt, data: c,
  };
}

function fromAudit(e: AuditEntry): AuditRow {
  return { id: e.id, at: e.at, actor_id: e.actorId, actor_name: e.actorName, actor_role: e.actorRole, action: e.action, target: e.target ?? null, detail: e.detail ?? null };
}

function toAudit(r: AuditRow): AuditEntry {
  return { id: r.id, at: r.at, actorId: r.actor_id, actorName: r.actor_name, actorRole: r.actor_role, action: r.action, target: r.target ?? undefined, detail: r.detail ?? undefined };
}

function fromPrompt(p: PromptTemplate): PromptRow {
  return { id: p.id, title: p.title, status: p.status, version: p.version, updated_at: p.updatedAt, updated_by: p.updatedBy, data: p };
}

// ---------------------------------------------------------------------------
// Backend
// ---------------------------------------------------------------------------

export class SupabaseBackend {
  readonly kind = "server" as const;
  readonly polling = true;
  readonly client: Client;

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
    const [orgRows, userRows, caseRows, auditRows, promptRows] = await Promise.all([
      this.client.select<OrgRow>("org_config"),
      this.client.select<UserRow>("app_users"),
      this.client.select<CaseRow>("cases", "&order=updated_at.desc"),
      this.client.select<AuditRow>("audit", "&order=at.desc&limit=600"),
      // Prompts are administrator-only; other roles receive an empty set from RLS.
      this.client.select<PromptRow>("prompts", "&order=updated_at.desc").catch(() => [] as PromptRow[]),
    ]);
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
      // The revision follows the newest entry rather than the row count, which saturates at the 600-row window.
      audit: { entries: auditRows.map(toAudit), rev: auditRows[0] ? Date.parse(auditRows[0].at) || auditRows.length : 0 } as AuditState,
      prompts: { prompts, rev: promptRows.reduce((n, r) => n + (r.version ?? 0), 0) } as PromptsState,
    };
  }

  /**
   * Writes only what changed. org_config is written only when the configuration itself
   * differs, so a user-directory change by a role without settings.write never touches it.
   */
  async saveOrg(next: OrgState, prev: OrgState) {
    if (JSON.stringify(next.config) !== JSON.stringify(prev.config)) await this.client.upsert("org_config", [{ id: "org", config: next.config }]);
    const changed = Object.values(next.users).filter((u) => JSON.stringify(u) !== JSON.stringify(prev.users[u.id]));
    if (changed.length) await this.client.upsert("app_users", changed.map((u) => fromUser(u)));
  }

  async saveCases(next: CasesState, prev: CasesState) {
    const changed = Object.values(next.cases).filter((c) => {
      const before = prev.cases[c.id];
      return !before || before.rev !== c.rev || before.updatedAt !== c.updatedAt;
    });
    if (changed.length) await this.client.upsert("cases", changed.map(fromCase));
    const removed = Object.keys(prev.cases).filter((id) => !next.cases[id]);
    for (const id of removed) await this.client.remove("cases", `id=eq.${encodeURIComponent(id)}`);
  }

  async savePrompts(next: PromptsState, prev: PromptsState) {
    const changed = Object.values(next.prompts).filter((p) => JSON.stringify(p) !== JSON.stringify(prev.prompts[p.id]));
    if (changed.length) await this.client.upsert("prompts", changed.map(fromPrompt));
    const removed = Object.keys(prev.prompts).filter((id) => !next.prompts[id]);
    for (const id of removed) await this.client.remove("prompts", `id=eq.${encodeURIComponent(id)}`);
  }

  async pushAudit(entry: AuditEntry) {
    await this.client.upsert("audit", [fromAudit(entry)]);
  }

  /**
   * Maps a GoTrue identity to the LPL profile. The database trigger in schema.sql links
   * the identity to the profile an administrator created for that email address.
   */
  async profileForAuth(authId: string): Promise<User | null> {
    const rows = await this.client.select<UserRow>("app_users", `&auth_id=eq.${encodeURIComponent(authId)}`);
    return rows[0] ? toUser(rows[0]) : null;
  }

  /** Reference numbers come from a database sequence so that two staff cannot issue the same one. */
  async nextCaseRef(prefix: string): Promise<string> {
    return await this.client.rpc<string>("next_case_ref", { prefix });
  }

  async touchSignIn(userId: string): Promise<void> {
    await this.client.patch("app_users", `id=eq.${encodeURIComponent(userId)}`, { last_sign_in_at: new Date().toISOString() }).catch(() => undefined);
  }

  async replaceAll(w: { org: OrgState; cases: CasesState; audit: AuditState; prompts: PromptsState }) {
    await this.client.upsert("org_config", [{ id: "org", config: w.org.config }]);
    const users = Object.values(w.org.users);
    if (users.length) await this.client.upsert("app_users", users.map((u) => fromUser(u)));
    const cases = Object.values(w.cases.cases);
    // Chunked so a restore does not arrive as one oversized request.
    for (let i = 0; i < cases.length; i += 25) await this.client.upsert("cases", cases.slice(i, i + 25).map(fromCase));
    const entries = w.audit.entries.slice(0, 600);
    for (let i = 0; i < entries.length; i += 100) await this.client.upsert("audit", entries.slice(i, i + 100).map(fromAudit));
    const prompts = Object.values(w.prompts.prompts);
    if (prompts.length) await this.client.upsert("prompts", prompts.map(fromPrompt));
  }

  /** Cheap change probe used by polling; null when the project predates the function. */
  async version(): Promise<string | null> {
    if (!this.client.signedIn) return null;
    return await this.client.rpc<string>("workspace_version").catch(() => null);
  }

  /** The caller's own profile row goes last: every other delete needs its permissions. */
  async clear() {
    await this.client.remove("prompts", "id=neq.__none__");
    await this.client.remove("cases", "id=neq.__none__");
    await this.client.remove("audit", "id=neq.__none__");
    await this.client.remove("org_config", "id=neq.__none__");
    await this.client.remove("app_users", "id=neq.__none__");
  }
}
