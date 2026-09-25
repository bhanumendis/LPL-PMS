/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { memo } from "react";
import { AlarmClock, Check, FileText, Flag, Info, KeyRound, ShieldCheck, UserRound, UserRoundPlus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "@/lib/types";
import type { NotificationRow, NotificationType } from "./types";
import { displayTitle, relativeTime } from "./reminders";

const ICON: Record<NotificationType, LucideIcon> = {
  gate_submitted: ShieldCheck, gate_decided: ShieldCheck, document_uploaded: FileText, document_reviewed: FileText, profile_submitted: UserRound,
  step_completed: Check, case_assigned: UserRoundPlus, status_changed: Flag, sla_due: AlarmClock, sla_breached: AlarmClock, account: KeyRound, system: Info,
};

export const NotificationItem = memo(function NotificationItem({ n, role, index, onOpen }: { n: NotificationRow; role: Role; index: number; onOpen: (n: NotificationRow) => void }) {
  const Icon = ICON[n.type] ?? Info;
  const unread = !n.readAt;
  return (
    <li role="listitem">
      <button type="button" className={`nitem ${unread ? "unread" : ""} pri-${n.priority}`} style={{ ["--i" as string]: Math.min(index, 8) }} data-nid={n.id} onClick={() => onOpen(n)} aria-label={`${displayTitle(n, role)}, ${relativeTime(n.at)}${unread ? ", unread" : ""}`}>
        <span className="nicon" aria-hidden="true"><Icon /></span>
        <span className="nbody">
          <span className="ntitle">{displayTitle(n, role)}</span>
          {n.body && n.type !== "document_uploaded" && n.type !== "document_reviewed" && <span className="ntext">{n.body}</span>}
          <span className="nmeta">{relativeTime(n.at)}{n.step ? ` · step ${n.step}` : ""}</span>
        </span>
        {unread && <span className="ndot" aria-hidden="true" />}
      </button>
    </li>
  );
});
