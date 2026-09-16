/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Core primitives: tones, pills, notices, panels, page headers, avatars, tabs, switch, fields.
 */
import React, { useEffect, useId, useRef, useState } from "react";
import { Check, AlertCircle, Info, AlertTriangle, CircleCheck, ShieldAlert } from "lucide-react";
import type { FieldDef } from "../spine";

// ---------- tones ----------

export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "navy" | "gold";

export function statusTone(s: string): Tone {
  switch (s) {
    case "open": return "info";
    case "hold": return "warn";
    case "deferred": return "gold";
    case "exited": return "bad";
    case "completed": return "ok";
    case "accepted": case "approved": case "done": return "ok";
    case "rejected": case "returned": case "breached": return "bad";
    case "uploaded": case "pending": case "due-soon": return "warn";
    default: return "neutral";
  }
}
export const STATUS_LABEL: Record<string, string> = { open: "Open", hold: "On hold", deferred: "Deferred", exited: "Exited", completed: "Completed" };

export function Pill({ tone = "neutral", children, className = "", icon }: { tone?: Tone; children: React.ReactNode; className?: string; icon?: React.ReactNode }) {
  return <span className={`pill pill-${tone} ${className}`}>{icon}{children}</span>;
}

export const toneIcon: Record<Tone, React.ReactNode> = {
  neutral: <Info aria-hidden />, ok: <CircleCheck aria-hidden />, warn: <AlertTriangle aria-hidden />, bad: <AlertCircle aria-hidden />, info: <Info aria-hidden />, navy: <Info aria-hidden />, gold: <ShieldAlert aria-hidden />,
};

export function Notice({ tone = "info", children, role }: { tone?: Tone; children: React.ReactNode; role?: "alert" | "status" }) {
  return <div className={`notice notice-${tone}`} role={role}>{toneIcon[tone]}<div>{children}</div></div>;
}

// ---------- layout ----------

export function Panel({ title, action, children, className = "", flush = false, id }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean; id?: string }) {
  const hid = useId();
  return (
    <section className={`panel ${className}`} aria-labelledby={title ? hid : undefined} id={id}>
      {(title || action) && (
        <header className="panel-h">
          {title ? <h2 id={hid}>{title}</h2> : <span />}
          {action}
        </header>
      )}
      <div className={`panel-b ${flush ? "flush" : ""}`}>{children}</div>
    </section>
  );
}

/** One quiet row of list filters on the second surface tier. */
export function FilterBar({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`filter-bar surface-2 ${className}`} role="search" aria-label={label}>{children}</div>;
}

/** Page title row: title, one line of context, actions on the right. */
export function PageHeader({ title, context, actions, children, className = "" }: { title: React.ReactNode; context?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={`page-head ${className}`}>
      <div className="grow" style={{ minWidth: 0 }}>
        <h1>{title}</h1>
        {context && <p>{context}</p>}
        {children}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

/** Animated number for numeric values; passes other content through. Respects reduced motion. */
export function CountUp({ value }: { value: React.ReactNode }) {
  const isNum = typeof value === "number";
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!isNum) return;
    const target = value as number;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || target === 0) { setN(target); return; }
    const start = performance.now(); const dur = 700;
    let raf = 0;
    const tick = (t: number) => { const p = Math.min(1, (t - start) / dur); const e = 1 - Math.pow(1 - p, 3); setN(Math.round(target * e)); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, isNum]);
  return <>{isNum ? n : value}</>;
}

