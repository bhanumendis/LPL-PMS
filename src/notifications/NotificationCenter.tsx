/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * The notification center: anchored to the bell, grouped by day and case, with live reminders
 * from the caller's own service-level clocks.
 */
import { useEffect, useMemo, type RefObject } from "react";
import { ArrowRight, Settings2 } from "lucide-react";
import { useSession } from "@/App";
import { EmptyState, Layer, Notice, SegmentedSwitch, SeverityChip, Skeleton, Tooltip } from "@/lib/ui";
import { useRowSignals } from "@/lib/signals";
import { useCasePage } from "@/lib/useRead";
import { useNotifications, type NotificationFilter } from "./useNotifications";
import { dayBucket, deriveReminders } from "./reminders";
import { NotificationItem } from "./NotificationItem";
import type { NotificationRow } from "./types";

export function NotificationCenter({ open, onClose, anchorRef, onSettings, model }: { open: boolean; onClose: () => void; anchorRef: RefObject<HTMLButtonElement>; onSettings?: () => void; model: ReturnType<typeof useNotifications> }) {
  const { user, cases } = useSession();
  const { unread, latest, items, loading, hasMore, error, filter, setFilter, open: reload, loadMore, markRead, markAll } = model;
  // Reminders are the caller's own flagged open cases, read while the center is open.
  const mine = open && user && user.role !== "student";
  const due = useCasePage(mine ? { counsellor: user.id, status: ["open"], clock: "due", sort: "urgency" } : null, 50);
  const returned = useCasePage(mine ? { counsellor: user.id, gate: "returned" } : null, 50);
  const flaggedRows = useMemo(() => {
    const byId = new Map([...due.rows, ...returned.rows].map((r) => [r.id, r]));
    return [...byId.values()];
  }, [due.rows, returned.rows]);
  const signals = useRowSignals(flaggedRows);
  const reminders = useMemo(() => (user ? deriveReminders(signals.values(), user.id) : []), [signals, user]);

  // Load on open, on filter change, and when something new arrives while open.
  useEffect(() => { if (open && filter !== "reminders") void reload(); }, [open, filter, latest, reload]);

  if (!user) return null;

  const openRow = (n: NotificationRow) => {
    if (!n.readAt) void markRead([n.id]);
    onClose();
    if (n.link) window.location.hash = n.link;
  };

  const onKey = (e: React.KeyboardEvent) => {
    const buttons = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>("button[data-nid], button[data-rid]"));
    if (!buttons.length) return;
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === "ArrowDown") { e.preventDefault(); buttons[Math.min(buttons.length - 1, i + 1)].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); buttons[Math.max(0, i - 1)].focus(); }
    else if (e.key === "Home") { e.preventDefault(); buttons[0].focus(); }
    else if (e.key === "End") { e.preventDefault(); buttons[buttons.length - 1].focus(); }
    else if ((e.key === "r" || e.key === "R") && i >= 0) { const id = buttons[i].dataset.nid; if (id) { e.preventDefault(); void markRead([id]); } }
  };

  // Day → case → rows, in arrival order.
  const groups: { day: string; cases: { key: string; label: string; rows: NotificationRow[] }[] }[] = [];
  for (const n of items) {
    const day = dayBucket(n.at);
    let g = groups[groups.length - 1];
    if (!g || g.day !== day) { g = { day, cases: [] }; groups.push(g); }
    const key = n.groupKey ?? n.id;
    let cg = g.cases[g.cases.length - 1];
    if (!cg || cg.key !== key) {
      const c = n.caseId ? cases[n.caseId] : undefined;
      const label = n.caseRef ? `${n.caseRef}${c ? ` · ${c.student.name}` : ""}` : "";
      cg = { key, label, rows: [] };
      g.cases.push(cg);
    }
    cg.rows.push(n);
  }

  const tabs: { id: NotificationFilter; label: string; count?: number }[] = [
    { id: "all", label: "All" },
    { id: "unread", label: "Unread", count: unread || undefined },
    { id: "reminders", label: "Reminders", count: reminders.length || undefined },
  ];

  return (
    <Layer open={open} onClose={onClose} anchorRef={anchorRef} label="Notifications" width={420} className="ncenter">
      <div className="layer-h">
        <h2>Notifications</h2>
        <div className="flex aic g1">
          <button type="button" className="btn btn-ghost btn-sm" disabled={unread === 0} onClick={() => void markAll()}>Mark all as read</button>
          {onSettings && <Tooltip label="Notification settings"><button type="button" className="icon-btn sm" aria-label="Notification settings" onClick={onSettings}><Settings2 aria-hidden /></button></Tooltip>}
        </div>
      </div>
      <div className="ncenter-tabs">
        <SegmentedSwitch label="Show" size="sm" value={filter} onChange={setFilter} options={tabs} />
      </div>
      <div className="layer-b ncenter-list" onKeyDown={onKey}>
        {filter === "reminders" ? (
          reminders.length === 0
            ? <EmptyState compact glyph="clock" title="No deadlines in the next 21 days" reason="Reminders come from the three service-level clocks and returned gates on your open cases." />
            : (
              <ul role="list" aria-label="Reminders" className="rem-list">
                {reminders.map((r, i) => (
                  <li key={r.id} role="listitem">
                    <button type="button" className={`nitem rem sev-${r.severity}`} style={{ ["--i" as string]: Math.min(i, 8) }} data-rid={r.id} onClick={() => { onClose(); window.location.hash = r.link; }}>
                      <span className="nicon" aria-hidden="true"><ArrowRight /></span>
                      <span className="nbody">
                        <span className="ntitle">{r.label}</span>
                        <span className="nmeta">{r.caseRef} · {r.name}</span>
                      </span>
                      <SeverityChip severity={r.severity}>{r.days < 0 ? `${-r.days}d overdue` : r.days === 0 ? "Today" : `${r.days}d`}</SeverityChip>
                    </button>
                  </li>
                ))}
              </ul>
            )
        ) : (
          <>
            {error && <Notice tone="bad" role="alert">{error} <button type="button" className="btn btn-ghost btn-sm" onClick={() => void reload()}>Retry</button></Notice>}
            {loading && items.length === 0 && <div role="status" aria-busy="true" aria-label="Loading notifications"><Skeleton kind="row" /><Skeleton kind="row" /><Skeleton kind="row" /></div>}
            {!loading && !error && items.length === 0 && (
              filter === "unread"
                ? <EmptyState compact glyph="check" title="Nothing unread" reason="Everything that arrived has been seen." />
                : <EmptyState compact glyph="bell" title="You're all caught up" reason="Gate decisions, document reviews, assignments and reminders arrive here." />
            )}
            {groups.map((g) => (
              <section key={g.day} aria-label={g.day} className="ngroup-day">
                <p className="ngroup-day-h">{g.day}</p>
                {g.cases.map((cg) => (
                  <div key={cg.key} className="ngroup">
                    {cg.label && <p className="ngroup-head">{cg.label}</p>}
                    <ul role="list">
                      {cg.rows.map((n, i) => <NotificationItem key={n.id} n={n} role={user.role} index={i} onOpen={openRow} />)}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
            {hasMore && <button type="button" className="btn btn-secondary btn-sm btn-block mt2" onClick={() => void loadMore()} disabled={loading}>{loading ? "Loading…" : "Load more"}</button>}
          </>
        )}
      </div>
    </Layer>
  );
}
