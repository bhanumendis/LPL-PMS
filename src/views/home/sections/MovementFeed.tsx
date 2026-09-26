/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * What moved recently: case events (or audit rows on the administrator's home).
 */
import { memo } from "react";
import { useSession } from "@/App";
import { EmptyState } from "@/lib/ui";
import { relativeTime } from "@/notifications/reminders";

export interface Movement { id: string; at: string; text: string; by: string; caseId?: string; caseRef?: string }

export const MovementFeed = memo(function MovementFeed({ items, limit = 8, emptyReason = "Activity on cases appears here as it happens." }: { items: Movement[]; limit?: number; emptyReason?: string }) {
  const { go } = useSession();
  if (items.length === 0) return <EmptyState compact glyph="clock" title="No recent activity" reason={emptyReason} />;
  return (
    <ol className="movement" aria-label="Recent activity">
      {items.slice(0, limit).map((m) => (
        <li key={m.id} className="movement-row">
          <span className="movement-dot" aria-hidden="true" />
          <span className="movement-body">
            <span className="small" style={{ display: "block" }}>{m.text}</span>
            <span className="ui xs muted">
              {m.caseId && m.caseRef ? <><button type="button" className="row-btn xs" onClick={() => go({ page: "case", caseId: m.caseId })}>{m.caseRef}</button> · </> : null}
              {relativeTime(m.at)} · {m.by}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
});
