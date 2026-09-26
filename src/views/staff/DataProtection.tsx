/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Retention schedule and cross-border transfer register.
 * Closes absences 2 and 3 of process document LGH/IMS/PROC/LPL/001 §10, and feeds the
 * three compliance metrics in §11 (consent coverage, retention-overdue records,
 * third-party transfers logged).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BP, useDebounced, useMediaQuery } from "@/lib/hooks";
import { Check, Download, Search, SlidersHorizontal, Lock, LockOpen, Trash2, Pencil, Plus, X } from "lucide-react";
import { useSession } from "@/App";
import { store, uid, nowIso } from "@/lib/store";
import { RETENTION_LABEL, clearLegalHold, daysUntil, disposeCase, fmtDate, fmtDateTime, retentionPolicy, setLegalHold, updateTransfer, type RetentionState } from "@/lib/logic";
import { useCasePage, useDashboard, useTransfersPage } from "@/lib/useRead";
import type { CaseRow, TransferQuery, TransferRow } from "@/lib/queries";
import { DATA_CATEGORIES, LAWFUL_BASES, SAFEGUARDS } from "@/lib/spine";
import { EmptyState, FilterBar, Layer, ListSkeleton, Modal, Notice, PageFooter, PageHeader, Panel, Pill, ReadError, SelectField, StatStrip, TabPanel, Tabs, TextArea, TextField, useToast, type Tone } from "@/lib/ui";
import type { CaseRecord, CaseStatus, StandingProcessor } from "@/lib/types";
import { EVENTS, diffChanges } from "@/lib/audit";

const STATE_TONE: Record<RetentionState, Tone> = {
  none: "neutral", scheduled: "neutral", due_soon: "warn", overdue: "bad", held: "info", disposed: "navy",
};

const TYPE_LABEL: Record<string, string> = {
  platform: "Platform", partner_agent: "Partner agent", university: "University", authority: "Visa authority", processor: "Processor",
};

type TabId = "retention" | "register" | "processors";

export function DataProtectionPage() {
  const { snap, can, route } = useSession();
  const config = snap.org.config;
  const policy = retentionPolicy(config);
  const mayRead = can("dataprotection.read");
  // Deep link: #/dataprotection/{retention|register|processors} opens that tab.
  const [tab, setTab] = useState<TabId>(route.id === "register" || route.id === "processors" ? route.id : "retention");
  useEffect(() => { if (route.id === "retention" || route.id === "register" || route.id === "processors") setTab(route.id); }, [route.id]);
  const dash = useDashboard();
  const d = dash.data;
  const consent = d ? { pct: d.compliance.consentPct, covered: d.compliance.consentCovered, total: d.compliance.consentTotal } : null;

  return (
    <div className="stack">
      <PageHeader title="Data protection" context="Retention schedule and the register of personal data leaving Sri Lanka. Aligned to PDPA No. 9 of 2022 as amended, Parts I and III, in force 1 January 2027." />

      {dash.error ? <ReadError error={dash.error} onRetry={dash.reload} /> : (
        <StatStrip label="Data protection position" stats={[
          { id: "consent", label: "Consent coverage", value: consent ? `${consent.pct}%` : "—", sub: consent ? `${consent.covered} of ${consent.total} profiled cases` : "", tone: !consent ? "neutral" : consent.pct === 100 ? "ok" : consent.pct >= 90 ? "warn" : "bad" },
          { id: "retention", label: "Retention overdue", value: d?.retention.overdue ?? "—", sub: d?.retention.due_soon ? `${d.retention.due_soon} due within ${policy.warnDays} days` : "None due soon", tone: d?.retention.overdue ? "bad" : "ok", onClick: () => setTab("retention") },
          { id: "transfers", label: "Transfers logged", value: d?.compliance.transfers ?? "—", sub: "on the register", tone: "neutral", onClick: () => setTab("register") },
          { id: "unsafe", label: "Without a safeguard", value: d?.compliance.unsafeguarded ?? "—", sub: "Transfers with no agreement recorded", tone: d?.compliance.unsafeguarded ? "bad" : "ok", onClick: () => setTab("register") },
        ]} />
      )}

      <Tabs<TabId>
        label="Data protection sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "retention", label: "Retention", count: d ? d.retention.overdue + d.retention.due_soon || undefined : undefined },
          { id: "register", label: "Transfer register", count: d?.compliance.transfers || undefined },
          { id: "processors", label: "Standing processors", count: (config.processors ?? []).length || undefined },
        ]}
      />

      {!mayRead && <Notice tone="neutral">Your role sees the compliance tiles. The dataprotection.read permission opens the registers.</Notice>}
      <TabPanel id="retention" active={mayRead && tab === "retention"}>
        <RetentionTab />
      </TabPanel>
      <TabPanel id="register" active={mayRead && tab === "register"}>
        <RegisterTab gaps={d?.compliance.unsafeguarded ?? 0} unapproved={d?.compliance.unapproved ?? 0} total={d?.compliance.transfers ?? 0} />
      </TabPanel>
      <TabPanel id="processors" active={mayRead && tab === "processors"}>
        <ProcessorsTab />
      </TabPanel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Retention
