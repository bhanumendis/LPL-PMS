/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Compact student preview: enough to decide whether to open the workspace.
 * "Always available context, not always-visible complexity."
 */
import { ArrowRight, FileText, History } from "lucide-react";
import { STEP_BY_N } from "@/lib/spine";
import type { CaseRecord } from "@/lib/types";
import type { CaseSignals } from "@/lib/signals";
import { Ring } from "@/lib/charts";
import { relativeTime } from "@/notifications/reminders";

const CLOCKS: { id: string; label: string; match: (id: string) => boolean }[] = [
  { id: "cis", label: "Course Information Sheet", match: (id) => id === "cis" || id === "cis2" },
  { id: "offer", label: "Offer lapse", match: (id) => id === "offer" },
  { id: "followup", label: "Three-month follow-up", match: (id) => id === "followup" },
];

export function StudentPreview({ s, c, onOpenStep, onOpenDocuments, onOpenTimeline }: { s: CaseSignals; c: CaseRecord; onOpenStep: () => void; onOpenDocuments: () => void; onOpenTimeline: () => void }) {
  const cur = s.currentStep;
  const gate = s.gateReturned ? `Gate ${s.gateReturned} returned` : s.gatePending ? `Gate ${s.gatePending} awaiting Team Leader` : "No gate open";
  return (
    <div className="preview">
      <div className="preview-head">
        <Ring pct={s.progress.pct} size={56} stroke={6} small label="Completion" tone={s.status === "completed" ? "ok" : ""} />
        <div style={{ minWidth: 0 }}>
          <p className="ui strong truncate">Stage {s.stage.n} of 9 · {s.stage.name}</p>
          <p className="xs muted truncate">{cur ? `Step ${cur}. ${STEP_BY_N[cur].title}` : "All steps complete"} · {s.progress.done} of {s.progress.applicable} steps</p>
        </div>
      </div>
      <ul className="preview-clocks" aria-label="Service-level clocks">
        {CLOCKS.map((k) => {
          const f = s.flags.find((x) => k.match(x.id));
          const tone = !f ? "" : f.state === "breached" ? "bad" : f.state === "due-soon" ? "warn" : "";
          return (
            <li key={k.id} className={`preview-clock ${tone}`}>
              <span>{k.label}</span>
              <span className="v">{!f ? "Not running" : f.days < 0 ? `${-f.days}d overdue` : f.days === 0 ? "Due today" : `${f.days}d left`}</span>
            </li>
          );
        })}
      </ul>
      <dl className="preview-facts">
        <div><dt>Documents</dt><dd>{s.docsToReview ? `${s.docsToReview} awaiting review` : "Nothing to review"}</dd></div>
        <div><dt>Gate</dt><dd>{gate}</dd></div>
        {s.profileSubmitted && <div><dt>Profile</dt><dd>Submitted, awaiting your confirmation</dd></div>}
      </dl>
      {c.events.length > 0 && (
        <ul className="preview-events" aria-label="Recent activity">
          {c.events.slice(0, 3).map((e) => <li key={e.id}><span className="truncate" style={{ display: "block" }}>{e.text}</span><span className="xs muted">{relativeTime(e.at)} · {e.byName}</span></li>)}
        </ul>
      )}
      <div className="preview-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onOpenStep}>{cur ? "Open current step" : "Open workspace"} <ArrowRight aria-hidden /></button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenDocuments}><FileText aria-hidden />Documents</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenTimeline}><History aria-hidden />Timeline</button>
      </div>
    </div>
  );
}
