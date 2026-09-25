/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Audit explorer: a filtered, keyset-paginated view of the append-only audit log. Rows carry
 * the narrow columns; the field-level diff is read on demand when a row is opened.
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Download, RotateCw, Search } from "lucide-react";
import { useSession } from "@/App";
import { store, type AuditQuery } from "@/lib/store";
import { fmtDateTime } from "@/lib/logic";
import { ROLE_LABEL } from "@/lib/rbac";
import { ENTITY_TYPE_LABEL, EVENT_TYPE_LABEL, EVENTS, RESTRICTED, type AuditEventType, type EntityType } from "@/lib/audit";
import { Avatar, EmptyState, FilterBar, Notice, PageHeader, Pill, SegmentedSwitch, Skeleton } from "@/lib/ui";
import type { AuditEntry } from "@/lib/types";

type Range = "24h" | "7d" | "30d" | "90d" | "custom";
const RANGES: { id: Range; label: string }[] = [{ id: "24h", label: "24h" }, { id: "7d", label: "7d" }, { id: "30d", label: "30d" }, { id: "90d", label: "90d" }, { id: "custom", label: "Custom" }];
const RANGE_HOURS: Record<Exclude<Range, "custom">, number> = { "24h": 24, "7d": 24 * 7, "30d": 24 * 30, "90d": 24 * 90 };
export const PAGE_SIZE = 50;
const EXPORT_PAGE = 200;

type Detail = { state: "loading" } | { state: "error" } | { state: "ok"; changes?: AuditEntry["changes"]; meta?: AuditEntry["meta"] };

function fmtValue(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.map(fmtValue).join(", ") || "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Value({ v }: { v: unknown }) {
  return v === RESTRICTED ? <span className="restricted-chip">restricted</span> : <span>{fmtValue(v)}</span>;
}

function csvCell(v: unknown): string { return `"${fmtValue(v).replace(/"/g, '""')}"`; }

