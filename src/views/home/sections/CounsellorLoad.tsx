/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { memo } from "react";
import { useSession } from "@/App";
import { ROLE_LABEL } from "@/lib/rbac";
import { Avatar, EmptyState, SeverityChip } from "@/lib/ui";
import { Bar } from "@/lib/charts";
import type { DashboardSummary } from "@/lib/summary";
import type { User } from "@/lib/types";

export const CounsellorLoad = memo(function CounsellorLoad({ counsellors, load }: { counsellors: User[]; load: DashboardSummary["counsellors"] }) {
  const { go, can } = useSession();
  if (counsellors.length === 0) return <EmptyState glyph="students" title="No counsellors yet" reason="Create counsellor profiles under Staff, then assign cases." action={can("staff.write") ? <button type="button" className="btn btn-primary btn-sm" onClick={() => go({ page: "staff" })}>Create a counsellor</button> : undefined} />;
  const byId = new Map(load.map((x) => [x.id, x]));
  const max = Math.max(1, ...counsellors.map((u) => byId.get(u.id)?.open ?? 0));
  return (
    <ul className="load" aria-label="Counsellor caseload">
      {counsellors.map((u) => {
        const x = byId.get(u.id);
        const mine = { length: x?.open ?? 0 };
        const gates = x?.gates ?? 0;
        const docs = x?.docs ?? 0;
        const bad = x?.bad ?? 0;
        return (
          <li key={u.id} className="load-row">
            <Avatar name={u.name} size={32} />
            <span className="load-body">
              <span className="flex aic jcb g2"><span className="ui small strong truncate">{u.name}</span><span className="ui xs muted">{mine.length} open</span></span>
              <Bar pct={(mine.length / max) * 100} tone={bad ? "bad" : "ink"} thin label={`${u.name} load`} />
              <span className="flex g1 wrap load-chips">
                <span className="ui xs muted">{ROLE_LABEL[u.role]}{u.branch ? ` · ${u.branch}` : ""}</span>
                {gates ? <SeverityChip severity="info">{gates} gate{gates === 1 ? "" : "s"}</SeverityChip> : null}
                {docs ? <SeverityChip severity="info">{docs} doc{docs === 1 ? "" : "s"}</SeverityChip> : null}
                {bad ? <SeverityChip severity="bad">{bad} overdue</SeverityChip> : null}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
});
