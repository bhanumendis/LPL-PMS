/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { store, type Snapshot } from "@/lib/store";
import { can as canFn } from "@/lib/rbac";
import { STEP_BY_N } from "@/lib/spine";
import type { CaseRecord, Permission, Role, User } from "@/lib/types";
import { ToastProvider, useToast } from "@/lib/ui";
import { BRAND_LOGO, COPYRIGHT, ORG_SHORT, PRODUCT } from "@/lib/brand";
import { AuthScreen } from "@/views/Auth";
import { StaffShell } from "@/views/StaffShell";
import { StudentShell } from "@/views/StudentShell";

export interface Route { page: string; caseId?: string; step?: number; tab?: string; id?: string }

export interface SessionCtx {
  snap: Snapshot;
  user: User | null;
  users: Record<string, User>;
  cases: Record<string, CaseRecord>;
  can: (p: Permission) => boolean;
  /** True only for the Administrator role. Used for features that no configuration can open to other roles. */
  isAdmin: boolean;
  route: Route;
  go: (r: Route) => void;
  signIn: (u: User) => void;
  signOut: () => void;
  log: (action: string, target?: string, detail?: string) => Promise<void>;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const Ctx = createContext<SessionCtx | null>(null);
export function useSession(): SessionCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("session");
  return c;
}

// ---------- hash routing ----------

/** A step number from the URL is only accepted when it names a real process step. */
function stepFromUrl(raw: string | undefined): number | undefined {
  const n = Number(raw);
  return Number.isInteger(n) && STEP_BY_N[n] ? n : undefined;
}

