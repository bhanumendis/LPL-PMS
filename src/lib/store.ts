/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Persistence. Adapters are tried in order:
 *   1. supabase      — a real server, when one is configured (see server.ts)
 *   2. window.storage — shared key-value store when hosted inside a Claude artifact
 *   3. localStorage   — the browser the file is opened in (cross-tab sync via the storage event)
 *   4. memory         — fallback when none is available (private browsing with storage disabled)
 *
 * The Backend interface is document-shaped rather than key-value so that a server adapter can
 * write one case at a time and let the database enforce who may read it. The three browser
 * adapters implement the same interface over four JSON blobs, which is all they can do.
 */
import type { AuditEntry, AuditState, CaseRecord, CasesState, OrgState, PromptsState, User } from "./types";
import { DEFAULT_RETENTION, MIN_PASSWORD_LENGTH, defaultAudit, defaultCases, defaultConfig, defaultOrg, defaultPrompts, normalizeConfig } from "./defaults";
import { ServerError, SupabaseBackend, readServerConfig } from "./server";
import type { NotificationRow, NotificationState } from "@/notifications/types";
import { fanout } from "@/notifications/fanout";
import type { PushDevice, PushSubscriptionInput } from "@/notifications/push";
import type { AuditEvent, AuditEventType, EntityType } from "./audit";
import { sessionId } from "./hooks";
import { BROWSER_STORAGE_ALLOWED } from "./runtime";
import { migrateRbac } from "./rbac";
import { localReadModel, type ReadModel } from "./queries";

/** Filters for one page of the audit log. `before` is the `at` of the last row already shown. */
export interface AuditQuery { before?: string | null; actorId?: string; eventType?: AuditEventType; entityType?: EntityType; entityId?: string; from?: string; to?: string; q?: string; limit?: number }

export const AUDIT_WINDOW_DAYS = 30;

/** Development/browser-storage stand-in for public.group_it_domains. */
export const DEV_GROUP_IT_DOMAINS: readonly string[] = ["lyceum.lk"];

/** The browser-storage form of audit_page: same filters, same default window, same ordering. */
export function filterAudit(entries: AuditEntry[], q: AuditQuery, now = Date.now()): AuditEntry[] {
  const from = q.from ?? new Date(now - AUDIT_WINDOW_DAYS * 86_400_000).toISOString();
  const text = q.q?.trim().toLowerCase();
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  return entries
    .filter((e) => (!q.before || e.at < q.before)
      && (!q.actorId || e.actorId === q.actorId)
      && (!q.eventType || e.eventType === q.eventType)
      && (!q.entityType || e.entityType === q.entityType)
      && (!q.entityId || e.entityId === q.entityId)
      && e.at >= from
      && (!q.to || e.at <= q.to)
      && (!text || [e.action, e.summary, e.target, e.entityLabel, e.actorName].some((v) => v?.toLowerCase().includes(text))))
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
    .slice(0, limit)
    .map(({ changes, meta, ...rest }) => ({ ...rest, hasChanges: !!changes?.length || !!meta }));
}

export { DEFAULT_RETENTION, MIN_PASSWORD_LENGTH, defaultConfig, defaultOrg, defaultCases, defaultAudit, defaultPrompts };

export type BackendKind = "server" | "shared" | "local" | "memory" | "unconfigured";

export interface Workspace {
  org: OrgState;
  cases: CasesState;
  audit: AuditState;
  prompts: PromptsState;
}

export interface Backend {
  kind: BackendKind;
  /** True when the adapter cannot tell us about outside changes and has to be polled. */
  polling: boolean;
  load(): Promise<Workspace>;
  /** `prev` lets a row-per-record adapter write only what actually changed. */
  saveOrg(next: OrgState, prev: OrgState): Promise<void>;
  saveCases(next: CasesState, prev: CasesState): Promise<void>;
  savePrompts(next: PromptsState, prev: PromptsState): Promise<void>;
  pushAudit(entry: AuditEntry): Promise<void>;
  auditPage(q: AuditQuery): Promise<AuditEntry[]>;
  auditDetail(id: string): Promise<Pick<AuditEntry, "changes" | "meta"> | null>;
  replaceAll(w: Workspace): Promise<void>;
  clear(): Promise<void>;
  watch?(fn: () => void): () => void;
  // Notifications. On a server the rows are written by triggers and scoped by RLS, so the
  // user id is informational there; the browser adapters filter by it.
  notificationState(userId: string): Promise<NotificationState>;
  notificationsPage(userId: string, before: string | null, limit: number, unreadOnly: boolean): Promise<NotificationRow[]>;
  markNotificationsRead(userId: string, ids: string[]): Promise<number>;
  markAllNotificationsRead(userId: string): Promise<number>;
  /** Browser adapters only: the reference fan-out writes rows here. Absent on the server. */
  appendNotifications?(rows: NotificationRow[]): Promise<void>;
  // Web Push subscriptions, one row per device; own rows only.
  savePushSubscription(userId: string, sub: PushSubscriptionInput): Promise<void>;
  revokePushSubscription(userId: string, endpoint: string): Promise<void>;
  listPushSubscriptions(userId: string): Promise<PushDevice[]>;
}