// ---------------------------------------------------------------------------

const BASIS: Record<CaseStatus, string> = { exited: "Exited", completed: "Completed", hold: "Dormant — on hold", deferred: "Dormant — deferred", open: "—" };

function RetentionTab() {
  const { snap, can, user, audit } = useSession();
  const toast = useToast();
  const config = snap.org.config;
  const policy = retentionPolicy(config);
  const [filter, setFilter] = useState<RetentionState | "actionable">("actionable");
  const [disposeTarget, setDisposeTarget] = useState<CaseRow | null>(null);
  const [holdTarget, setHoldTarget] = useState<CaseRecord | null>(null);
  const [typed, setTyped] = useState("");
  const [basis, setBasis] = useState("Retention period expired under the LPL retention schedule");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const mayDispose = can("dataprotection.delete");
  const mayHold = can("dataprotection.write");
  const restricted = [!mayHold ? "legal holds" : null, !mayDispose ? "disposal" : null].filter((s): s is string => s !== null);
  // Earliest disposal date first; the database filters and orders the whole schedule.
  const page = useCasePage({ retention: filter === "actionable" ? ["overdue", "due_soon", "held"] : [filter], sort: "retention" });
  const monthsOf = (r: CaseRow) => (r.retentionKind === "exited" ? policy.exitedMonths : r.retentionKind === "completed" ? policy.completedMonths : policy.dormantMonths);

  const doDispose = async () => {
    if (!disposeTarget || !user) return;
    const ref = disposeTarget.ref;
    setBusy(true);
    try {
      await store.mutateCase(disposeTarget.id, (c) => disposeCase(c, user, basis));
      await audit(EVENTS.disposed(disposeTarget, basis));
      setDisposeTarget(null); setTyped("");
      toast(`${ref} anonymised. Outcomes and dates kept for reporting.`);
    } catch { /* reported by the store */ } finally { setBusy(false); }
  };

  /** The hold's details live in the document, fetched when the dialog opens. */
  const openHold = async (r: CaseRow) => {
    try {
      const c = await store.openCase(r.id);
      if (c) { setHoldTarget(c); setReason(c.legalHold?.reason ?? ""); }
    } catch (e) { toast((e as Error).message, "bad"); }
  };

  const doHold = async () => {
    if (!holdTarget || !user) return;
    const ref = holdTarget.ref;
    const held = Boolean(holdTarget.legalHold);
    setBusy(true);
    try {
      await store.mutateCase(holdTarget.id, (c) => (held ? clearLegalHold(c, user) : setLegalHold(c, user, reason)));
      await audit(EVENTS.legalHold(holdTarget, !held, held ? undefined : reason));
      setHoldTarget(null); setReason("");
      toast(held ? `Legal hold lifted on ${ref}` : `Legal hold placed on ${ref}. Disposal is suspended.`);
    } catch { /* reported by the store */ } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-3 stagger">
      <div className="span2 stack">
        <FilterBar label="Filter the retention schedule">
          <label htmlFor="ret-filter" className="sr-only">Filter by retention state</label>
          <select id="ret-filter" className="input" value={filter} onChange={(e) => setFilter(e.target.value as RetentionState | "actionable")}>
            <option value="actionable">Needs attention — overdue, due soon and legal holds</option>
            <option value="overdue">Overdue</option>
            <option value="due_soon">Due soon</option>
            <option value="held">Legal hold</option>
            <option value="scheduled">Scheduled</option>
            <option value="disposed">Disposed</option>
            <option value="none">No clock — open cases</option>
          </select>
        </FilterBar>

        {restricted.length > 0 && <Notice tone="info">You can review the schedule; {restricted.join(" and ")} {restricted.length === 1 && restricted[0] === "disposal" ? "is" : "are"} reserved to roles holding the matching data protection permission.</Notice>}

        {page.error ? <ReadError error={page.error} onRetry={page.reload} /> : page.loading ? <ListSkeleton label="Loading the retention schedule" /> : page.rows.length === 0 ? (
          <EmptyState glyph="check" title="Nothing in this state" reason="Cases enter the schedule when they exit, complete, or go dormant on hold." />
        ) : (
          <div className="panel table-wrap" aria-busy={page.refreshing}>
            <table className="tbl" style={{ minWidth: 760 }}>
              <caption className="sr-only">Cases by retention state, earliest disposal date first</caption>
              <thead>
                <tr>
                  <th scope="col">Case</th><th scope="col">Basis</th><th scope="col">Disposal due</th><th scope="col">State</th><th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((r) => {
                  const state = r.retention;
                  const days = r.retentionDueAt ? daysUntil(new Date(r.retentionDueAt)) : null;
                  return (
                    <tr key={r.id}>
                      <td><p className="primary">{r.ref}</p><p className="sub truncate">{r.studentName}</p></td>
                      <td className="nowrap">{BASIS[r.status]}<p className="sub">{r.retentionDueAt ? `${monthsOf(r)} months` : ""}</p></td>
                      <td className="nowrap">{r.retentionDueAt ? fmtDate(r.retentionDueAt) : "—"}<p className="sub">{days == null ? "" : days < 0 ? `${Math.abs(days)} days past` : `in ${days} days`}</p></td>
                      <td><Pill tone={STATE_TONE[state]}>{RETENTION_LABEL[state]}</Pill></td>
                      <td>
                        <div className="flex wrap g1">
                          {mayHold && state !== "disposed" && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openHold(r)}>
                              {r.legalHold ? <LockOpen aria-hidden /> : <Lock aria-hidden />}{r.legalHold ? "Lift hold" : "Hold"}
                            </button>
                          )}
                          {mayDispose && state === "overdue" && (
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => { setDisposeTarget(r); setTyped(""); }}><Trash2 aria-hidden />Dispose</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!page.loading && !page.error && <PageFooter shown={page.rows.length} hasMore={page.hasMore} loadingMore={page.loadingMore} onMore={page.loadMore} noun="cases" />}
      </div>

      <div className="stack">
        <Panel title="The schedule">
          <div className="stack-sm small">
            <ScheduleRow label="Exited cases" months={policy.exitedMonths} note="From the recorded exit date." />
            <ScheduleRow label="Placed students" months={policy.completedMonths} note="From the three-month follow-up, against commercial records." />
            <ScheduleRow label="Dormant holds and deferrals" months={policy.dormantMonths} note="From the last activity on the case." />
            <p className="xs muted mt2">Open cases have no clock. Periods are set in Settings and should be confirmed with Group Legal before go-live.</p>
          </div>
        </Panel>
        <Panel title="What disposal does">
          <div className="stack-sm small">
            <p>Disposal <b className="ui">anonymises</b> rather than deletes. Name, contact details, passport number, academic records, sponsor and health information, document filenames and the case narrative are destroyed.</p>
            <p>Outcome codes, dates, destination, programme, institution and the transfer register survive, so conversion, SLA and refusal reporting stay intact with no data subject behind them.</p>
            <p className="muted">The action is irreversible and is written to the audit log.</p>
          </div>
        </Panel>
      </div>

      <Modal open={Boolean(disposeTarget)} onClose={() => setDisposeTarget(null)} title={`Dispose of ${disposeTarget?.ref ?? ""}`} width={520}>
        <Notice tone="bad">This destroys the personal data on this case. It cannot be undone.</Notice>
        <div className="stack-sm mt3">
          <SelectField label="Basis" value={basis} onChange={setBasis} options={[
            "Retention period expired under the LPL retention schedule",
            "Data subject erasure request",
            "Record created in error",
          ]} required />
          <p className="small ink2">Type <b className="ui">DISPOSE</b> to confirm.</p>
          <TextField label="Confirmation" value={typed} onChange={setTyped} autoComplete="off" />
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={() => setDisposeTarget(null)}>Cancel</button>
          <button type="button" className="btn btn-danger" disabled={typed !== "DISPOSE" || busy} onClick={doDispose}>Destroy personal data</button>
        </div>
      </Modal>

      <Modal open={Boolean(holdTarget)} onClose={() => setHoldTarget(null)} title={holdTarget?.legalHold ? `Lift the legal hold on ${holdTarget?.ref ?? ""}` : `Place a legal hold on ${holdTarget?.ref ?? ""}`} width={500}>
        {holdTarget?.legalHold ? (
          <div className="stack-sm small">
            <p>Placed {fmtDateTime(holdTarget.legalHold.at)} by {holdTarget.legalHold.byName}.</p>
            <p className="ink2">Reason recorded: {holdTarget.legalHold.reason}</p>
            <Notice tone="warn">Lifting the hold returns the case to the retention schedule. If it is already past its disposal date it becomes disposable immediately.</Notice>
          </div>
        ) : (
          <div className="stack-sm">
            <p className="small ink2">A legal hold suspends disposal indefinitely — for litigation, a regulatory enquiry or an unresolved complaint.</p>
            <TextArea label="Reason for the hold" value={reason} onChange={setReason} rows={3} required />
          </div>
        )}
        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={() => setHoldTarget(null)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={busy || (!holdTarget?.legalHold && reason.trim().length < 3)} onClick={doHold}>{holdTarget?.legalHold ? "Lift the hold" : "Place the hold"}</button>
        </div>
      </Modal>
    </div>
  );
}

/**
 * Eight data categories in one cell blows the row height out, so the visible text is
 * truncated and the full list is exposed to assistive technology and the CSV export.
 */
function Categories({ list }: { list: string[] }) {
  const shown = list.slice(0, 2).join(", ");
  const rest = list.length - 2;
  return (
    <>
      <span aria-hidden="true" className="truncate" style={{ display: "block", maxWidth: 200 }}>{shown}{rest > 0 ? ` +${rest} more` : ""}</span>
      <span className="sr-only">{list.join(", ")}</span>
    </>
  );
}

function ScheduleRow({ label, months, note }: { label: string; months: number; note: string }) {
  return (
    <div className="flex jcb aic g2">
      <div style={{ minWidth: 0 }}>
        <p className="ui small strong">{label}</p>
        <p className="xs muted">{note}</p>
      </div>
      <Pill tone="neutral">{months} months</Pill>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Transfer register
// ---------------------------------------------------------------------------

const TRANSFER_FIELDS = [{ id: "lawfulBasis", label: "Lawful basis" }, { id: "safeguard", label: "Safeguard" }, { id: "country", label: "Country" }, { id: "note", label: "Note" }];

/** Rows the export reads at most; beyond it the register is exported from the database. */
const EXPORT_CAP = 20_000;

function RegisterTab({ gaps, unapproved, total }: { gaps: number; unapproved: number; total: number }) {
  const { can, user, audit, go } = useSession();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [edit, setEdit] = useState<TransferRow | null>(null);
  const [form, setForm] = useState({ lawfulBasis: "", safeguard: "", country: "", note: "" });
  const [exporting, setExporting] = useState(false);
  const mayExport = can("dataprotection.download");
  const mayEdit = can("dataprotection.write");
  const term = useDebounced(q.trim(), 250);
  const query = useMemo<Omit<TransferQuery, "after" | "limit">>(() => ({ ...(term ? { q: term } : {}), ...(type ? { type } : {}), ...(gapsOnly ? { safeguard: "none" as const } : {}) }), [term, type, gapsOnly]);
  const page = useTransfersPage(query);
  const list = page.rows;
  const phone = useMediaQuery(BP.mobile);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersRef = useRef<HTMLButtonElement>(null);
  const typeSelect = (
    <div>
      <label htmlFor="tr-type" className="sr-only">Recipient type</label>
      <select id="tr-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="">All recipients</option>
        {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
  const gapsCheck = (
    <label className="check" htmlFor="tr-gaps">
      <input id="tr-gaps" type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} />
      <span>Gaps only</span>
    </label>
  );

  const openEdit = (t: TransferRow) => {
    setForm({ lawfulBasis: t.lawfulBasis ?? "", safeguard: t.safeguard ?? "", country: t.country ?? "", note: t.note ?? "" });
    setEdit(t);
  };

  const save = async () => {
    if (!edit || !user) return;
    try {
      await store.mutateCase(edit.caseId, (c) => updateTransfer(c, edit.id, { ...form, note: form.note.trim() || undefined }, user));
      await audit(EVENTS.transferUpdated({ id: edit.id, caseRef: edit.caseRef, recipient: edit.recipient ?? "" }, form.safeguard, diffChanges(edit as unknown as Record<string, unknown>, form as unknown as Record<string, unknown>, TRANSFER_FIELDS)));
      setEdit(null);
      toast("Transfer record updated");
    } catch { /* reported by the store */ }
  };

  /** Every row the filters match, read page by page (up to EXPORT_CAP), newest first. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: TransferRow[] = [];
      let after: TransferQuery["after"] = null;
      do {
        const p = await store.read.transfersPage({ ...query, after, limit: 200 });
        all.push(...p.rows);
        after = p.next;
      } while (after && all.length < EXPORT_CAP);
      const header = ["Date", "Case", "Step", "Recipient", "Type", "Approved agent", "Country", "Data categories", "Lawful basis", "Safeguard", "Logged by", "Note"];
      const body = all.map((t) => [t.at ?? "", t.caseRef, t.step == null ? "" : String(t.step), t.recipient ?? "", TYPE_LABEL[t.recipientType ?? ""] ?? t.recipientType ?? "", t.recipientApproved == null ? "" : t.recipientApproved ? "Yes" : "No", t.country ?? "", (t.dataCategories ?? []).join("; "), t.lawfulBasis ?? "", t.safeguard ?? "", t.byName ?? "", t.note ?? ""]);
      const csv = [header, ...body].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = `lpl-transfer-register-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      void audit(EVENTS.registerExported(all.length));
      if (after) toast(`Exported the ${EXPORT_CAP.toLocaleString()} most recent records. Narrow the filters, or ask Group IT for a full database export.`, "warn");
    } catch (e) { toast((e as Error).message, "bad"); } finally { setExporting(false); }
  };

  return (
    <div className="stack">
      {gaps > 0 && (
        <Notice tone="warn" role="status">
          <b className="ui">{gaps}</b> of {total} transfers carry no recorded safeguard. Each needs a processor agreement or an explicit lawful basis before 1 January 2027.
        </Notice>
      )}
      {unapproved > 0 && (
        <Notice tone="bad" role="status">
          <b className="ui">{unapproved}</b> transfer{unapproved === 1 ? "" : "s"} went to a partner agent that was not on the approved list. The handling rule for that route is still undefined (discrepancy D-05).
        </Notice>
      )}

      <FilterBar label="Filter the transfer register">
        <div className="filters cols-register">
          <div className="input-wrap f-search">
            <Search aria-hidden />
            <label htmlFor="tr-q" className="sr-only">Filter the register</label>
            <input id="tr-q" type="search" className="input" placeholder="Filter by recipient, country or case" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {phone ? (
            <div className="flex g2 aic">
              <button ref={filtersRef} type="button" className="btn btn-secondary btn-sm grow" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(true)}><SlidersHorizontal aria-hidden />Filters{type || gapsOnly ? ` (${(type ? 1 : 0) + (gapsOnly ? 1 : 0)})` : ""}</button>
              {mayExport && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void exportCsv()} disabled={list.length === 0 || exporting} aria-busy={exporting}><Download aria-hidden />{exporting ? "Exporting…" : "Export"}</button>}
            </div>
          ) : (
            <>
              {typeSelect}
              <div className="flex g2 aic nowrap">
                {gapsCheck}
                {mayExport && <button type="button" className="btn btn-secondary btn-sm" onClick={() => void exportCsv()} disabled={list.length === 0 || exporting} aria-busy={exporting}><Download aria-hidden />{exporting ? "Exporting…" : "Export"}</button>}
              </div>
            </>
          )}
        </div>
      </FilterBar>
      <Layer open={phone && filtersOpen} onClose={() => setFiltersOpen(false)} anchorRef={filtersRef} label="Filter the transfer register" variant="sheet">
        <div className="stack-sm" style={{ padding: "4px 18px 22px" }}>
          <h2 className="ui" style={{ fontSize: 15 }}>Filters</h2>
          {typeSelect}
          {gapsCheck}
          <button type="button" className="btn btn-primary" onClick={() => setFiltersOpen(false)}>Show records</button>
        </div>
      </Layer>

      {page.error ? <ReadError error={page.error} onRetry={page.reload} /> : page.loading ? <ListSkeleton label="Loading the register" /> : list.length === 0 ? (
        <EmptyState glyph="inbox" title={term || type || gapsOnly ? "No records match these filters" : "No transfers recorded"} reason={term || type || gapsOnly ? "Clear a filter or search for a different recipient." : "Records are written automatically when applications are submitted (step 11), acceptance documents are shared (step 18) and a visa is lodged (step 23)."} />
      ) : (
        <div className="panel table-wrap" aria-busy={page.refreshing}>
          <table className="tbl" style={{ minWidth: 1040 }}>
            <caption className="sr-only">Cross-border transfer register, most recent first</caption>
            <thead>
              <tr>
                <th scope="col">When</th><th scope="col">Case</th><th scope="col">Recipient</th><th scope="col">Country</th>
                <th scope="col">Data</th><th scope="col">Lawful basis</th><th scope="col">Safeguard</th>{mayEdit && <th scope="col">Edit</th>}
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={`${t.caseId}/${t.id}`}>
                  <td className="nowrap muted">{fmtDate(t.at ?? undefined)}<p className="sub">Step {t.step ?? "—"}</p></td>
                  <td><button type="button" className="row-btn" onClick={() => go({ page: "case", caseId: t.caseId })}>{t.caseRef}</button></td>
                  <td>
                    <p className="primary truncate" style={{ maxWidth: 220 }}>{t.recipient}</p>
                    <p className="sub">{TYPE_LABEL[t.recipientType ?? ""] ?? t.recipientType}{t.recipientApproved === false ? " · not approved" : ""}</p>
                  </td>
                  <td className="nowrap">{t.country}</td>
                  <td className="xs muted"><Categories list={t.dataCategories ?? []} /></td>
                  <td className="xs nowrap">{t.lawfulBasis}</td>
                  <td><Pill tone={t.safeguard === "None recorded" ? "bad" : "ok"}>{t.safeguard}</Pill></td>
                  {mayEdit && (
                    <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(t)} aria-label={`Edit the transfer record for ${t.recipient} on case ${t.caseRef}`}><Pencil aria-hidden />Edit</button></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!page.loading && !page.error && <PageFooter shown={list.length} total={term || type || gapsOnly ? null : total} hasMore={page.hasMore} loadingMore={page.loadingMore} onMore={page.loadMore} noun="records" />}

      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title="Transfer record" width={540}>
        {edit && (
          <div className="stack-sm">
            <div className="soft" style={{ padding: 12 }}>
              <p className="ui small strong">{edit.recipient}</p>
              <p className="xs muted">{edit.caseRef} · step {edit.step ?? "—"} · logged {fmtDateTime(edit.at ?? undefined)} by {edit.byName ?? "—"}</p>
              <p className="xs muted mt1">Data transferred: {(edit.dataCategories ?? []).join(", ")}</p>
            </div>
            <TextField label="Recipient country" value={form.country} onChange={(v) => setForm({ ...form, country: v })} required />
            <SelectField label="Lawful basis" value={form.lawfulBasis} onChange={(v) => setForm({ ...form, lawfulBasis: v })} options={LAWFUL_BASES} required />
            <SelectField label="Safeguard" value={form.safeguard} onChange={(v) => setForm({ ...form, safeguard: v })} options={SAFEGUARDS} required hint="Record the agreement that makes this transfer lawful." />
            <TextArea label="Note" value={form.note} onChange={(v) => setForm({ ...form, note: v })} rows={2} />
          </div>
        )}
        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={() => setEdit(null)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={save}>Save record</button>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standing processors
// ---------------------------------------------------------------------------

const EMPTY_PROCESSOR = { name: "", purpose: "", country: "", safeguard: SAFEGUARDS[0], agreementRef: "", dataCategories: [] as string[] };

function ProcessorsTab() {
  const { snap, can, audit } = useSession();
  const toast = useToast();
  const processors = snap.org.config.processors ?? [];
  const mayEdit = can("dataprotection.write");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY_PROCESSOR);

  const add = async () => {
    const entry: StandingProcessor = {
      id: uid(), name: f.name.trim(), purpose: f.purpose.trim(), country: f.country.trim(),
      dataCategories: f.dataCategories, safeguard: f.safeguard,
      agreementRef: f.agreementRef.trim() || undefined, addedAt: nowIso(),
    };
    await store.mutateOrg((o) => { o.config.processors = [...(o.config.processors ?? []), entry]; return o; });
    await audit(EVENTS.processorAdded(entry));
    setOpen(false); setF(EMPTY_PROCESSOR);
    toast("Processor added to the register");
  };

  const remove = async (p: StandingProcessor) => {
    await store.mutateOrg((o) => { o.config.processors = (o.config.processors ?? []).filter((x) => x.id !== p.id); return o; });
    await audit(EVENTS.processorRemoved(p.name));
    toast("Processor removed");
  };

  const toggleCategory = (cat: string) => setF((s) => ({ ...s, dataCategories: s.dataCategories.includes(cat) ? s.dataCategories.filter((c) => c !== cat) : [...s.dataCategories, cat] }));

  return (
    <div className="stack">
      <Notice tone="info">
        Per-case transfers are logged automatically. This register covers processors that hold LPL data continuously — hosting, email, file storage — which the process document does not currently name at all.
      </Notice>

      <div className="page-head" style={{ marginTop: 0 }}>
        <div><h2>Standing processors</h2><p>Every third party holding student data on LPL's behalf, and the agreement that permits it.</p></div>
        {mayEdit && <div className="actions"><button type="button" className="btn btn-primary" onClick={() => setOpen(true)}><Plus aria-hidden />Add a processor</button></div>}
      </div>

      {processors.length === 0 ? (
        <EmptyState glyph="inbox" title="No processors recorded" reason="At minimum this should name wherever the workspace itself is hosted." action={mayEdit ? <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Add a processor</button> : undefined} />
      ) : (
        <div className="panel table-wrap">
          <table className="tbl" style={{ minWidth: 820 }}>
            <caption className="sr-only">Standing processors holding LPL data</caption>
            <thead><tr><th scope="col">Processor</th><th scope="col">Purpose</th><th scope="col">Country</th><th scope="col">Data</th><th scope="col">Safeguard</th>{mayEdit && <th scope="col">Remove</th>}</tr></thead>
            <tbody>
              {processors.map((p) => (
                <tr key={p.id}>
                  <td><p className="primary">{p.name}</p><p className="sub">{p.agreementRef ? `Agreement ${p.agreementRef}` : "No agreement reference"}</p></td>
                  <td className="xs">{p.purpose}</td>
                  <td className="nowrap">{p.country}</td>
                  <td className="xs muted">{p.dataCategories.length ? <Categories list={p.dataCategories} /> : "Not recorded"}</td>
                  <td><Pill tone={p.safeguard === "None recorded" ? "bad" : "ok"}>{p.safeguard}</Pill></td>
                  {mayEdit && <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => void remove(p)} aria-label={`Remove ${p.name} from the register`}><X aria-hidden />Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Add a standing processor" width={560}>
        <div className="stack-sm">
          <TextField label="Processor name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required />
          <TextField label="Purpose" value={f.purpose} onChange={(v) => setF({ ...f, purpose: v })} required placeholder="Application hosting and database" />
          <TextField label="Country of processing" value={f.country} onChange={(v) => setF({ ...f, country: v })} required placeholder="Singapore" />
          <div className="field full">
            <p className="ui small strong" id="proc-cats">Data categories held</p>
            <div className="choice" role="group" aria-labelledby="proc-cats">
              {DATA_CATEGORIES.map((cat) => {
                const on = f.dataCategories.includes(cat);
                return (
                  <button key={cat} type="button" className="chip" aria-pressed={on} onClick={() => toggleCategory(cat)}>
                    {on && <Check aria-hidden style={{ width: 14, height: 14 }} />}{cat}
                  </button>
                );
              })}
            </div>
          </div>
          <SelectField label="Safeguard" value={f.safeguard} onChange={(v) => setF({ ...f, safeguard: v })} options={SAFEGUARDS} required />
          <TextField label="Agreement reference" value={f.agreementRef} onChange={(v) => setF({ ...f, agreementRef: v })} hint="Optional. The contract or DPA number." />
        </div>
        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!f.name.trim() || !f.purpose.trim() || !f.country.trim()} onClick={add}>Add processor</button>
        </div>
      </Modal>
    </div>
  );
}
