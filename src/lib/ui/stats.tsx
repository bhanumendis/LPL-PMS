/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Stat strip: one surface holding a few capsules, each a count with an optional delta and a
 * click-through. Replaces rows of separate KPI cards.
 */
import React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { CountUp, type Tone } from "./core";

export interface Stat {
  id: string;
  label: string;
  value: number | string;
  /** Change against the previous period; `label` names the period ("vs last 30 days"). */
  delta?: { value: number; label: string; /** true when a rise is good news (default true) */ upIsGood?: boolean };
  sub?: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
  /** Decorative hue for the icon badge, accent edge and wash. Defaults to the strip's rotation. */
  hue?: Hue;
  onClick?: () => void;
}

export type Hue = "blue" | "indigo" | "violet" | "cyan" | "teal" | "emerald" | "amber" | "rose";
/** The rotation a strip uses when a stat names no hue: adjacent tiles never share a colour. */
export const HUE_ROTATION: Hue[] = ["blue", "violet", "teal", "amber", "rose", "emerald", "cyan", "indigo"];

export function hueStyle(h: Hue): React.CSSProperties {
  return { "--h": `var(--hue-${h})`, "--h-soft": `var(--hue-${h}-soft)`, "--h-text": `var(--hue-${h}-text)` } as React.CSSProperties;
}

function Delta({ d }: { d: NonNullable<Stat["delta"]> }) {
  const dir = d.value > 0 ? "up" : d.value < 0 ? "down" : "flat";
  const good = d.upIsGood ?? true;
  const mood = dir === "flat" ? "" : (dir === "up") === good ? "good" : "bad";
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  return (
    <span className={`stat-delta ${mood}`}>
      <Icon aria-hidden />
      <span className="sr-only">{dir === "up" ? "up" : dir === "down" ? "down" : "unchanged"} </span>
      {dir === "flat" ? "no change" : `${Math.abs(d.value)} ${d.label}`}
    </span>
  );
}

export function StatStrip({ stats, label, className = "" }: { stats: Stat[]; label: string; className?: string }) {
  return (
    <div className={`stat-strip surface ${className}`} role="group" aria-label={label}>
      {stats.map((s, i) => {
        const hue = s.hue ?? HUE_ROTATION[i % HUE_ROTATION.length];
        const inner = (
          <>
            <span className="stat-label">{s.icon && <span className="stat-icon" aria-hidden="true">{s.icon}</span>}{s.label}</span>
            <span className={`stat-value t-${s.tone ?? "neutral"}`}><CountUp value={s.value} /></span>
            {s.delta ? <Delta d={s.delta} /> : s.sub ? <span className="stat-sub">{s.sub}</span> : null}
          </>
        );
        return s.onClick
          ? <button key={s.id} type="button" className="stat hued click" style={hueStyle(hue)} onClick={s.onClick}>{inner}</button>
          : <div key={s.id} className="stat hued" style={hueStyle(hue)}>{inner}</div>;
      })}
    </div>
  );
}
