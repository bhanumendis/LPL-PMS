/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * ⌘K / Ctrl+K search over destinations, cases, people and actions.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Layer, Tooltip } from "@/lib/ui";
import { SEARCH_MIN, useDebounced } from "@/lib/hooks";
import { useCasePage } from "@/lib/useRead";
import { filterCommands, type Command, type CommandGroup } from "./commands";

export const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const SEARCH_SHORTCUT = IS_MAC ? "⌘K" : "Ctrl K";

export function SearchButton({ onOpen, buttonRef }: { onOpen: () => void; buttonRef: React.RefObject<HTMLButtonElement> }) {
  return (
    <Tooltip label="Search" shortcut={SEARCH_SHORTCUT}>
      <button ref={buttonRef} type="button" className="icon-btn" aria-label={`Search, ${SEARCH_SHORTCUT}`} aria-haspopup="dialog" onClick={onOpen}><Search aria-hidden /></button>
    </Tooltip>
  );
}

export function CommandPalette({ open, onClose, commands, anchorRef, searchCases = false, onOpenCase }: {
  open: boolean; onClose: () => void; commands: Command[]; anchorRef?: React.RefObject<HTMLElement>;
  /** Also search cases on the server (three characters or more). */
  searchCases?: boolean; onOpenCase?: (caseId: string) => void;
}) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);
  const term = useDebounced(q.trim(), 200);
  const found = useCasePage(open && searchCases && term.length >= SEARCH_MIN ? { q: term } : null, 8);
  const caseCommands = useMemo<Command[]>(() => found.rows.map((r) => ({
    id: `case:${r.id}`, group: "Cases", label: `${r.ref} · ${r.studentName}`, hint: `Stage ${r.stage} · ${r.destination}`,
    keywords: `${r.ref} ${r.studentName} ${r.studentEmail} ${r.destination}`, run: () => onOpenCase?.(r.id),
  })), [found.rows, onOpenCase]);
  const results = useMemo(() => filterCommands([...commands, ...caseCommands], q), [commands, caseCommands, q]);
  useEffect(() => { setIdx(0); }, [q]);

  const run = (c: Command) => { onClose(); c.run(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setIdx(0); }
    else if (e.key === "End") { e.preventDefault(); setIdx(Math.max(0, results.length - 1)); }
    else if (e.key === "Enter") { const c = results[idx]; if (c) { e.preventDefault(); run(c); } }
  };

  let lastGroup: CommandGroup | null = null;
  return (
    <Layer open={open} onClose={onClose} label="Search" placement="center" width={620} modal anchorRef={anchorRef} className="palette">
      <div className="palette-input">
        <Search aria-hidden />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[idx] ? `${listId}-${idx}` : undefined}
          aria-autocomplete="list"
          aria-label="Search cases, people, pages and actions"
          placeholder="Search cases, people, pages…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKey}
          autoComplete="off"
          spellCheck={false}
        />
        <kbd className="palette-kbd" aria-hidden="true">esc</kbd>
      </div>
      <div className="palette-list" role="listbox" id={listId} aria-label="Results">
        {results.length === 0 && (found.loading
          ? <p className="palette-empty" role="status">Searching cases…</p>
          : <p className="palette-empty">No matches for “{q}”{searchCases && q.trim().length > 0 && q.trim().length < SEARCH_MIN ? ". Type three characters to search cases." : ""}</p>)}
        {results.map((c, i) => {
          const heading = c.group !== lastGroup ? c.group : null;
          lastGroup = c.group;
          return (
            <div key={c.id}>
              {heading && <p className="palette-group" role="presentation">{heading}</p>}
              <button type="button" role="option" id={`${listId}-${i}`} aria-selected={i === idx} className="palette-opt" onMouseEnter={() => setIdx(i)} onClick={() => run(c)}>
                <span className="truncate">{c.label}</span>
                {c.hint && <span className="hint">{c.hint}</span>}
              </button>
            </div>
          );
        })}
      </div>
    </Layer>
  );
}