export function AuditExplorer() {
  const { can, users, audit } = useSession();
  const mayRead = can("audit.read");
  const mayDownload = can("audit.download");

  const [range, setRange] = useState<Range>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [actorId, setActorId] = useState("");
  const [eventType, setEventType] = useState<AuditEventType | "">("");
  const [entityType, setEntityType] = useState<EntityType | "">("");
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => { const t = window.setTimeout(() => setQ(text), 250); return () => window.clearTimeout(t); }, [text]);

  const [rows, setRows] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [exporting, setExporting] = useState(false);
  const generation = useRef(0);

  const query = useMemo<AuditQuery>(() => {
    const base: AuditQuery = { actorId: actorId || undefined, eventType: eventType || undefined, entityType: entityType || undefined, q: q.trim() || undefined };
    if (range === "custom") {
      return { ...base, from: customFrom ? new Date(`${customFrom}T00:00:00`).toISOString() : undefined, to: customTo ? new Date(`${customTo}T23:59:59.999`).toISOString() : undefined };
    }
    return { ...base, from: new Date(Date.now() - RANGE_HOURS[range] * 3_600_000).toISOString() };
  }, [range, customFrom, customTo, actorId, eventType, entityType, q]);

  const load = useCallback(async (append: boolean, before?: string) => {
    const gen = append ? generation.current : ++generation.current;
    if (append) setMore(true); else { setLoading(true); setOpen(null); }
    setError(null);
    try {
      const page = await store.auditPage({ ...query, before: before ?? null, limit: PAGE_SIZE });
      if (gen !== generation.current) return;
      setRows((cur) => (append ? [...cur, ...page] : page));
      setHasMore(page.length === PAGE_SIZE);
    } catch (e) {
      if (gen === generation.current) setError((e as Error).message || "The audit log could not be read.");
    } finally {
      if (gen === generation.current) { setLoading(false); setMore(false); }
    }
  }, [query]);

  useEffect(() => { if (mayRead) void load(false); }, [mayRead, load]);

  const toggle = (e: AuditEntry) => {
    const next = open === e.id ? null : e.id;
    setOpen(next);
    if (!next || details[e.id]) return;
    setDetails((d) => ({ ...d, [e.id]: { state: "loading" } }));
    store.auditDetail(e.id)
      .then((r) => setDetails((d) => ({ ...d, [e.id]: { state: "ok", changes: r?.changes, meta: r?.meta } })))
      .catch(() => setDetails((d) => ({ ...d, [e.id]: { state: "error" } })));
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: AuditEntry[] = [];
      let before: string | null = null;
      for (;;) {
        const page = await store.auditPage({ ...query, before, limit: EXPORT_PAGE });
        all.push(...page);
        if (page.length < EXPORT_PAGE) break;
        before = page[page.length - 1].at;
      }
      const header = ["At", "Actor", "Role", "Event type", "Entity type", "Entity", "Action", "Summary", "Target", "Detail", "Outcome", "Source", "Session"];
      const body = all.map((e) => [e.at, e.actorName, ROLE_LABEL[e.actorRole] ?? e.actorRole, e.eventType ? EVENT_TYPE_LABEL[e.eventType] : "Legacy", e.entityType ? ENTITY_TYPE_LABEL[e.entityType] : "", e.entityLabel, e.action, e.summary, e.target, e.detail, e.outcome ?? "success", e.source, e.sessionId]);
      const csv = [header, ...body].map((r) => r.map(csvCell).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = `lpl-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      await audit(EVENTS.auditExported({ range, ...query }, all.length));
    } catch (e) {
      setError((e as Error).message || "The export could not be completed.");
    } finally {
      setExporting(false);
    }
  };

  const people = useMemo(() => Object.values(users).sort((a, b) => a.name.localeCompare(b.name)), [users]);

  return (
    <div className="stack">
      <PageHeader
        title="Audit log"
        context="Precise, append-only record of every action. Newest first."
        actions={mayRead && mayDownload ? <button type="button" className="btn btn-secondary" onClick={() => void exportCsv()} disabled={exporting || rows.length === 0}><Download aria-hidden />{exporting ? "Exporting…" : "Export CSV"}</button> : undefined}
      />

      {!mayRead ? (
        <Notice tone="neutral">Your role opens this page but not its entries. The audit.read permission shows the log.</Notice>
      ) : (
        <>
          <FilterBar label="Filter the audit log">
            <div className="audit-filters">
              <SegmentedSwitch label="Date range" size="sm" options={RANGES} value={range} onChange={setRange} />
              {range === "custom" && (
                <div className="flex aic g2 wrap">
                  <label className="flex aic g1 ui xs">From<input type="date" className="input" value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} /></label>
                  <label className="flex aic g1 ui xs">To<input type="date" className="input" value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} /></label>
                </div>
              )}
              <div className="filters cols-audit">
                <div className="input-wrap f-search"><Search aria-hidden /><label htmlFor="audit-q" className="sr-only">Search the audit log</label><input id="audit-q" type="search" className="input" placeholder="Search action, summary, person or reference" value={text} onChange={(e) => setText(e.target.value)} /></div>
                <div><label htmlFor="audit-actor" className="sr-only">Person</label><select id="audit-actor" className="input" value={actorId} onChange={(e) => setActorId(e.target.value)}><option value="">Everyone</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
                <div><label htmlFor="audit-type" className="sr-only">Event type</label><select id="audit-type" className="input" value={eventType} onChange={(e) => setEventType(e.target.value as AuditEventType | "")}><option value="">All event types</option>{Object.entries(EVENT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label htmlFor="audit-entity" className="sr-only">Entity type</label><select id="audit-entity" className="input" value={entityType} onChange={(e) => setEntityType(e.target.value as EntityType | "")}><option value="">All records</option>{Object.entries(ENTITY_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
            </div>
          </FilterBar>

          {error && <Notice tone="bad" role="alert"><span className="flex aic jcb g2 wrap"><span>{error}</span><button type="button" className="btn btn-secondary btn-sm" onClick={() => void load(false)}><RotateCw aria-hidden />Retry</button></span></Notice>}

          {loading ? (
            <ul className="audit-list" aria-busy="true" aria-label="Loading audit entries">
              {Array.from({ length: 6 }, (_, i) => <li key={i} className="audit-row surface"><Skeleton kind="row" /></li>)}
            </ul>
          ) : rows.length === 0 && !error ? (
            <EmptyState glyph="search" title="No events match" reason="Widen the date range or clear a filter." />
          ) : (
            <>
              <ul className="audit-list" aria-label="Audit entries">
                {rows.map((e) => {
                  const d = details[e.id];
                  const expanded = open === e.id;
                  return (
                    <li key={e.id} className={`audit-row surface ${expanded ? "open" : ""}`}>
                      <button type="button" className="audit-row-btn" aria-expanded={expanded} aria-controls={`audit-d-${e.id}`} onClick={() => toggle(e)}>
                        <time className="audit-at ui xs muted" dateTime={e.at}>{fmtDateTime(e.at)}</time>
                        <span className="audit-actor"><Avatar name={e.actorName} size={26} /><span className="audit-actor-t"><span className="ui small strong truncate">{e.actorName}</span><span className="ui xs muted">{ROLE_LABEL[e.actorRole] ?? e.actorRole}</span></span></span>
                        <span className="audit-what">
                          <span className="ui small">{e.summary ?? e.action}</span>
                          {e.summary && e.summary !== e.action && <span className="xs muted">{e.action}</span>}
                        </span>
                        <span className="audit-extra ui xs muted truncate">{e.detail ?? ""}</span>
                        <span className="audit-chips">
                          {e.eventType ? (e.entityLabel || e.entityType) && <Pill tone="navy">{e.entityType ? ENTITY_TYPE_LABEL[e.entityType] : ""}{e.entityLabel ? `${e.entityType ? " · " : ""}${e.entityLabel}` : ""}</Pill> : <Pill>Legacy</Pill>}
                          {e.outcome === "failure" && <Pill tone="bad">Failed</Pill>}
                        </span>
                        <ChevronDown aria-hidden className={`audit-chev ${expanded ? "open" : ""}`} />
                      </button>
                      {expanded && (
                        <div id={`audit-d-${e.id}`} className="audit-detail">
                          <dl className="audit-kv">
                            {e.eventType && <div><dt>Event</dt><dd>{EVENT_TYPE_LABEL[e.eventType]}</dd></div>}
                            {e.target && <div><dt>Target</dt><dd>{e.target}</dd></div>}
                            {e.detail && <div><dt>Detail</dt><dd>{e.detail}</dd></div>}
                            {e.source && <div><dt>Source</dt><dd>{e.source}</dd></div>}
                            {e.sessionId && <div><dt>Session</dt><dd className="mono">{e.sessionId}</dd></div>}
                          </dl>
                          {!d || d.state === "loading" ? <Skeleton lines={2} /> : d.state === "error" ? (
                            <Notice tone="bad">The change detail could not be read.</Notice>
                          ) : (
                            <>
                              {d.changes && d.changes.length > 0 && (
                                <div className="table-wrap">
                                  <table className="changes-table">
                                    <caption className="sr-only">Changed fields</caption>
                                    <thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
                                    <tbody>{d.changes.map((c) => <tr key={c.field}><th scope="row">{c.label}</th><td><Value v={c.old} /></td><td><Value v={c.new} /></td></tr>)}</tbody>
                                  </table>
                                </div>
                              )}
                              {d.meta && Object.keys(d.meta).length > 0 && (
                                <dl className="audit-kv">{Object.entries(d.meta).map(([k, v]) => <Fragment key={k}><div><dt>{k}</dt><dd>{fmtValue(v)}</dd></div></Fragment>)}</dl>
                              )}
                              {!d.changes?.length && !(d.meta && Object.keys(d.meta).length) && <p className="xs muted">No field-level changes were recorded for this event.</p>}
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {hasMore && <div className="flex audit-more"><button type="button" className="btn btn-secondary" disabled={more} onClick={() => void load(true, rows[rows.length - 1]?.at)}>{more ? "Loading…" : "Load more"}</button></div>}
            </>
          )}
        </>
      )}
    </div>
  );
}
