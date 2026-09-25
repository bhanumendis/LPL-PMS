/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * The utility bar: brand and context on the left, the dock in the centre, account tools on
 * the right. Transparent over the page until scrolled, then glass.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useSession, Wordmark } from "@/App";
import type { Badges } from "@/lib/signals";
import { Dock } from "./Dock";
import { ProfileMenu } from "./ProfileMenu";
import type { DestId, Destination } from "./nav";

export interface TopBarProps {
  primary: Destination[];
  more: Destination | null;
  activeId?: DestId;
  activePage: string;
  badges: Badges;
  compact: boolean;
  /** Under 1024 px the dock leaves the bar for the tab bar. */
  hideDock: boolean;
  onNavigate: (page: string) => void;
  /** Utilities rendered before the profile menu (search, bell, rail toggle). */
  tools?: ReactNode;
  profileExtra?: ReactNode;
}

export function TopBar({ primary, more, activeId, activePage, badges, compact, hideDock, onNavigate, tools, profileExtra }: TopBarProps) {
  const { route, go, cases } = useSession();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 8);
    h();
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);
  const c = route.page === "case" && route.caseId ? cases[route.caseId] : undefined;
  return (
    <header className={`topbar ${scrolled ? "scrolled" : ""} ${hideDock ? "no-dock" : ""}`}>
      <div className="topbar-l">
        <Wordmark size="sm" sub={!compact} />
        {c && (
          <button type="button" className="ctx-chip" onClick={() => go({ page: "cases" })} aria-label={`Back to cases, viewing ${c.ref}`}>
            <ArrowLeft aria-hidden /><span className="truncate">{c.ref}</span>
          </button>
        )}
      </div>
      <div className="topbar-c">
        {!hideDock && <Dock items={primary} more={more} activeId={activeId} activePage={activePage} onNavigate={onNavigate} badges={badges} compact={compact} />}
      </div>
      <div className="topbar-r">
        {tools}
        <ProfileMenu extra={profileExtra} />
      </div>
    </header>
  );
}
