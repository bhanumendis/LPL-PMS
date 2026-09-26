/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Tooltip } from "@/lib/ui";

export function NotificationBell({ unread, open, onToggle, buttonRef }: { unread: number; open: boolean; onToggle: () => void; buttonRef: React.RefObject<HTMLButtonElement> }) {
  const [announce, setAnnounce] = useState("");
  const prev = useRef(unread);
  useEffect(() => {
    if (unread > prev.current && !open) setAnnounce(`${unread - prev.current} new notification${unread - prev.current === 1 ? "" : "s"}`);
    prev.current = unread;
  }, [unread, open]);
  const label = unread ? `Notifications, ${unread} unread` : "Notifications";
  return (
    <>
      <Tooltip label="Notifications">
        <button ref={buttonRef} type="button" className={`icon-btn bell ${unread ? "has-unread" : ""}`} aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={onToggle}>
          <Bell aria-hidden />
          {unread > 0 && <span className="bell-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
        </button>
      </Tooltip>
      <span className="sr-only" role="status" aria-live="polite">{announce}</span>
    </>
  );
}
