/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Lightweight chart components. All charts expose an accessible name and the underlying
 * numbers as text so nothing depends on colour alone.
 */
import React, { useEffect, useId, useRef, useState } from "react";

/** Series colours: royal, navy/sky, green, ink, red, amber, then muted blues. Every chart also prints its values as text. */
export const CHART_COLORS = ["var(--accent)", "var(--accent-2)", "var(--green)", "var(--ink)", "var(--exit)", "var(--warn)", "var(--mid)", "#6d8fd6", "#3b5fa8", "#8aa2c8"];

/** Measured pixel width of a container, so SVG charts are drawn at their real size (no text distortion). */
export function useMeasure(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    setW(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => { for (const e of entries) setW(Math.round(e.contentRect.width)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** True after first paint — used so CSS transitions animate from zero on mount. */
export function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setM(true)); return () => cancelAnimationFrame(r); }, []);
  return m;
}

// ---------- ring ----------

export function Ring({ pct, size = 160, stroke = 12, tone = "", label, sub, small = false }: { pct: number; size?: number; stroke?: number; tone?: "" | "ok" | "info" | "bad"; label?: string; sub?: string; small?: boolean }) {
  const mounted = useMounted();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  const off = circ - (mounted ? (p / 100) * circ : 0);
  return (
    <svg className="chart" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label ?? "Progress"}: ${p} percent${sub ? `, ${sub}` : ""}`} style={{ width: size, height: size, flexShrink: 0 }}>
      <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      <circle className={`ring-value ${tone}`} cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      <text className={`ring-num ${small ? "sm" : ""}`} x="50%" y={sub ? "47%" : "50%"} textAnchor="middle" dominantBaseline="central">{p}%</text>
      {sub && <text className="ring-lbl" x="50%" y="63%" textAnchor="middle" dominantBaseline="central">{sub}</text>}
    </svg>
  );
}

// ---------- donut ----------

export interface Slice { label: string; n: number; color?: string }

export function Donut({ data, size = 170, stroke = 26, centerLabel, centerSub, title }: { data: Slice[]; size?: number; stroke?: number; centerLabel?: string; centerSub?: string; title: string }) {
  const mounted = useMounted();
  const total = data.reduce((s, d) => s + d.n, 0);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  const desc = data.map((d) => `${d.label} ${d.n}`).join(", ");
  return (
    <svg className="chart" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${title}: ${desc || "no data"}`} style={{ width: size, height: size, flexShrink: 0 }}>
      <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
      {total > 0 && data.map((d, i) => {
        const frac = d.n / total;
        const len = mounted ? frac * circ : 0;
        const dash = `${len} ${circ - len}`;
        const offset = -acc * circ;
        acc += frac;
        return <circle key={d.label} className="donut-seg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color ?? CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={stroke} strokeDasharray={dash} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
      })}
      <text className="ring-num" x="50%" y={centerSub ? "46%" : "50%"} textAnchor="middle" dominantBaseline="central">{centerLabel ?? total}</text>
      {centerSub && <text className="ring-lbl" x="50%" y="62%" textAnchor="middle" dominantBaseline="central">{centerSub}</text>}
    </svg>
  );
}

export function Legend({ data, colors }: { data: Slice[]; colors?: string[] }) {
  return (
    <ul className="legend">
      {data.map((d, i) => <li key={d.label}><span className="sw" style={{ background: d.color ?? (colors ?? CHART_COLORS)[i % CHART_COLORS.length] }} aria-hidden="true" /><span className="lbl truncate">{d.label}</span><span className="n">{d.n}</span></li>)}
    </ul>
  );
}

// ---------- horizontal bars ----------

export function HBars({ data, max, colorCycle = false, tone = 1, ariaLabel }: { data: { label: string; n: number; hint?: string }[]; max?: number; colorCycle?: boolean; tone?: 1 | 2 | 3 | 4 | 5; ariaLabel: string }) {
  const mounted = useMounted();
  const m = Math.max(1, max ?? Math.max(...data.map((d) => d.n), 1));
  return (
    <ul className="hbars" aria-label={ariaLabel}>
      {data.map((d, i) => (
        <li key={d.label} className={`hbar c${colorCycle ? ((i % 3) + 1) : tone}`}>
          <span className="hb-label" title={d.label}>{d.label}</span>
          <span className="hb-track" aria-hidden="true"><span style={{ width: mounted ? `${(d.n / m) * 100}%` : 0 }} /></span>
          <span className="hb-n">{d.n}<span className="sr-only"> {d.hint ?? ""}</span></span>
        </li>
      ))}
    </ul>
  );
}

// ---------- funnel ----------