declare global {
  interface Window {
    storage?: {
      get(key: string, shared?: boolean): Promise<{ key: string; value: string; shared: boolean } | null>;
      set(key: string, value: string, shared?: boolean): Promise<unknown>;
      delete(key: string, shared?: boolean): Promise<unknown>;
      list(prefix?: string, shared?: boolean): Promise<{ keys: string[] } | null>;
    };
  }
}

// ---------- keys and defaults ----------

const K = { org: "lpl:pms:org", cases: "lpl:pms:cases", audit: "lpl:pms:audit", prompts: "lpl:pms:prompts", notifications: "lpl:pms:notifications", push: "lpl:pms:push" };
const NOTIFICATIONS_PER_RECIPIENT = 500;

export function defaultWorkspace(): Workspace { return { org: defaultOrg(), cases: defaultCases(), audit: defaultAudit(), prompts: defaultPrompts() }; }

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return { ...fallback, ...(JSON.parse(raw) as T) }; } catch { return fallback; }
}

/**
 * Stored organisation state is brought up to the current configuration shape on every load.
 * A browser-storage workspace from before v6 is moved to the SUPER ADMIN / ADMIN model the
 * same way the database migration moves a server.
 */
function normalizeOrg(o: OrgState): OrgState {
  const users = o.users && typeof o.users === "object" ? o.users : {};
  const config = { ...(o.config ?? {}) } as OrgState["config"];
  migrateRbac(config, users);
  return { config: normalizeConfig(config), users };
}

// ---------- browser key-value adapters ----------

interface Kv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}

/** Shared behaviour for the three browser adapters: one JSON blob per collection. */
abstract class KvBackend implements Backend {
  abstract kind: BackendKind;
  abstract polling: boolean;
  protected abstract kv: Kv;

  async load(): Promise<Workspace> {
    const [o, c, a, p] = await Promise.all([this.kv.get(K.org), this.kv.get(K.cases), this.kv.get(K.audit), this.kv.get(K.prompts)]);
    return { org: normalizeOrg(parse(o, defaultOrg())), cases: parse(c, defaultCases()), audit: parse(a, defaultAudit()), prompts: parse(p, defaultPrompts()) };
  }
  async saveOrg(next: OrgState) { await this.kv.set(K.org, JSON.stringify(next)); }
  async saveCases(next: CasesState) { await this.kv.set(K.cases, JSON.stringify(next)); }
  async savePrompts(next: PromptsState) { await this.kv.set(K.prompts, JSON.stringify(next)); }
  async pushAudit(entry: AuditEntry) {
    const fresh = parse(await this.kv.get(K.audit), defaultAudit());
    fresh.entries.unshift(entry);
    if (fresh.entries.length > 600) fresh.entries.length = 600;
    fresh.rev = (fresh.rev ?? 0) + 1;
    await this.kv.set(K.audit, JSON.stringify(fresh));
  }
  async auditPage(q: AuditQuery): Promise<AuditEntry[]> {
    return filterAudit(parse(await this.kv.get(K.audit), defaultAudit()).entries, q);
  }
  async auditDetail(id: string): Promise<Pick<AuditEntry, "changes" | "meta"> | null> {
    const e = parse(await this.kv.get(K.audit), defaultAudit()).entries.find((x) => x.id === id);
    return e ? { changes: e.changes, meta: e.meta } : null;
  }
  async replaceAll(w: Workspace) {
    await this.kv.set(K.org, JSON.stringify(w.org));
    await this.kv.set(K.cases, JSON.stringify(w.cases));
    await this.kv.set(K.audit, JSON.stringify(w.audit));
    await this.kv.set(K.prompts, JSON.stringify(w.prompts));
  }
  async clear() {
    await this.kv.del(K.org); await this.kv.del(K.cases); await this.kv.del(K.audit); await this.kv.del(K.prompts); await this.kv.del(K.notifications);
  }

