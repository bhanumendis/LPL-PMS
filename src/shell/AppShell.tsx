/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * One shell for every role: the utility bar with the floating dock, the routed page, the
 * counsellor rail (Stage 5), the mobile tab bar, and the layers (notification center,
 * command palette) mounted above the page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogOut, Moon, Sun } from "lucide-react";
import { useSession, useDocumentTitle } from "@/App";
import { caseScopeOf } from "@/lib/rbac";
import { BP, useMediaQuery } from "@/lib/hooks";
import { badgesOf } from "@/lib/signals";
import { useCaseCount, useDashboard } from "@/lib/useRead";
import { RegionBoundary } from "@/lib/ui/boundary";
import { activeDestination, destinationsFor, moreDestination, pageTitle, type NavInput } from "./nav";
import { TopBar } from "./TopBar";
import { MobileTabBar } from "./MobileTabBar";
import { renderPage } from "./pages";
import { SectionNav } from "./SectionNav";
import { buildCommands } from "./commands";
import { CommandPalette, SearchButton } from "./CommandPalette";
import { NotificationBell } from "@/notifications/NotificationBell";
import { NotificationCenter } from "@/notifications/NotificationCenter";
import { NotificationSettings } from "@/notifications/settings";
import { useNotifications } from "@/notifications/useNotifications";
import { Layer } from "@/lib/ui";
import { BellRing, Users } from "lucide-react";
import { useLocalPref } from "@/lib/hooks";
import { StudentRail, railEnabled, type RailMode } from "./rail/StudentRail";

