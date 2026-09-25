/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * CardList: the phone-width form of a table — one card per row.
 */
import React from "react";

export function CardList<T>({ items, render, keyOf, label, className = "" }: { items: T[]; render: (t: T) => React.ReactNode; keyOf: (t: T) => string; label: string; className?: string }) {
  return (
    <ul className={`card-list ${className}`} aria-label={label}>
      {items.map((t) => <li key={keyOf(t)} className="card-row surface">{render(t)}</li>)}
    </ul>
  );
}