  // ---- notifications: one JSON blob, newest first, capped per recipient ----
  private async readNotifications(): Promise<NotificationRow[]> {
    const raw = await this.kv.get(K.notifications);
    if (!raw) return [];
    try { const p = JSON.parse(raw) as { rows?: NotificationRow[] }; return Array.isArray(p?.rows) ? p.rows : []; } catch { return []; }
  }
  private async writeNotifications(rows: NotificationRow[]) { await this.kv.set(K.notifications, JSON.stringify({ rows })); }
  async appendNotifications(rows: NotificationRow[]) {
    if (!rows.length) return;
    const cur = await this.readNotifications();
    const keys = new Set(cur.map((r) => r.dedupeKey).filter(Boolean));
    const fresh = rows.filter((r) => !r.dedupeKey || !keys.has(r.dedupeKey));
    if (!fresh.length) return;
    const counts = new Map<string, number>();
    const next = [...fresh, ...cur].filter((r) => { const n = (counts.get(r.recipientId) ?? 0) + 1; counts.set(r.recipientId, n); return n <= NOTIFICATIONS_PER_RECIPIENT; });
    await this.writeNotifications(next);
  }
  async notificationState(userId: string): Promise<NotificationState> {
    const mine = (await this.readNotifications()).filter((r) => r.recipientId === userId);
    return { unread: mine.filter((r) => !r.readAt).length, latest: mine.reduce<string | null>((m, r) => (m && m > r.at ? m : r.at), null) };
  }
  async notificationsPage(userId: string, before: string | null, limit: number, unreadOnly: boolean): Promise<NotificationRow[]> {
    return (await this.readNotifications())
      .filter((r) => r.recipientId === userId && (!unreadOnly || !r.readAt) && (!before || r.at < before))
      .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
      .slice(0, limit);
  }
  async markNotificationsRead(userId: string, ids: string[]): Promise<number> {
    const set = new Set(ids);
    const rows = await this.readNotifications();
    const now = new Date().toISOString();
    let n = 0;
    for (const r of rows) if (r.recipientId === userId && set.has(r.id) && !r.readAt) { r.readAt = now; n++; }
    if (n) await this.writeNotifications(rows);
    return n;
  }
  async markAllNotificationsRead(userId: string): Promise<number> {
    const rows = await this.readNotifications();
    const now = new Date().toISOString();
    let n = 0;
    for (const r of rows) if (r.recipientId === userId && !r.readAt) { r.readAt = now; n++; }
    if (n) await this.writeNotifications(rows);
    return n;
  }

  // ---- push subscriptions (kept so the settings card is demonstrable without a server) ----
  private async readPush(): Promise<PushRowLocal[]> {
    const raw = await this.kv.get(K.push);
    if (!raw) return [];
    try { const p = JSON.parse(raw) as { rows?: PushRowLocal[] }; return Array.isArray(p?.rows) ? p.rows : []; } catch { return []; }
  }
  async savePushSubscription(userId: string, sub: PushSubscriptionInput) {
    const rows = (await this.readPush()).filter((r) => r.endpoint !== sub.endpoint);
    rows.unshift({ userId, endpoint: sub.endpoint, userAgent: sub.userAgent, createdAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() });
    await this.kv.set(K.push, JSON.stringify({ rows }));
  }
  async revokePushSubscription(userId: string, endpoint: string) {
    const rows = (await this.readPush()).filter((r) => !(r.userId === userId && r.endpoint === endpoint));
    await this.kv.set(K.push, JSON.stringify({ rows }));
  }
  async listPushSubscriptions(userId: string): Promise<PushDevice[]> {
    return (await this.readPush()).filter((r) => r.userId === userId).map((r) => ({ endpoint: r.endpoint, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, userAgent: r.userAgent }));
  }
}
interface PushRowLocal { userId: string; endpoint: string; userAgent?: string; createdAt: string; lastSeenAt: string }

class SharedBackend extends KvBackend {
  kind = "shared" as const;
  polling = true;
  protected kv: Kv = {
    get: async (key) => { try { const r = await window.storage!.get(key, true); return r?.value ?? null; } catch { return null; } },
    set: async (key, value) => { await window.storage!.set(key, value, true); },
    del: async (key) => { try { await window.storage!.delete(key, true); } catch { /* absent */ } },
  };
}

class LocalStorageBackend extends KvBackend {
  kind = "local" as const;
  polling = false;
  protected kv: Kv = {
    get: async (key) => { try { return localStorage.getItem(key); } catch { return null; } },
    set: async (key, value) => { localStorage.setItem(key, value); },
    del: async (key) => { localStorage.removeItem(key); },
  };
  watch(fn: () => void) {
    const h = (e: StorageEvent) => { if (!e.key || e.key.startsWith("lpl:pms:")) fn(); };
    const v = () => { if (document.visibilityState === "visible") fn(); };
    window.addEventListener("storage", h);
    document.addEventListener("visibilitychange", v);
    window.addEventListener("focus", fn);
    return () => { window.removeEventListener("storage", h); document.removeEventListener("visibilitychange", v); window.removeEventListener("focus", fn); };
  }
}