export function AppShell() {
  const s = useSession();
  const { user, route, go, can, isSuperAdmin, snap, signOut, theme, toggleTheme } = s;
  const role = user?.role ?? "student";
  const scope = user ? caseScopeOf(snap.org.config, user.role) : "none";
  const seesAll = scope === "all";
  const navInput = useMemo<NavInput>(() => ({ role, can, isSuperAdmin, seesAll, noCases: scope === "none" }), [role, can, isSuperAdmin, seesAll, scope]);
  const { primary, more } = useMemo(() => destinationsFor(navInput), [navInput]);
  const moreDest = useMemo(() => moreDestination(more), [more]);
  const page = route.page === "home" ? "" : route.page;
  // First visit per page (per browser) keeps the entry cascade; the answer is fixed when the page is entered.
  const pageKey = page || "home";
  const [visited, setVisited] = useLocalPref<string[]>("lpl:pms:visited", []);
  const [entry, setEntry] = useState(() => ({ key: pageKey, seen: visited.includes(pageKey) }));
  if (entry.key !== pageKey) setEntry({ key: pageKey, seen: visited.includes(pageKey) });
  const seenPage = entry.key === pageKey ? entry.seen : visited.includes(pageKey);
  useEffect(() => { if (!visited.includes(pageKey)) setVisited((v) => (v.includes(pageKey) ? v : [...v, pageKey])); }, [pageKey, visited, setVisited]);
  const activeId = activeDestination(page, primary) ?? (moreDest && moreDest.pages.includes(page) ? "more" : undefined);
  const activeDest = primary.find((d) => d.id === activeId);
  // Badges come from the dashboard: every case for a role that sees them all (one shared,
  // cached answer on a server), otherwise the caller's own caseload.
  const dashboard = useDashboard(!!user && user.role !== "student" && scope !== "none");
  const badges = useMemo(() => badgesOf(dashboard.data), [dashboard.data]);
  useDocumentTitle(pageTitle(page, navInput));

  const compact = useMediaQuery(BP.compact);
  const tablet = useMediaQuery(BP.tablet);
  const mobile = useMediaQuery(BP.mobile);
  const navigate = useCallback((p: string) => go({ page: p }), [go]);

  // Counsellor rail: a minimised strip on the left that slides the quick view open; a sheet on phones.
  const railOn = railEnabled(snap.org.config, user);
  const [railOpen, setRailOpen] = useState(false);
  const railMode: RailMode = mobile ? "sheet" : "strip";
  const attention = useCaseCount(railOn && user ? { counsellor: user.id, status: ["open"], attention: true } : null, 100);
  const attentionCount = attention.data ?? 0;

  const [paletteOpen, setPaletteOpen] = useState(false);
  const searchRef = useRef<HTMLButtonElement>(null);
  const commands = useMemo(() => buildCommands(s, primary, moreDest), [s, primary, moreDest]);
  const notifications = useNotifications();
  const [centerOpen, setCenterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);

  // Alt+1…9 jumps to the nth destination; Ctrl/⌘+K opens search.
  useEffect(() => {
    const list = moreDest ? [...primary, moreDest] : primary;
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); return; }
      if (!e.altKey || e.ctrlKey || e.metaKey || !/^[1-9]$/.test(e.key)) return;
      const d = list[Number(e.key) - 1];
      if (!d || d.id === "more") return;
      e.preventDefault();
      go({ page: d.page });
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [primary, moreDest, go]);

  if (!user) return null;

  const tools = (
    <>
      <SearchButton onOpen={() => setPaletteOpen(true)} buttonRef={searchRef} />
      <NotificationBell unread={notifications.unread} open={centerOpen} onToggle={() => setCenterOpen((o) => !o)} buttonRef={bellRef} />
    </>
  );
  const studentsTab = railOn && mobile ? (
    <button type="button" className="tab-item" onClick={() => setRailOpen(true)} aria-haspopup="dialog" aria-expanded={railOpen} aria-label={attentionCount ? `Students, ${attentionCount} needing attention` : "Students"}>
      <Users aria-hidden /><span>Students</span>{attentionCount ? <span className="badge" aria-hidden="true">{attentionCount}</span> : null}
    </button>
  ) : undefined;

  const moreExtra = (
    <>
      <button type="button" className="menu-item" onClick={toggleTheme}>{theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}{theme === "dark" ? "Light appearance" : "Dark appearance"}</button>
      <button type="button" className="menu-item" onClick={signOut}><LogOut aria-hidden />Sign out</button>
    </>
  );

  return (
    <div className="app">
      <TopBar primary={primary} more={moreDest} activeId={activeId} activePage={page} badges={badges} compact={compact} hideDock={tablet} onNavigate={navigate} tools={tools}
        profileExtra={<button type="button" className="menu-item" onClick={() => setSettingsOpen(true)}><BellRing aria-hidden />Notification settings</button>} />
      <div className={`frame ${railOn && !mobile ? "has-rail" : ""}`}>
        <main className="page" id="main" tabIndex={-1}>
          {activeDest && <SectionNav dest={activeDest} activePage={page} onNavigate={navigate} />}
          <RegionBoundary label="page">
            <div key={page + (route.caseId ?? "")} className={`page-enter ${seenPage ? "seen" : ""}`}>{renderPage(route, s)}</div>
          </RegionBoundary>
        </main>
        {railOn && (
          <RegionBoundary label="student rail" compact>
            <StudentRail mode={railMode} open={railOpen} onOpenChange={setRailOpen} />
          </RegionBoundary>
        )}
      </div>
      {tablet && <MobileTabBar primary={primary} more={moreDest} activeId={activeId} activePage={page} badges={badges} onNavigate={navigate} moreExtra={moreExtra} extraTab={studentsTab} />}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} anchorRef={searchRef}
        searchCases={role !== "student" && scope !== "none"} onOpenCase={(caseId) => go({ page: "case", caseId })} />
      <NotificationCenter open={centerOpen} onClose={() => setCenterOpen(false)} anchorRef={bellRef} model={notifications} onSettings={() => { setCenterOpen(false); setSettingsOpen(true); }} />
      <Layer open={settingsOpen} onClose={() => setSettingsOpen(false)} anchorRef={bellRef} label="Notification settings" width={440}>
        <div className="layer-h"><h2>Notification settings</h2></div>
        <div className="layer-b" style={{ padding: 14 }}><NotificationSettings /></div>
      </Layer>
    </div>
  );
}
