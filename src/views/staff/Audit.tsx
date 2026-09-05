/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { useState } from "react";
import { Download, Search } from "lucide-react";
import { useSession } from "@/App";
import { fmtDateTime } from "@/lib/logic";
import { ROLE_LABEL } from "@/lib/rbac";
import { Empty, Panel } from "@/lib/ui";
import { HBars } from "@/lib/charts";

export function AuditPage() {
  const { snap, can } = useSession();
  const mayDownload = can("audit.download");
  const mayRead = can("audit.read");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const list = (mayRead ? snap.audit.entries : []).filter((e) => (!role || e.actorRole === role) && (!q || [e.actorName, e.action, e.target ?? "", e.detail ?? ""].join(" ").toLowerCase().includes(q.toLowerCase())));
  const counts = new Map<string, number>();
  list.forEach((e) => counts.set(e.actorName, (counts.get(e.actorName) ?? 0) + 1));
  const byActor = [...counts.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n).slice(0, 6);
  const exportCsv = () => {
    const rows = [["At", "Actor", "Role", "Action", "Target", "Detail"], ...list.map((e) => [e.at, e.actorName, e.actorRole, e.action, e.target ?? "", e.detail ?? ""])];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "lpl-audit-log.csv"; a.click();
  };
  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Audit log</h1><p>Account, assignment, permission and case actions across the organisation. The last 600 entries are retained.</p></div>
        {mayDownload && <div className="actions"><button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={list.length === 0}><Download aria-hidden />Export CSV</button></div>}
      </div>
      <div className="grid grid-3 stagger">
        <div className="span2 stack">
          <div className="panel" style={{ padding: 12 }}>
            <div className="grid" style={{ gridTemplateColumns: "1fr 200px", gap: 10 }}>
              <div className="input-wrap"><Search aria-hidden /><label htmlFor="audit-q" className="sr-only">Filter entries</label><input id="audit-q" type="search" className="input" placeholder="Filter by person, action or reference" value={q} onChange={(e) => setQ(e.target.value)} /></div>
              <div><label htmlFor="audit-role" className="sr-only">Role</label><select id="audit-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}><option value="">All roles</option>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            </div>
          </div>
          {list.length === 0 ? <Empty title="No entries" hint="Actions are recorded as staff and students use the system." /> : (
            <div className="panel table-wrap">
              <table className="tbl" style={{ minWidth: 720 }}>
                <thead><tr><th scope="col">When</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Target</th><th scope="col">Detail</th></tr></thead>
                <tbody>
                  {list.slice(0, 200).map((e) => (
                    <tr key={e.id}><td className="nowrap muted">{fmtDateTime(e.at)}</td><td><p className="primary">{e.actorName}</p><p className="sub">{ROLE_LABEL[e.actorRole]}</p></td><td>{e.action}</td><td>{e.target ?? "—"}</td><td className="muted">{e.detail ?? "—"}</td></tr>
                  ))}
                </tbody>
              </table>
              {list.length > 200 && <p className="xs muted" style={{ padding: "10px 16px" }}>Showing the most recent 200 of {list.length} matching entries.{mayDownload ? " Export CSV for the full list." : ""}</p>}
            </div>
          )}
        </div>
        <Panel title="Most active">
          {byActor.length === 0 ? <Empty title="No activity" /> : <HBars data={byActor} ariaLabel="Entries by person" tone={4} />}
        </Panel>
      </div>
    </div>
  );
}