class MemoryBackend extends KvBackend {
  kind = "memory" as const;
  polling = false;
  private mem = new Map<string, string>();
  private ch: BroadcastChannel | null = null;
  private listeners = new Set<() => void>();
  protected kv: Kv = {
    get: async (key) => this.mem.get(key) ?? null,
    set: async (key, value) => { this.mem.set(key, value); this.ch?.postMessage({ t: "set", key, value }); },
    del: async (key) => { this.mem.delete(key); this.ch?.postMessage({ t: "del", key }); },
  };
  constructor() {
    super();
    if (typeof BroadcastChannel !== "undefined") {
      this.ch = new BroadcastChannel("lpl-pms");
      this.ch.onmessage = (e) => {
        const m = e.data as { t: string; key?: string; value?: string; snapshot?: [string, string][] };
        if (m.t === "set" && m.key) { this.mem.set(m.key, m.value ?? ""); this.listeners.forEach((l) => l()); }
        if (m.t === "del" && m.key) { this.mem.delete(m.key); this.listeners.forEach((l) => l()); }
        if (m.t === "req") this.ch?.postMessage({ t: "snap", snapshot: [...this.mem.entries()] });
        if (m.t === "snap" && m.snapshot && this.mem.size === 0) { m.snapshot.forEach(([k, v]) => this.mem.set(k, v)); this.listeners.forEach((l) => l()); }
      };
      this.ch.postMessage({ t: "req" });
    }
  }
  watch(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  close() { this.ch?.close(); this.ch = null; this.listeners.clear(); }
}

function localStorageUsable(): boolean {
  try {
    const k = "lpl:pms:__probe";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch { return false; }
}

/**
 * A production build with no server connection. It holds nothing and accepts nothing; the
 * application shows the "not connected" screen instead of quietly keeping records in the
 * browser, where they would be unprotected and invisible to everyone else.
 */
class UnconfiguredBackend extends KvBackend {
  kind = "memory" as const;
  polling = false;
  protected kv: Kv = {
    get: async () => null,
    set: async () => { throw new Error("This installation is not connected to its server."); },
    del: async () => undefined,
  };
}

function pickBackend(): Backend {
  const server = readServerConfig();
  if (server) return new SupabaseBackend(server);
  if (!BROWSER_STORAGE_ALLOWED) return new UnconfiguredBackend();
  if (typeof window !== "undefined" && window.storage && typeof window.storage.get === "function") return new SharedBackend();
  if (typeof window !== "undefined" && localStorageUsable()) return new LocalStorageBackend();
  return new MemoryBackend();
}

function kindOf(b: Backend): BackendKind { return b instanceof UnconfiguredBackend ? "unconfigured" : b.kind; }

// ---------- helpers ----------

export { uid, nowIso } from "./ids";
import { nowIso, uid } from "./ids";

/**
 * Deep copy of plain workspace data. The mutation helpers change records in place, so the
 * "before" image handed to a row-per-record adapter must be a real copy — a shallow copy
 * would compare a record with itself and write nothing.
 */
export function deepClone<T>(v: T): T {
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Fingerprint of the user directory for change detection, independent of the config revision. */
function usersSignature(users: Record<string, User>): string {
  return Object.values(users).map((u) => `${u.id}|${u.role}|${u.active ? 1 : 0}|${u.name}|${u.email}|${u.branch ?? ""}|${u.phone ?? ""}|${u.lastSignInAt ?? ""}`).sort().join("\n");
}

function configWithoutRev(c: OrgState["config"]): string {
  const { rev: _rev, ...rest } = c;
  return JSON.stringify(rest);
}

/**
 * Only used by the browser-only adapters, where there is no server to hash against.
 * When a server is configured, passwords never reach this function — the identity
 * provider holds them and this field stays empty.
 */
export async function hashPassword(pw: string): Promise<string> {
  const text = "lpl-pms::" + pw;
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  } catch { /* fall through */ }
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) { h1 ^= text.charCodeAt(i); h1 = Math.imul(h1, 0x01000193) >>> 0; h2 = (h2 + text.charCodeAt(i) * 31) >>> 0; }
  return "f" + h1.toString(16) + h2.toString(16);
}

/** Password rule applied everywhere a password is set: length, and not just one character class. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return "Mix at least three of: lower case, upper case, digits, symbols.";
  return null;
}

// ---------- store ----------

export interface Snapshot {
  org: OrgState;
  cases: CasesState;
  audit: AuditState;
  prompts: PromptsState;
  loaded: boolean;
  syncedAt: number;
  backend: BackendKind;
  error?: string;
}

type Listener = (s: Snapshot) => void;

class Store {
  private backend: Backend = pickBackend();
  private listeners = new Set<Listener>();
  private errorListeners = new Set<(message: string) => void>();
  private timer: number | null = null;
  private unwatch: (() => void) | null = null;
  private busy = 0;
  snap: Snapshot = { ...defaultWorkspace(), loaded: false, syncedAt: 0, backend: kindOf(this.backend) };

  get kind(): BackendKind { return kindOf(this.backend); }

  // ---------- the read model ----------

  /**
   * Lists, counts, registers and dashboards. On a server the database answers them a page at a
   * time under row-level security; in browser storage src/lib/queries.ts answers them from the
   * workspace in memory, as the signed-in user would see it.
   */
  get read(): ReadModel {
    return this.server?.read ?? this.localRead;
  }
  private localRead = localReadModel(() => ({
    cases: Object.values(this.snap.cases.cases), users: Object.values(this.snap.org.users), config: this.snap.org.config,
    viewer: this.currentUserId ? this.snap.org.users[this.currentUserId] ?? null : null,
  }));