function parseHash(): Route {
  const h = (window.location.hash || "#/").replace(/^#\/?/, "");
  const parts = h.split("/").filter(Boolean);
  if (!parts.length) return { page: "home" };
  if (parts[0] === "case" && parts[1]) {
    const r: Route = { page: "case", caseId: decodeURIComponent(parts[1]) };
    if (parts[2] === "step") r.step = stepFromUrl(parts[3]);
    else if (parts[2]) r.tab = parts[2];
    return r;
  }
  const r: Route = { page: parts[0] };
  if (parts[1] === "step") r.step = stepFromUrl(parts[2]);
  else if (parts[1]) r.id = decodeURIComponent(parts[1]);
  return r;
}
function toHash(r: Route): string {
  if (r.page === "case" && r.caseId) return `#/case/${encodeURIComponent(r.caseId)}${r.step ? `/step/${r.step}` : r.tab ? `/${r.tab}` : ""}`;
  if (r.page === "home") return "#/";
  return `#/${r.page}${r.step ? `/step/${r.step}` : r.id ? `/${encodeURIComponent(r.id)}` : ""}`;
}

const SESSION_KEY = "lpl:pms:session";
const THEME_KEY = "lpl:pms:theme";
function readSession(): string | null { try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; } }
function writeSession(v: string | null) { try { if (v) sessionStorage.setItem(SESSION_KEY, v); else sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } }
function readTheme(): "light" | "dark" {
  try { const t = localStorage.getItem(THEME_KEY); if (t === "dark" || t === "light") return t; } catch { /* ignore */ }
  try { if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark"; } catch { /* ignore */ }
  return "light";
}

export default function App() {
  const [snap, setSnap] = useState<Snapshot>(store.snap);
  const [userId, setUserId] = useState<string | null>(() => readSession());
  const [route, setRoute] = useState<Route>(() => parseHash());
  const [theme, setTheme] = useState<"light" | "dark">(() => readTheme());

  useEffect(() => {
    const un = store.subscribe(setSnap);
    void (async () => {
      await store.start();
      // A server session outlives the tab, so a reopened tab picks the signed-in user back
      // up from the identity provider rather than asking them to sign in again.
      const server = store.server;
      if (server && server.signedIn && !readSession()) {
        const authId = await server.currentAuthId();
        const profile = authId ? await server.profileForAuth(authId) : null;
        if (profile?.active) { setUserId(profile.id); writeSession(profile.id); }
      }
    })();
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => { un(); window.removeEventListener("hashchange", onHash); };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#000000" : "#ffffff");
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  const user = userId ? snap.org.users[userId] ?? null : null;
  useEffect(() => { if (snap.loaded && userId && (!user || !user.active)) { setUserId(null); writeSession(null); } }, [snap.loaded, userId, user]);

  const can = useCallback((p: Permission) => canFn(snap.org.config, user, p), [snap.org.config, user]);
  const isAdmin = !!user && user.active && user.role === "admin";
  const go = useCallback((r: Route) => {
    const h = toHash(r);
    if (window.location.hash === h) setRoute(r); else window.location.hash = h;
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);
  const signIn = useCallback((u: User) => { setUserId(u.id); writeSession(u.id); window.location.hash = "#/"; setRoute({ page: "home" }); }, []);
  const signOut = useCallback(() => {
    void store.server?.signOut();
    setUserId(null); writeSession(null); window.location.hash = "#/"; setRoute({ page: "home" });
  }, []);
  const log = useCallback(async (action: string, target?: string, detail?: string) => {
    if (!user) return;
    await store.appendAudit({ actorId: user.id, actorName: user.name, actorRole: user.role as Role, action, target, detail });
  }, [user]);
  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  const value = useMemo<SessionCtx>(() => ({ snap, user, users: snap.org.users, cases: snap.cases.cases, can, isAdmin, route, go, signIn, signOut, log, theme, toggleTheme }), [snap, user, can, isAdmin, route, go, signIn, signOut, log, theme, toggleTheme]);

  return (
    <ToastProvider>
      <StoreErrorToasts />
      <Ctx.Provider value={value}>
        {!snap.loaded ? (
          <div className="loading" role="status" aria-live="polite"><div><div className="spinner" aria-hidden="true" />Opening the workspace…</div></div>
        ) : !user ? (
          <AuthScreen />
        ) : user.role === "student" ? (
          <StudentShell />
        ) : (
          <StaffShell />
        )}
      </Ctx.Provider>
    </ToastProvider>
  );
}

/** Every failed write, wherever it started, is reported once as a toast so nothing fails silently. */
function StoreErrorToasts() {
  const toast = useToast();
  useEffect(() => store.onError((m) => toast(m, "bad")), [toast]);
  return null;
}

// ---------- shared chrome ----------

/** Logo plus the product name on one line. The name never wraps; it scales down on narrow screens instead. */
export function Wordmark({ size = "md", sub = true, stacked = false }: { size?: "sm" | "md" | "lg"; sub?: boolean; stacked?: boolean }) {
  const h = size === "lg" ? 44 : size === "sm" ? 30 : 36;
  return (
    <div className={`brand ${stacked ? "stacked" : ""}`}>
      <img src={BRAND_LOGO} alt={ORG_SHORT} style={{ height: h }} />
      {sub && <span className="brand-sub" aria-hidden="true">{PRODUCT}</span>}
    </div>
  );
}

export function Copyright({ className = "" }: { className?: string }) {
  return <span className={`ui xs muted ${className}`}>{COPYRIGHT}</span>;
}

export function LiveBadge() {
  const { snap } = useSession();
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((x) => x + 1), 5000); return () => window.clearInterval(t); }, []);
  const age = Math.round((Date.now() - Math.max(store.syncedAt, snap.syncedAt)) / 1000);
  const stale = (snap.backend === "shared" || snap.backend === "server") && age > 30;
  const label = snap.error ? "Sync error"
    : snap.backend === "server" ? "Live · server"
    : snap.backend === "shared" ? "Live · shared workspace"
    : snap.backend === "local" ? "Saved in this browser" : "Session only";
  const title = snap.backend === "server" ? "Records are held on the connected server. What you can see is decided there, not here."
    : snap.backend === "shared" ? "Every signed-in user reads and writes the same records."
    : snap.backend === "local" ? "Records are stored in this browser and shared across its open tabs."
    : "Storage is unavailable; records last for this session only.";
  return (
    <span className="live" title={title}>
      <span className={`dot ${snap.error || snap.backend === "memory" ? "bad" : stale ? "warn" : ""}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useSession();
  return (
    <button type="button" className="icon-btn" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light appearance" : "Switch to dark appearance"} aria-pressed={theme === "dark"} title="Appearance">
      {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </button>
  );
}

export function useDocumentTitle(t: string) {
  useEffect(() => { document.title = `${t} — ${ORG_SHORT}`; }, [t]);
}

/** Build version, injected by vite.config.ts from package.json. */
export const APP_VERSION: string = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "4.0.0";
declare const __APP_VERSION__: string | undefined;
