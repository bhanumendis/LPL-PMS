/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Section navigation. A destination that groups several pages (People: Staff, Roles and
 * permissions; Governance: Data protection, Audit log) opens its first page from the dock or
 * tab bar; this row, under the top bar, is how every other page in the group is reached on
 * every screen size. Without it those pages were only reachable from the command palette.
 */
import type { Destination } from "./nav";

export function SectionNav({ dest, activePage, onNavigate }: { dest: Destination; activePage: string; onNavigate: (page: string) => void }) {
  if (!dest.children || dest.children.length < 2) return null;
  return (
    <nav className="section-nav" aria-label={`${dest.label} sections`}>
      <ul role="list">
        {dest.children.map((c) => {
          const current = c.page === activePage;
          return (
            <li key={c.page}>
              <a
                href={`#/${c.page}`}
                className="section-nav-item"
                aria-current={current ? "page" : undefined}
                onClick={(e) => { e.preventDefault(); if (!current) onNavigate(c.page); }}
              >
                {c.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