  /** Bumped whenever what the read model answers may have changed; open lists re-read on it. */
  readVersion = 0;
  private readListeners = new Set<() => void>();
  onRead(fn: () => void) { this.readListeners.add(fn); return () => { this.readListeners.delete(fn); }; }
  private bumpRead() { this.readVersion++; this.readListeners.forEach((l) => l()); }

  /**
   * Case documents in use. In browser storage every case is in the snapshot; on a server only
   * the ones opened (and a student's own) are, and a document is fetched when a view needs it.
   * Views that show one hold a watch on it, so a change elsewhere is re-read while it is open.
   */
  private watched = new Map<string, number>();
  watchCase(id: string): () => void {
    this.watched.set(id, (this.watched.get(id) ?? 0) + 1);
    return () => { const n = (this.watched.get(id) ?? 1) - 1; if (n > 0) this.watched.set(id, n); else this.watched.delete(id); };
  }

  /** The case document, from the snapshot or (on a server) fetched. Null when not visible. */
  async openCase(id: string): Promise<CaseRecord | null> {
    const cached = this.snap.cases.cases[id];
    const server = this.server;
    if (cached || !server) return cached ?? null;
    const c = await server.getCase(id);
    if (c) this.putCases([c]);
    return c;
  }

  private putCases(list: CaseRecord[], drop: string[] = []) {
    const cases = { ...this.snap.cases.cases };
    for (const c of list) cases[c.id] = c;
    for (const id of drop) delete cases[id];
    this.snap = { ...this.snap, cases: { cases, rev: (this.snap.cases.rev ?? 0) + 1 } };
    this.emit();
  }

  /** The server adapter when one is connected, for the sign-in flow. Null on browser storage. */
  get server(): SupabaseBackend | null { return this.backend instanceof SupabaseBackend ? this.backend : null; }

  /** Swap adapters after the server connection is changed, without a page reload. */
  reconnect() {
    if (this.timer != null) { window.clearInterval(this.timer); this.timer = null; }
    this.unwatch?.(); this.unwatch = null;
    if (this.backend instanceof MemoryBackend) this.backend.close();
    this.backend = pickBackend();
    this.snap = { ...defaultWorkspace(), loaded: false, syncedAt: 0, backend: kindOf(this.backend) };
    this.emit();
    return this.start();
  }

  subscribe(fn: Listener) { this.listeners.add(fn); fn(this.snap); return () => { this.listeners.delete(fn); }; }

  // ---------- notifications ----------

  private currentUserId: string | null = null;
  /** Unread count and newest timestamp for the signed-in user; polled with the workspace tick. */
  notif: NotificationState = { unread: 0, latest: null };
  private notifListeners = new Set<(s: NotificationState) => void>();

  /** The signed-in profile id; the shell sets it on sign-in and clears it on sign-out. */
  setCurrentUser(id: string | null) {
    if (id === this.currentUserId) return;
    this.currentUserId = id;
    this.notif = { unread: 0, latest: null };
    this.emitNotif();
    this.bumpRead();
    if (id) void this.pollNotifications();
  }
  get currentUser(): string | null { return this.currentUserId; }
  onNotifications(fn: (s: NotificationState) => void) { this.notifListeners.add(fn); fn(this.notif); return () => { this.notifListeners.delete(fn); }; }
  private emitNotif() { this.notifListeners.forEach((l) => l(this.notif)); }

