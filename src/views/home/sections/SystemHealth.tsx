/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { useEffect, useState } from "react";
import { useSession, APP_VERSION } from "@/App";
import { store } from "@/lib/store";

export function SystemHealth() {
  const { snap, users, go, can } = useSession();
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((x) => x + 1), 5000); return () => window.clearInterval(t); }, []);
  const age = Math.round((Date.now() - Math.max(store.syncedAt, snap.syncedAt)) / 1000);
  const staff = Object.values(users).filter((u) => u.role !== "student");
  const students = Object.values(users).filter((u) => u.role === "student");
  const backend = snap.error ? "Sync error" : snap.backend === "server" ? "Connected server" : snap.backend === "shared" ? "Shared workspace" : snap.backend === "local" ? "This browser" : "Session only";
  const rows: { k: string; v: string; tone?: "bad" | "warn" }[] = [
    { k: "Records", v: backend, tone: snap.error ? "bad" : snap.backend === "memory" ? "warn" : undefined },
    { k: "Last sync", v: age < 5 ? "just now" : age < 60 ? `${age}s ago` : `${Math.round(age / 60)} min ago`, tone: (snap.backend === "server" || snap.backend === "shared") && age > 30 ? "warn" : undefined },
    { k: "Staff", v: `${staff.filter((u) => u.active).length} active${staff.some((u) => !u.active) ? ` · ${staff.filter((u) => !u.active).length} deactivated` : ""}` },
    { k: "Students", v: `${students.filter((u) => u.active).length} with sign-ins` },
    { k: "Version", v: `v${APP_VERSION}` },
  ];
  return (
    <dl className="health">
      {rows.map((r) => <div key={r.k} className={`health-row ${r.tone ?? ""}`}><dt>{r.k}</dt><dd>{r.v}</dd></div>)}
      {can("settings.view") && <div className="health-row"><dt /><dd><button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ page: "settings" })}>Settings</button></dd></div>}
    </dl>
  );
}
