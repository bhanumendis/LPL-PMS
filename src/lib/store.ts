/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
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
import { SupabaseBackend, readServerConfig } from "./server";

export { DEFAULT_RETENTION, MIN_PASSWORD_LENGTH, defaultConfig, defaultOrg, defaultCases, defaultAudit, defaultPrompts };

export type BackendKind = "server" | "shared" | "local" | "memory";

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
  replaceAll(w: Workspace): Promise<void>;
  clear(): Promise<void>;
  watch?(fn: () => void): () => void;
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

const K = { org: "lpl:pms:org", cases: "lpl:pms:cases", audit: "lpl:pms:audit", prompts: "lpl:pms:prompts" };

export function defaultWorkspace(): Workspace { return { org: defaultOrg(), cases: defaultCases(), audit: defaultAudit(), prompts: defaultPrompts() }; }

function parse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return { ...fallback, ...(JSON.parse(raw) as T) }; } catch { return fallback; }
}

/** Stored organisation state is brought up to the current configuration shape on every load. */
function normalizeOrg(o: OrgState): OrgState {
  return { config: normalizeConfig(o.config), users: o.users && typeof o.users === "object" ? o.users : {} };
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
  async replaceAll(w: Workspace) {
    await this.kv.set(K.org, JSON.stringify(w.org));
    await this.kv.set(K.cases, JSON.stringify(w.cases));
    await this.kv.set(K.audit, JSON.stringify(w.audit));
    await this.kv.set(K.prompts, JSON.stringify(w.prompts));
  }
  async clear() {
    await this.kv.del(K.org); await this.kv.del(K.cases); await this.kv.del(K.audit); await this.kv.del(K.prompts);
  }
}

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

function pickBackend(): Backend {
  const server = readServerConfig();
  if (server) return new SupabaseBackend(server);
  if (typeof window !== "undefined" && window.storage && typeof window.storage.get === "function") return new SharedBackend();
  if (typeof window !== "undefined" && localStorageUsable()) return new LocalStorageBackend();
  return new MemoryBackend();
}

// ---------- helpers ----------

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function nowIso(): string { return new Date().toISOString(); }

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
  snap: Snapshot = { ...defaultWorkspace(), loaded: false, syncedAt: 0, backend: this.backend.kind };

  get kind(): BackendKind { return this.backend.kind; }

  /** The server adapter when one is connected, for the sign-in flow. Null on browser storage. */
  get server(): SupabaseBackend | null { return this.backend instanceof SupabaseBackend ? this.backend : null; }

  /** Swap adapters after the server connection is changed, without a page reload. */
  reconnect() {
    if (this.timer != null) { window.clearInterval(this.timer); this.timer = null; }
    this.unwatch?.(); this.unwatch = null;
    if (this.backend instanceof MemoryBackend) this.backend.close();
    this.backend = pickBackend();
    this.snap = { ...defaultWorkspace(), loaded: false, syncedAt: 0, backend: this.backend.kind };
    this.emit();
    return this.start();
  }

  subscribe(fn: Listener) { this.listeners.add(fn); fn(this.snap); return () => { this.listeners.delete(fn); }; }
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
  private lastVersion: string | null = null;

  async refresh() {
    try {
      // Server: ask for a one-row version first and skip the full download when nothing moved.
      const server = this.server;
      if (server && this.snap.loaded) {
        const v = await server.version();
        if (v !== null && v === this.lastVersion) { this.syncedAt = Date.now(); return; }
        this.lastVersion = v;
      }
      const { org, cases, audit, prompts } = await this.backend.load();
      this.syncedAt = Date.now();
      const changed = !this.snap.loaded
        || org.config.rev !== this.snap.org.config.rev
        || cases.rev !== this.snap.cases.rev
        || audit.rev !== this.snap.audit.rev
        || audit.entries[0]?.id !== this.snap.audit.entries[0]?.id
        || prompts.rev !== this.snap.prompts.rev
        || usersSignature(org.users) !== usersSignature(this.snap.org.users)
        || Object.keys(cases.cases).length !== Object.keys(this.snap.cases.cases).length
        || Object.keys(prompts.prompts).length !== Object.keys(this.snap.prompts.prompts).length;
      if (changed) this.update({ org, cases, audit, prompts, loaded: true, syncedAt: this.syncedAt, error: undefined });
      else if (!this.snap.loaded || this.snap.error) this.update({ loaded: true, syncedAt: this.syncedAt, error: undefined });
    } catch (e) {
      this.update({ loaded: true, error: (e as Error).message });
    }
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
      this.update({ error: message });
      this.errorListeners.forEach((l) => l(message));
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
      const before = await this.backend.load();
      const prev = deepClone(before.org);
      const next = (fn(before.org) as OrgState | undefined) ?? before.org;
      if (configWithoutRev(next.config) !== configWithoutRev(prev.config)) next.config.rev = (next.config.rev ?? 0) + 1;
      await this.backend.saveOrg(next, prev);
      this.update({ org: next, syncedAt: Date.now() });
      return next;
    });
  }

  async mutateCases(fn: (c: CasesState) => CasesState | void): Promise<CasesState> {
    return this.withLock(async () => {
      const before = await this.backend.load();
      const prev = deepClone(before.cases);
      const next = (fn(before.cases) as CasesState | undefined) ?? before.cases;
      next.rev = (next.rev ?? 0) + 1;
      await this.backend.saveCases(next, prev);
      this.update({ cases: next, syncedAt: Date.now() });
      return next;
    });
  }

  async mutateCase(id: string, fn: (c: CaseRecord) => CaseRecord | void): Promise<CaseRecord | null> {
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
      const before = await this.backend.load();
      const prev = deepClone(before.prompts);
      const next = (fn(before.prompts) as PromptsState | undefined) ?? before.prompts;
      next.rev = (next.rev ?? 0) + 1;
      await this.backend.savePrompts(next, prev);
      this.update({ prompts: next, syncedAt: Date.now() });
      return next;
    });
  }

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
    });
  }

  async resetAll() {
    await this.withLock(async () => {
      await this.backend.clear();
      this.update({ ...defaultWorkspace(), syncedAt: Date.now() });
    });
  }

  findUserByEmail(email: string): User | undefined {
    const e = email.trim().toLowerCase();
    return Object.values(this.snap.org.users).find((u) => u.email.toLowerCase() === e);
  }
}

export const store = new Store();