  /** One small read per tick; a failure leaves the last known state and retries next tick. */
  async pollNotifications() {
    const uid = this.currentUserId;
    if (!uid) return;
    try {
      const s = await this.backend.notificationState(uid);
      if (uid !== this.currentUserId) return;
      if (s.unread !== this.notif.unread || s.latest !== this.notif.latest) { this.notif = s; this.emitNotif(); }
    } catch { /* transient; the next tick retries */ }
  }
  notificationsPage(before: string | null, limit: number, unreadOnly: boolean): Promise<NotificationRow[]> {
    const uid = this.currentUserId;
    if (!uid) return Promise.resolve([]);
    return this.backend.notificationsPage(uid, before, limit, unreadOnly);
  }
  async markNotificationsRead(ids: string[]): Promise<number> {
    const uid = this.currentUserId;
    if (!uid || !ids.length) return 0;
    const n = await this.backend.markNotificationsRead(uid, ids);
    await this.pollNotifications();
    return n;
  }
  async markAllNotificationsRead(): Promise<number> {
    const uid = this.currentUserId;
    if (!uid) return 0;
    const n = await this.backend.markAllNotificationsRead(uid);
    await this.pollNotifications();
    return n;
  }
  // ---- push subscriptions ----
  savePushSubscription(sub: PushSubscriptionInput): Promise<void> {
    const uid = this.currentUserId;
    if (!uid) return Promise.reject(new Error("Sign in first."));
    return this.backend.savePushSubscription(uid, sub);
  }
  revokePushSubscription(endpoint: string, userId: string | null = this.currentUserId): Promise<void> {
    if (!userId) return Promise.resolve();
    return this.backend.revokePushSubscription(userId, endpoint);
  }
  listPushSubscriptions(): Promise<PushDevice[]> {
    const uid = this.currentUserId;
    if (!uid) return Promise.resolve([]);
    return this.backend.listPushSubscriptions(uid);
  }

  /**
   * Browser-storage mode has no database trigger, so the store runs the reference fan-out
   * after a case write. On a server this is a no-op: notify_case_change() does the same work
   * inside the transaction, attributed by the database.
   */
  private async fanoutLocal(prev: CasesState, next: CasesState) {
    const uid = this.currentUserId;
    if (!uid || !this.backend.appendNotifications) return;
    const ctx = { actorId: uid, users: this.snap.org.users, config: this.snap.org.config, now: nowIso() };
    const rows: NotificationRow[] = [];
    for (const c of Object.values(next.cases)) {
      const before = prev.cases[c.id];
      if (!before || before.rev !== c.rev || before.updatedAt !== c.updatedAt) rows.push(...fanout(before ?? null, c, ctx));
    }
    if (!rows.length) return;
    await this.backend.appendNotifications(rows);
    void this.pollNotifications();
  }
  /** Called with a readable message whenever a write to the backend fails; the shell shows it as a toast. */
  onError(fn: (message: string) => void) { this.errorListeners.add(fn); return () => { this.errorListeners.delete(fn); }; }
  private emit() { this.listeners.forEach((l) => l(this.snap)); }
  private update(p: Partial<Snapshot>) { this.snap = { ...this.snap, ...p }; this.emit(); }

  async start() {
    await this.refresh();
    if (this.backend.polling && this.timer == null) this.timer = window.setInterval(() => { if (this.busy === 0) void this.refresh(); }, this.backend.kind === "server" ? 8000 : 4000);
    this.unwatch?.();
    this.unwatch = this.backend.watch?.(() => { if (this.busy === 0) void this.refresh(); }) ?? null;
  }

  /** Last time the backend was reached; kept off the snapshot so a quiet poll re-renders nothing. */
  syncedAt = 0;
  /** The server's change counters at the last poll; null forces a full load. */
  private versions: Record<string, number> | null = null;

  async refresh() {
    void this.pollNotifications();
    try {
      const server = this.server;
      if (server) { await this.refreshServer(server); return; }
      const { org, cases, audit, prompts } = await this.backend.load();
      this.syncedAt = Date.now();
      const changed = !this.snap.loaded
        || org.config.rev !== this.snap.org.config.rev
        || cases.rev !== this.snap.cases.rev
        || prompts.rev !== this.snap.prompts.rev
        || usersSignature(org.users) !== usersSignature(this.snap.org.users)
        || Object.keys(cases.cases).length !== Object.keys(this.snap.cases.cases).length
        || Object.keys(prompts.prompts).length !== Object.keys(this.snap.prompts.prompts).length;
      if (changed) { this.update({ org, cases, audit, prompts, loaded: true, syncedAt: this.syncedAt, error: undefined }); this.bumpRead(); }
      else if (!this.snap.loaded || this.snap.error) this.update({ loaded: true, syncedAt: this.syncedAt, error: undefined });
    } catch (e) {
      this.update({ loaded: true, error: (e as Error).message });
    }
  }

