/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Dialog. The frame is capped at 90% of the viewport height and only the body scrolls, so a
 * long form (Create student, Create profile) is always completable: the header stays put and
 * the `.modal-f` action row sticks to the bottom of the scroll area.
 *
 * Rendered through a portal on document.body so it is always centred on the viewport, never
 * on a transformed ancestor left behind by a page-entry animation. It leaves the way it came,
 * still showing what it showed (presence.ts).
 */
import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "./focus";
import { EXIT_MS, leavingAttrs, useLastOpen, usePresence } from "./presence";

export function Modal(props: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; width?: number; describedBy?: string; subtitle?: string }) {
  const { open, onClose } = props;
  const { title, children, width = 560, describedBy, subtitle } = useLastOpen(props, open);
  const { mounted, leaving } = usePresence(open, EXIT_MS.dialog);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subId = useId();
  useFocusTrap(ref, open, { onEscape: onClose, returnFocus: true });
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prevOverflow; };
  }, [open]);
  if (!mounted) return null;
  return createPortal(
    <div className={`modal-scrim${leaving ? " is-leaving" : ""}`} {...leavingAttrs(leaving)} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={describedBy ?? (subtitle ? subId : undefined)} className="modal" style={{ maxWidth: width }}>
        {/* A div, not <header>: portaled to <body>, a <header> would register as a second banner landmark. */}
        <div className="modal-h">
          <div style={{ minWidth: 0 }}>
            <h2 id={titleId} style={{ fontSize: 18 }}>{title}</h2>
            {subtitle && <p id={subId} className="ui xs muted mt1">{subtitle}</p>}
          </div>
          <button type="button" data-close onClick={onClose} aria-label="Close dialog" className="icon-btn"><X aria-hidden /></button>
        </div>
        <div className="modal-b">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
