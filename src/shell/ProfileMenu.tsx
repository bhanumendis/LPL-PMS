/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { useRef, useState } from "react";
import { LogOut, Moon, Sun } from "lucide-react";
import { useSession, LiveBadge, APP_VERSION } from "@/App";
import { ROLE_LABEL } from "@/lib/rbac";
import { COPYRIGHT } from "@/lib/brand";
import { Avatar, Layer, SegmentedSwitch } from "@/lib/ui";

export function ProfileMenu({ extra }: { extra?: React.ReactNode }) {
  const { user, signOut, theme, toggleTheme, snap } = useSession();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  if (!user) return null;
  return (
    <>
      <button ref={ref} type="button" className="avatar-btn" aria-label={`Account: ${user.name}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Avatar name={user.name} size={34} tone="ink" />
      </button>
      <Layer open={open} onClose={() => setOpen(false)} anchorRef={ref} label="Account" width={300} className="menu-layer">
        <div className="menu-head">
          <Avatar name={user.name} size={40} tone="ink" />
          <div style={{ minWidth: 0 }}>
            <p className="ui strong truncate">{user.name}</p>
            <p className="ui xs muted truncate">{ROLE_LABEL[user.role]}{user.branch ? ` · ${user.branch}` : ""}</p>
          </div>
        </div>
        <div className="menu-sec">
          <LiveBadge />
          <p className="xs muted mt1">{snap.org.config.orgName}</p>
        </div>
        <div className="menu-sec">
          <span className="ui xs muted" style={{ display: "block", marginBottom: 6 }}>Appearance</span>
          <SegmentedSwitch label="Appearance" size="sm" value={theme} onChange={(v) => { if (v !== theme) toggleTheme(); }} options={[{ id: "light", label: "Light", icon: <Sun aria-hidden /> }, { id: "dark", label: "Dark", icon: <Moon aria-hidden /> }]} />
        </div>
        {extra && <div className="menu-sec">{extra}</div>}
        <div className="menu-sec">
          <button type="button" className="menu-item" onClick={() => { setOpen(false); signOut(); }}><LogOut aria-hidden />Sign out</button>
        </div>
        <p className="ui xs muted menu-foot">{COPYRIGHT} · v{APP_VERSION}</p>
      </Layer>
    </>
  );
}