  /**
   * One small read per poll (four counters). What moved is re-read, and nothing else: the
   * configuration and staff directory, the prompts, or — for cases — the documents currently
   * open, while open lists and dashboards re-read their page.
   */
  private async refreshServer(server: SupabaseBackend) {
    const v = await server.changeVersions();
    const prev = this.versions;
    if (!v || !prev || !this.snap.loaded) {
      const { org, cases, audit, prompts } = await server.load();
      this.versions = v;
      this.syncedAt = Date.now();
      this.update({ org, cases, audit, prompts, loaded: true, syncedAt: this.syncedAt, error: undefined });
      this.bumpRead();
      return;
    }
    this.versions = v;
    this.syncedAt = Date.now();
    const patch: Partial<Snapshot> = {};
    if (v.users !== prev.users || v.config !== prev.config) patch.org = await server.loadOrg();
    if (v.prompts !== prev.prompts) patch.prompts = await server.loadPrompts();
    if (v.cases !== prev.cases) {
      const self = this.currentUserId ? (patch.org ?? this.snap.org).users[this.currentUserId] : undefined;
      if (self?.role === "student") patch.cases = (await server.load()).cases;
      else {
        // Re-read the documents on screen; forget the rest (they are fetched again if reopened).
        const ids = [...this.watched.keys()];
        const fresh = await Promise.all(ids.map((id) => server.getCase(id).catch(() => this.snap.cases.cases[id] ?? null)));
        const cases: Record<string, CaseRecord> = {};
        fresh.forEach((c) => { if (c) cases[c.id] = c; });
        patch.cases = { cases, rev: (this.snap.cases.rev ?? 0) + 1 };
      }
    }
    if (Object.keys(patch).length || this.snap.error) this.update({ ...patch, syncedAt: this.syncedAt, error: undefined });
    if (patch.cases || patch.org) this.bumpRead();
  }

  /**
   * Serialises writes and turns a backend failure into something the interface can show.
   * The error is rethrown so a caller with its own error slot can still use it.
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    this.busy++;
    try { return await fn(); }
    catch (e) {
      const message = (e as Error).message || "The change could not be saved.";
      this.errorListeners.forEach((l) => l(message));
      if (e instanceof ServerError && e.status === 409) {
        // Someone else saved first. The write was refused whole, so nothing is half-applied:
        // drop the cached version and load theirs, and the user repeats the action on it.
        this.versions = null;
        await this.refresh();
      } else {
        this.update({ error: message });
      }
      throw e;
    }
    finally { this.busy--; }
  }

  /**
   * The "before" image is a deep copy taken before `fn` runs: every mutation helper changes
   * the record in place, and the row-per-record adapter diffs `next` against `prev` to decide
   * what to write. The config revision only moves when the config itself changed, so a
   * user-only change never touches org_config (which a non-administrator may not write).
   */
  async mutateOrg(fn: (o: OrgState) => OrgState | void): Promise<OrgState> {
    return this.withLock(async () => {
      // A server re-reads the configuration and staff directory only, never the whole workspace.
      const current = this.server ? await this.server.loadOrg() : (await this.backend.load()).org;
      const prev = deepClone(current);
      const next = (fn(current) as OrgState | undefined) ?? current;
      if (configWithoutRev(next.config) !== configWithoutRev(prev.config)) next.config.rev = (next.config.rev ?? 0) + 1;
      await this.backend.saveOrg(next, prev);
      this.update({ org: next, syncedAt: Date.now() });
      this.bumpRead();
      return next;
    });
  }

  /**
   * One profile, which need not be in the staff directory the session holds (a student's is
   * not). The latest stored version is read first, so the change applies to what is current.
   */
  async mutateUser(id: string, fn: (u: User) => User | void): Promise<User | null> {
    const server = this.server;
    if (!server) {
      let out: User | null = null;
      await this.mutateOrg((o) => { const u = o.users[id]; if (u) { out = (fn(u) as User | undefined) ?? u; o.users[id] = out; } });
      return out;
    }
    return this.withLock(async () => {
      const current = await server.getUser(id);
      if (!current) throw new ServerError("This profile is not available to you.", 404);
      const prev = deepClone(current);
      const next = (fn(current) as User | undefined) ?? current;
      await server.saveUser(next, prev);
      if (this.snap.org.users[id]) this.update({ org: { ...this.snap.org, users: { ...this.snap.org.users, [id]: next } } });
      this.bumpRead();
      return next;
    });
  }

  /** Whether a profile already uses this address. On a server the unique key is the final word. */
  async emailTaken(email: string): Promise<boolean> {
    const server = this.server;
    if (server) return server.emailTaken(email);
    return !!this.findUserByEmail(email);
  }

  /** Opens a new case (revision 1). */
  async createCase(c: CaseRecord): Promise<CaseRecord> {
    const server = this.server;
    if (!server) { await this.mutateCases((s) => { s.cases[c.id] = c; return s; }); return c; }
    return this.withLock(async () => {
      const created = { ...c, rev: 1 };
      await server.insertCase(created);
      this.putCases([created]);
      this.bumpRead();
      return created;
    });
  }

  /** Browser storage only: a server never writes the whole case collection (see mutateCase, createCase). */
  async mutateCases(fn: (c: CasesState) => CasesState | void): Promise<CasesState> {
    if (this.server) throw new Error("mutateCases is not available on a server; use mutateCase or createCase.");
    return this.withLock(async () => {
      const before = await this.backend.load();
      const prev = deepClone(before.cases);
      const next = (fn(before.cases) as CasesState | undefined) ?? before.cases;
      next.rev = (next.rev ?? 0) + 1;
      await this.backend.saveCases(next, prev);
      this.update({ cases: next, syncedAt: Date.now() });
      this.bumpRead();
      await this.fanoutLocal(prev, next);
      return next;
    });
  }

