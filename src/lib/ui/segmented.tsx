/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import React, { useRef } from "react";

export function SegmentedSwitch<T extends string>({ options, value, onChange, label, size = "md", className = "" }: { options: { id: T; label: React.ReactNode; count?: number; icon?: React.ReactNode }[]; value: T; onChange: (v: T) => void; label: string; size?: "sm" | "md"; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = options.length; let j = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + n) % n;
    else if (e.key === "Home") j = 0; else if (e.key === "End") j = n - 1; else return;
    e.preventDefault(); onChange(options[j].id); refs.current[j]?.focus();
  };
  return (
    <div className={`segmented ${size} ${className}`} role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button key={o.id} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={value === o.id} tabIndex={value === o.id ? 0 : -1} className="seg-opt" onClick={() => onChange(o.id)} onKeyDown={(e) => onKey(e, i)}>
          {o.icon}{o.label}{o.count ? <span className="count" aria-label={`${o.count} items`}>{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