export function Funnel({ rows }: { rows: { label: string; n: number }[] }) {
  const mounted = useMounted();
  const max = Math.max(1, rows[0]?.n ?? 1);
  return (
    <ol className="funnel" aria-label="Conversion funnel">
      {rows.map((r, i) => {
        const prev = i > 0 ? rows[i - 1].n : null;
        const drop = prev && prev > 0 ? Math.round(((r.n - prev) / prev) * 100) : null;
        return (
          <li key={r.label} className="funnel-row">
            <span className="hb-label" style={{ color: "var(--ink2)" }}>{r.label}</span>
            <span className="f-track" aria-hidden="true"><span style={{ width: mounted ? `${Math.max(r.n > 0 ? 9 : 0, (r.n / max) * 100)}%` : 0 }}>{r.n}</span></span>
            <span className="f-drop">{drop === null ? <span className="sr-only">{r.n}</span> : <><span className="sr-only">{r.n}, </span>{drop === 0 ? "—" : `${drop}%`}</>}</span>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- area / line ----------

export function AreaChart({ labels, series, height = 190, title }: { labels: string[]; series: { name: string; values: number[]; tone?: "" | "info" }[]; height?: number; title: string }) {
  const id = useId().replace(/:/g, "");
  const mounted = useMounted();
  const [box, mw] = useMeasure();
  const w = Math.max(280, mw || 640), h = height, padL = 30, padR = 12, padT = 14, padB = 30;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const nice = Math.ceil(max / 5) * 5 || 5;
  const n = labels.length;
  const x = (i: number) => padL + (n > 1 ? (i / (n - 1)) * (w - padL - padR) : (w - padL - padR) / 2);
  const y = (v: number) => padT + (1 - v / nice) * (h - padT - padB);
  // Fritsch–Carlson monotone cubic interpolation: smooth, never overshoots the data.
  const path = (vals: number[]) => {
    const n2 = vals.length;
    const xs = vals.map((_, i) => x(i)), ys = vals.map((v) => y(v));
    if (n2 === 0) return "";
    if (n2 === 1) return `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
    const dx: number[] = [], dy: number[] = [], m: number[] = [];
    for (let i = 0; i < n2 - 1; i++) { dx.push(xs[i + 1] - xs[i]); dy.push(ys[i + 1] - ys[i]); m.push(dx[i] ? dy[i] / dx[i] : 0); }
    const t: number[] = [m[0]];
    for (let i = 1; i < n2 - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
    t.push(m[n2 - 2]);
    for (let i = 0; i < n2 - 1; i++) {
      if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
      const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
      if (h > 9) { const s3 = 3 / Math.sqrt(h); t[i] = s3 * a * m[i]; t[i + 1] = s3 * b * m[i]; }
    }
    let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
    for (let i = 0; i < n2 - 1; i++) {
      const c1x = xs[i] + dx[i] / 3, c1y = ys[i] + (t[i] * dx[i]) / 3, c2x = xs[i + 1] - dx[i] / 3, c2y = ys[i + 1] - (t[i + 1] * dx[i]) / 3;
      d += ` C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
    }
    return d;
  };
  const ticks = [0, nice / 2, nice];
  const desc = series.map((s) => `${s.name}: ${s.values.join(", ")}`).join("; ");
  return (
    <div ref={box} style={{ width: "100%" }}>
    <svg className="chart" width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${title}. ${labels[0]} to ${labels[n - 1]}. ${desc}`} style={{ height, width: "100%" }}>
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" /><stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" /></linearGradient>
      </defs>
      {ticks.map((t) => <g key={t}><line className="grid-line" x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} /><text className="axis" x={padL - 6} y={y(t)} textAnchor="end" dominantBaseline="central">{t}</text></g>)}
      {labels.map((l, i) => (n <= 14 || i % 2 === 0) && <text key={l + i} className="axis" x={x(i)} y={h - 8} textAnchor="middle">{l}</text>)}
      {series.map((s, si) => (
        <g key={s.name} style={{ opacity: mounted ? 1 : 0, transition: "opacity .8s ease" }}>
          {si === 0 && <path d={`${path(s.values)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#g${id})`} />}
          <path className={`line ${s.tone ?? ""}`} d={path(s.values)} />
          {s.values.map((v, i) => <circle key={i} className={`dot ${s.tone ?? ""}`} cx={x(i)} cy={y(v)} r={3}><title>{`${labels[i]}: ${v} ${s.name.toLowerCase()}`}</title></circle>)}
        </g>
      ))}
    </svg>
    </div>
  );
}

// ---------- stage track ----------

export interface StageProg { id: string; name: string; done: number; total: number; active: boolean; complete: boolean; n?: number; current?: boolean }

/** Nine-segment progress track. Pass pipelineProgress(c); `labels="id"` prints the stage number. */
export function StageTrack({ prog, labels = "id" }: { prog: StageProg[]; labels?: "id" | "name" }) {
  const cls = labels === "name" ? "stage-track names" : "stage-track";
  const mounted = useMounted();
  return (
    <ol className={cls} aria-label={`Stage progress, ${prog.length} stages`}>
      {prog.map((p) => {
        const pct = p.total ? (p.done / p.total) * 100 : p.complete ? 100 : 0;
        const live = p.current ?? p.active;
        const cls = p.complete ? "done" : live ? "active" : p.done > 0 ? "partial" : "";
        const short = p.n != null ? String(p.n) : p.id;
        return (
          <li key={p.id} className={`seg-item ${cls}`} title={`Stage ${short} · ${p.name}: ${p.done} of ${p.total} steps`} aria-current={live ? "step" : undefined}>
            <span className="seg-bar" aria-hidden="true"><span style={{ width: mounted ? `${p.complete ? 100 : Math.max(pct, live ? 18 : 0)}%` : 0 }} /></span>
            <span className="seg-lbl">{labels === "id" ? short : p.name}<span className="sr-only">{labels === "id" ? ` ${p.name}` : ""}: {p.done} of {p.total} steps{live ? ", current stage" : p.complete ? ", complete" : ""}</span></span>
          </li>
        );
      })}
    </ol>
  );
}

export function Bar({ pct, tone = "", label, thin = false }: { pct: number; tone?: "" | "ok" | "info" | "bad" | "ink"; label?: string; thin?: boolean }) {
  const mounted = useMounted();
  const p = Math.max(0, Math.min(100, pct));
  return <span className={`bar ${tone} ${thin ? "thin" : ""}`} role={label ? "img" : undefined} aria-label={label ? `${label}: ${p} percent` : undefined} aria-hidden={label ? undefined : true}><span style={{ width: mounted ? `${p}%` : 0 }} /></span>;
}