  /**
   * Changes one case. On a server the latest stored document is read first, the change applied
   * to it, and it is saved at the next revision; the database refuses the save (409) if
   * someone else saved in between, and nothing is half-applied.
   */
  async mutateCase(id: string, fn: (c: CaseRecord) => CaseRecord | void): Promise<CaseRecord | null> {
    const server = this.server;
    if (server) {
      return this.withLock(async () => {
        const current = await server.getCase(id);
        if (!current) throw new ServerError("This case is no longer available to you.", 404);
        const prev = deepClone(current);
        const next = (fn(current) as CaseRecord | undefined) ?? current;
        next.updatedAt = nowIso();
        next.rev = (prev.rev ?? 0) + 1;
        await server.saveCase(next);
        this.putCases([next]);
        this.bumpRead();
        return next;
      });
    }
    let out: CaseRecord | null = null;
    await this.mutateCases((s) => {
      const cur = s.cases[id];
      if (!cur) return;
      const next = (fn(cur) as CaseRecord | undefined) ?? cur;
      next.updatedAt = nowIso();
      next.rev = (next.rev ?? 0) + 1;
      s.cases[id] = next;
      out = next;
    });
    return out;
  }

  async mutatePrompts(fn: (p: PromptsState) => PromptsState | void): Promise<PromptsState> {
    return this.withLock(async () => {
      const current = this.server ? await this.server.loadPrompts() : (await this.backend.load()).prompts;
      const prev = deepClone(current);
      const next = (fn(current) as PromptsState | undefined) ?? current;
      next.rev = (next.rev ?? 0) + 1;
      await this.backend.savePrompts(next, prev);
      this.update({ prompts: next, syncedAt: Date.now() });
      return next;
    });
  }

  /**
   * Records a typed event as the signed-in user. On a server the attribution trigger
   * overwrites the actor columns from the token, so the client values are only a fallback.
   */
  async audit(event: AuditEvent, actor?: Pick<User, "id" | "name" | "role">) {
    const u = actor ?? (this.currentUserId ? this.snap.org.users[this.currentUserId] : undefined);
    if (!u) return;
    await this.appendAudit({ ...event, actorId: u.id, actorName: u.name, actorRole: u.role, outcome: event.outcome ?? "success", source: "web", sessionId: sessionId() });
  }
  auditPage(q: AuditQuery): Promise<AuditEntry[]> { return this.backend.auditPage(q); }
  auditDetail(id: string): Promise<Pick<AuditEntry, "changes" | "meta"> | null> { return this.backend.auditDetail(id); }

  async appendAudit(entry: Omit<AuditEntry, "id" | "at">) {
    return this.withLock(async () => {
      const full: AuditEntry = { ...entry, id: uid(), at: nowIso() };
      await this.backend.pushAudit(full);
      const audit: AuditState = { entries: [full, ...this.snap.audit.entries].slice(0, 600), rev: (this.snap.audit.rev ?? 0) + 1 };
      this.update({ audit, syncedAt: Date.now() });
    });
  }

  /** Replace the whole workspace (used by JSON restore). */
  async replaceAll(org: OrgState, cases: CasesState, audit: AuditState, prompts?: PromptsState) {
    await this.withLock(async () => {
      const normalizedOrg = normalizeOrg(org);
      normalizedOrg.config.rev = (normalizedOrg.config.rev ?? 0) + 1;
      cases.rev = (cases.rev ?? 0) + 1;
      audit.rev = (audit.rev ?? 0) + 1;
      const p = prompts ?? this.snap.prompts;
      p.rev = (p.rev ?? 0) + 1;
      await this.backend.replaceAll({ org: normalizedOrg, cases, audit, prompts: p });
      this.update({ org: normalizedOrg, cases, audit, prompts: p, syncedAt: Date.now() });
      this.bumpRead();
    });
  }

  async resetAll() {
    await this.withLock(async () => {
      await this.backend.clear();
      this.update({ ...defaultWorkspace(), syncedAt: Date.now() });
      this.bumpRead();
    });
  }

  /**
   * Group IT domains for SUPER ADMIN. The database holds and enforces the list; this is only
   * so the interface can explain a refusal before it happens. Browser storage (development)
   * uses the production default.
   */
  async groupItDomains(): Promise<string[]> {
    const server = this.server;
    if (!server) return [...DEV_GROUP_IT_DOMAINS];
    try { return await server.groupItDomains(); } catch { return []; }
  }

  findUserByEmail(email: string): User | undefined {
    const e = email.trim().toLowerCase();
    return Object.values(this.snap.org.users).find((u) => u.email.toLowerCase() === e);
  }
}

export const store = new Store();