const AV_COLORS = ["", "blue", "green", "amber", "rose", "cyan"];
export function Avatar({ name, size = 32, tone }: { name: string; size?: number; tone?: "ink" | "blue" | "green" | "orange" }) {
  const ini = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";
  const h = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const cls = tone === "ink" ? "ink" : tone === "blue" ? "blue" : tone === "green" ? "green" : tone === "orange" ? "" : AV_COLORS[h % AV_COLORS.length];
  return <span className={`avatar ${cls}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }} aria-hidden="true">{ini}</span>;
}

// ---------- tabs ----------

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: React.ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = tabs.length; let j = i;
    if (e.key === "ArrowRight") j = (i + 1) % n; else if (e.key === "ArrowLeft") j = (i - 1 + n) % n; else if (e.key === "Home") j = 0; else if (e.key === "End") j = n - 1; else return;
    e.preventDefault(); onChange(tabs[j].id); refs.current[j]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button key={t.id} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" id={`tab-${t.id}`} aria-selected={value === t.id} aria-controls={`panel-${t.id}`} tabIndex={value === t.id ? 0 : -1} className="tab" onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>
          {t.label}{t.count ? <span className="count" aria-label={`${t.count} items`}>{t.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
export function TabPanel({ id, active, children }: { id: string; active: boolean; children: React.ReactNode }) {
  if (!active) return null;
  return <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="fade-in">{children}</div>;
}

/**
 * Switch. `locked` renders a read-only switch at full strength (its state is information, not an
 * inactive control) and announces it as aria-disabled; `disabled` is for genuinely inactive controls.
 */
export function Switch({ checked, onChange, disabled, locked, label }: { checked: boolean; onChange: () => void; disabled?: boolean; locked?: boolean; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} aria-disabled={locked || undefined} disabled={disabled} onClick={locked ? undefined : onChange} className={`switch ${locked ? "locked" : ""}`} />;
}

// ---------- form fields ----------

export function Label({ children, required, hint, htmlFor, id, hintId }: { children: React.ReactNode; required?: boolean; hint?: string; htmlFor?: string; id?: string; hintId?: string }) {
  const inner = <>{children}{required && <span className="req" aria-hidden="true">*</span>}{required && <span className="sr-only"> (required)</span>}</>;
  return (
    <>
      {htmlFor ? <label htmlFor={htmlFor} className="label" id={id}>{inner}</label> : <span className="label" id={id}>{inner}</span>}
      {hint && <span className="hint" id={hintId ?? (htmlFor ? `${htmlFor}-hint` : undefined)}>{hint}</span>}
    </>
  );
}

export function Field({ label, children, required, hint, htmlFor, full, error }: { label: string; children: React.ReactNode; required?: boolean; hint?: string; htmlFor?: string; full?: boolean; error?: string }) {
  return (
    <div className={`field ${full ? "full" : ""}`}>
      <Label htmlFor={htmlFor} required={required} hint={hint}>{label}</Label>
      {children}
      {error && <span className="error-text" role="alert"><AlertCircle aria-hidden />{error}</span>}
    </div>
  );
}

export function isVisible(f: FieldDef, values: Record<string, unknown>): boolean {
  if (!f.showIf) return true;
  return values[f.showIf.field] === f.showIf.equals;
}

export function missingRequired(fields: FieldDef[], values: Record<string, unknown>, filter?: (f: FieldDef) => boolean): string[] {
  return fields.filter((f) => f.required && isVisible(f, values) && (!filter || filter(f))).filter((f) => {
    const v = values[f.id];
    if (f.type === "checkbox") return false;
    if (Array.isArray(v)) return v.length === 0;
    return v === undefined || v === null || v === "";
  }).map((f) => f.label);
}

export function FieldInput({ f, value, onChange, disabled, masked, invalid, idPrefix = "f" }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; masked?: boolean; invalid?: boolean; idPrefix?: string }) {
  const id = `${idPrefix}_${f.id}`;
  const full = f.full || f.type === "textarea";
  if (masked) return <div className={`field ${full ? "full" : ""}`}><Label htmlFor={id} required={f.required}>{f.label}</Label><div className="restricted" id={id}><ShieldAlert aria-hidden style={{ width: 15, height: 15 }} />Restricted to authorised staff</div></div>;
  const describedBy = f.hint ? `${id}-hint` : undefined;
  const common = { id, disabled, className: "input", "aria-invalid": invalid || undefined, "aria-describedby": describedBy, "aria-required": f.required || undefined };
  switch (f.type) {
    case "textarea":
      return <div className="field full"><Label htmlFor={id} required={f.required} hint={f.hint}>{f.label}</Label><textarea {...common} rows={3} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} /></div>;
    case "select":
      return (
        <div className={`field ${full ? "full" : ""}`}><Label htmlFor={id} required={f.required} hint={f.hint}>{f.label}</Label>
          <select {...common} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)}>
            <option value="">Select…</option>
            {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      );
    case "yesno":
      return (
        <div className={`field ${full ? "full" : ""}`}><Label id={`${id}-l`} required={f.required} hint={f.hint} hintId={`${id}-hint`}>{f.label}</Label>
          <div className="choice" role="radiogroup" aria-labelledby={`${id}-l`} aria-describedby={describedBy} aria-required={f.required || undefined} aria-invalid={invalid || undefined}>
            {["Yes", "No"].map((o) => (
              <button key={o} type="button" role="radio" aria-checked={value === o} disabled={disabled} onClick={() => onChange(o)} className="chip grow">{value === o && <Check aria-hidden style={{ width: 14, height: 14 }} />}{o}</button>
            ))}
          </div>
        </div>
      );
    case "checkbox":
      return (
        <label className={`check ${full ? "full" : ""}`} htmlFor={id}>
          <input id={id} type="checkbox" disabled={disabled} checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          <span>{f.label}</span>
        </label>
      );
    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="field full"><Label id={`${id}-l`} required={f.required} hint={f.hint} hintId={`${id}-hint`}>{f.label}</Label>
          <div className="choice" role="group" aria-labelledby={`${id}-l`} aria-describedby={describedBy} aria-invalid={invalid || undefined}>
            {f.options?.map((o) => {
              const on = arr.includes(o);
              return <button key={o} type="button" aria-pressed={on} disabled={disabled} onClick={() => onChange(on ? arr.filter((x) => x !== o) : [...arr, o])} className="chip">{on && <Check aria-hidden style={{ width: 14, height: 14 }} />}{o}</button>;
            })}
          </div>
        </div>
      );
    }
    case "date":
      return <div className="field"><Label htmlFor={id} required={f.required} hint={f.hint}>{f.label}</Label><input {...common} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} /></div>;
    case "month":
      return <div className="field"><Label htmlFor={id} required={f.required} hint={f.hint}>{f.label}</Label><input {...common} type="month" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} /></div>;
    case "number":
      return <div className="field"><Label htmlFor={id} required={f.required} hint={f.hint}>{f.label}</Label><input {...common} type="number" inputMode="decimal" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} /></div>;
    default:
      return <div className={`field ${full ? "full" : ""}`}><Label htmlFor={id} required={f.required} hint={f.hint}>{f.label}</Label><input {...common} type="text" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} /></div>;
  }
}

export function fmtValue(f: FieldDef, value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (f.type === "checkbox") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (f.type === "date") { const d = new Date(String(value)); return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  if (f.type === "month") { const [y, m] = String(value).split("-"); if (y && m) return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" }); }
  return String(value);
}

export function ValueDisplay({ f, value }: { f: FieldDef; value: unknown }) {
  const full = f.full || f.type === "textarea";
  return (
    <div className={`field ${full ? "full" : ""}`} style={{ gap: 2 }}>
      <span className="label" style={{ color: "var(--muted)", fontWeight: 500, fontSize: 12.5 }}>{f.label}</span>
      <span className="ui" style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{fmtValue(f, value)}</span>
    </div>
  );
}

/** A native input with a proper label, for the auth and admin forms. */
export function TextField({ label, value, onChange, type = "text", required, autoComplete, hint, placeholder, full, inputMode, error, maxLength }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean; autoComplete?: string; hint?: string; placeholder?: string; full?: boolean; inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; error?: string; maxLength?: number }) {
  const id = useId();
  return (
    <Field label={label} required={required} htmlFor={id} hint={hint} full={full} error={error}>
      <input id={id} className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} aria-required={required || undefined} autoComplete={autoComplete} placeholder={placeholder} inputMode={inputMode} aria-invalid={error ? true : undefined} aria-describedby={hint ? `${id}-hint` : undefined} maxLength={maxLength} />
    </Field>
  );
}

export function SelectField({ label, value, onChange, options, required, placeholder = "Select…", full, hint }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] | string[]; required?: boolean; placeholder?: string; full?: boolean; hint?: string }) {
  const id = useId();
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <Field label={label} required={required} htmlFor={id} full={full} hint={hint}>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} required={required} aria-required={required || undefined} aria-describedby={hint ? `${id}-hint` : undefined}>
        <option value="">{placeholder}</option>
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function TextArea({ label, value, onChange, rows = 3, required, hint, full = true, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; required?: boolean; hint?: string; full?: boolean; placeholder?: string }) {
  const id = useId();
  return (
    <Field label={label} required={required} htmlFor={id} full={full} hint={hint}>
      <textarea id={id} className="input" rows={rows} value={value} onChange={(e) => onChange(e.target.value)} required={required} aria-required={required || undefined} placeholder={placeholder} aria-describedby={hint ? `${id}-hint` : undefined} />
    </Field>
  );
}
