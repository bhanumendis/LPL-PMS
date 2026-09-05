/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { FolderOpen, UserRoundX, ShieldCheck, AlarmClock, FileSearch, PauseCircle, PlaneLanding, CircleAlert, ArrowRight } from "lucide-react";
import { useSession } from "@/App";
import { PIPELINE, STEP_BY_N } from "@/lib/spine";
import { currentPipeline, slaFlags, latestGate, pendingReviewCount, fmtDateTime, funnel, countBy, caseDestination, caseChannel, monthlyVolume, slaCompliance, averageLeadTime, docStats, currentStep, caseProgress } from "@/lib/logic";
import { Kpi, Panel, Empty, Pill, Avatar, statusTone, Notice } from "@/lib/ui";
import { inCaseScope } from "@/lib/rbac";
import { Funnel, HBars, Donut, Legend, AreaChart, Ring, Bar } from "@/lib/charts";
import { ROLE_LABEL } from "@/lib/rbac";
import type { CaseRecord } from "@/lib/types";

export function Overview() {
  const { can } = useSession();
  return can("analytics.view") ? <TeamOverview /> : <CounsellorOverview />;
}

function TeamOverview() {
  const { cases, users, snap, go, can, user, log } = useSession();
  const config = snap.org.config;
  const all = Object.values(cases).filter((c) => inCaseScope(config, user, c));
  const mayRead = can("analytics.read");
  const open = all.filter((c) => c.status === "open");
  const unassigned = open.filter((c) => !c.counsellorId);
  const awaitingGate = open.filter((c) => ([16, 19] as const).some((g) => latestGate(c, g)?.status === "pending"));
  const breaches = open.filter((c) => slaFlags(c, config).some((f) => f.state === "breached"));
  const dueSoon = open.filter((c) => slaFlags(c, config).some((f) => f.state === "due-soon"));
  const docsPending = open.reduce((n, c) => n + pendingReviewCount(c), 0);
  const hold = all.filter((c) => c.status === "hold" || c.status === "deferred");
  const exited = all.filter((c) => c.status === "exited");
  const arrivedYear = all.filter((c) => { const a = c.steps[30]?.values.arrivalDate; return typeof a === "string" && a.startsWith(String(new Date().getFullYear())) && c.steps[30]?.status === "done"; });

  const byStage = PIPELINE.map((p) => ({ label: `${p.n}. ${p.name}`, n: open.filter((c) => currentPipeline(c).id === p.id).length }));
  const dest = countBy(all.filter((c) => c.status !== "exited"), caseDestination).slice(0, 8);
  const channels = countBy(all, caseChannel);
  const vol = monthlyVolume(all, 12);
  const sla = slaCompliance(all, config);
  const lead = averageLeadTime(all);
  const docs = docStats(all);
  const exits = countBy(exited, (c) => c.exit?.code ?? "Other");

  const staff = Object.values(users).filter((u) => u.role !== "student" && u.active);
  const counsellors = staff.filter((u) => u.role === "counsellor" || u.role === "team_leader");

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Overview</h1><p>{config.orgName} · live position across {all.length} case{all.length === 1 ? "" : "s"}</p></div>
        <div className="actions">
          {can("analytics.download") && <button type="button" className="btn btn-secondary" onClick={() => { const rows: (string | number)[][] = [["Metric","Value"], ["Open cases", open.length], ["Unassigned", unassigned.length], ["Awaiting Team Leader", awaitingGate.length], ["SLA breaches", breaches.length], ["Documents to review", docsPending], ["On hold or deferred", hold.length], ["Arrived this year", arrivedYear.length], ["Exited", exited.length], ...byStage.map((s) => [`Stage: ${s.label}`, s.n] as (string | number)[])]; const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "lpl-overview.csv"; a.click(); void log("Overview exported"); }}>Export CSV</button>}
          {can("case.write") && <button type="button" onClick={() => go({ page: "cases" })} className="btn btn-secondary">Go to cases <ArrowRight aria-hidden /></button>}
        </div>
      </div>

      <div className="grid grid-4 stagger">
        <Kpi label="Open cases" icon={<FolderOpen aria-hidden />} value={open.length} sub={`${all.length} in total`} onClick={() => go({ page: "cases" })} />
        <Kpi label="Awaiting counsellor" icon={<UserRoundX aria-hidden />} value={unassigned.length} tone={unassigned.length ? "warn" : "neutral"} sub="unassigned open cases" onClick={() => go({ page: "cases" })} />
        <Kpi label="Awaiting Team Leader" icon={<ShieldCheck aria-hidden />} value={awaitingGate.length} tone={awaitingGate.length ? "info" : "neutral"} sub="gate 16 or 19 submitted" onClick={can("gate.write") ? () => go({ page: "approvals" }) : undefined} />
        <Kpi label="SLA breaches" icon={<AlarmClock aria-hidden />} value={breaches.length} tone={breaches.length ? "bad" : "ok"} sub={`${dueSoon.length} due within window`} onClick={can("escalation.view") ? () => go({ page: "escalations" }) : undefined} />
        <Kpi label="Documents to review" icon={<FileSearch aria-hidden />} value={docsPending} tone={docsPending ? "warn" : "neutral"} sub={`${docs.reworkPct}% rework rate`} />
        <Kpi label="On hold or deferred" icon={<PauseCircle aria-hidden />} value={hold.length} sub="waiting on funds or intake" />
        <Kpi label="Arrived this year" icon={<PlaneLanding aria-hidden />} value={arrivedYear.length} tone="ok" sub={lead != null ? `${lead} days enquiry to arrival` : "no arrivals recorded yet"} />
        <Kpi label="Exited" icon={<CircleAlert aria-hidden />} value={exited.length} sub={all.length ? `${Math.round((exited.length / all.length) * 100)}% of all cases` : "—"} />
      </div>

      {!mayRead && <Notice tone="neutral">Your role sees the overview tiles. The analytics.read permission opens the funnel, charts and caseload table.</Notice>}
      {mayRead && <>
      <div className="grid grid-3 stagger">
        <Panel title="Enquiry to arrival funnel">
          {all.length === 0 ? <Empty title="No cases yet" hint="The funnel fills as cases move through the nine stages." /> : <Funnel rows={funnel(all)} />}
          <p className="xs muted mt3">Conversion families per §11 of the process document. Drop percentages are stage to stage.</p>
        </Panel>
        <Panel title="Open cases by stage">
          {open.length === 0 ? <Empty title="No open cases" hint="Cases appear here as staff create them." /> : <HBars data={byStage} ariaLabel="Open cases by stage" tone={1} />}
        </Panel>
        <Panel title="Destination mix">
          {dest.length === 0 ? <Empty title="No destinations yet" /> : (
            <div className="flex g3 aic wrap">
              <Donut data={dest} title="Destination mix" size={150} stroke={24} centerLabel={String(dest.reduce((s, d) => s + d.n, 0))} centerSub="cases" />
              <div className="grow"><Legend data={dest} /></div>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-3 stagger">
        <Panel title="Twelve-month volume" className="span2" action={<span className="legend flex g3" style={{ flexDirection: "row" }}><span className="flex aic g1"><span className="sw" style={{ background: "var(--accent)" }} aria-hidden="true" />Enquiries</span><span className="flex aic g1"><span className="sw" style={{ background: "var(--accent-2)" }} aria-hidden="true" />Arrivals</span></span>}>
          <AreaChart labels={vol.labels} series={[{ name: "Enquiries", values: vol.enquiries }, { name: "Arrivals", values: vol.arrivals, tone: "info" }]} title="Twelve-month volume" />
        </Panel>
        <Panel title="Service levels">
          <div className="stack-sm">
            {sla.map((s) => {
              const pct = s.total ? Math.round((s.met / s.total) * 100) : null;
              return (
                <div key={s.id} className="flex aic g3">
                  <Ring pct={pct ?? 0} size={64} stroke={7} small tone={pct === null ? "" : pct >= 90 ? "ok" : pct >= 70 ? "" : "bad"} label={s.label} />
                  <div className="grow">
                    <p className="ui small strong">{s.label}</p>
                    <p className="xs muted">{s.total ? `${s.met} of ${s.total} met` : "No completed clocks yet"}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>

      <div className="grid grid-3 stagger">
        <Panel title="Counsellor caseload" flush className="span2">
          {counsellors.length === 0 ? <div className="panel-b"><Empty title="No counsellors yet" hint="Create counsellor profiles under Staff, then assign cases." action={can("staff.write") ? <button type="button" className="btn btn-primary btn-sm" onClick={() => go({ page: "staff" })}>Create a counsellor</button> : undefined} /></div> : (
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th scope="col">Counsellor</th><th scope="col">Load</th><th scope="col" className="right">Open</th><th scope="col" className="right">Gates</th><th scope="col" className="right">Docs</th><th scope="col" className="right">Breaches</th></tr></thead>
                <tbody>
                  {counsellors.map((u) => {
                    const mine = open.filter((c) => c.counsellorId === u.id);
                    const g = mine.filter((c) => ([16, 19] as const).some((x) => latestGate(c, x)?.status === "pending")).length;
                    const b = mine.filter((c) => slaFlags(c, config).some((f) => f.state === "breached")).length;
                    const d = mine.reduce((n, c) => n + pendingReviewCount(c), 0);
                    const max = Math.max(1, ...counsellors.map((x) => open.filter((c) => c.counsellorId === x.id).length));
                    return (
                      <tr key={u.id}>
                        <td><div className="flex aic g2"><Avatar name={u.name} size={30} /><div><p className="primary">{u.name}</p><p className="sub">{ROLE_LABEL[u.role]}{u.branch ? ` · ${u.branch}` : ""}</p></div></div></td>
                        <td style={{ minWidth: 120 }}><Bar pct={(mine.length / max) * 100} tone={b ? "bad" : "ink"} label={`${u.name} load`} /></td>
                        <td className="right tnum">{mine.length}</td>
                        <td className="right tnum">{g ? <Pill tone="info">{g}</Pill> : "—"}</td>
                        <td className="right tnum">{d ? <Pill tone="warn">{d}</Pill> : "—"}</td>
                        <td className="right tnum">{b ? <Pill tone="bad">{b}</Pill> : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <div className="stack">
          <Panel title="Enquiry channel">
            {channels.length === 0 ? <Empty title="No enquiries yet" /> : <HBars data={channels} ariaLabel="Enquiries by channel" tone={3} />}
          </Panel>
          {exits.length > 0 && <Panel title="Exits by coded reason"><HBars data={exits} ariaLabel="Exits by coded reason" tone={5} /></Panel>}
        </div>
      </div>

      </>}
      {can("audit.read") && (
        <Panel title="Recent activity" flush action={<button type="button" className="btn btn-ghost btn-sm" onClick={() => go({ page: "audit" })}>Audit log <ArrowRight aria-hidden /></button>}>
          {snap.audit.entries.length === 0 ? <div className="panel-b muted">No activity recorded yet.</div> : (
            <ul>
              {snap.audit.entries.slice(0, 8).map((e) => (
                <li key={e.id} className="flex wrap g2" style={{ padding: "11px 20px", borderBottom: "1px solid var(--hair)", fontSize: "var(--fs-sm)" }}>
                  <span className="ui xs muted nowrap" style={{ width: 118 }}>{fmtDateTime(e.at)}</span>
                  <span className="ui strong">{e.actorName}</span>
                  <span className="ink2">{e.action}{e.target ? ` — ${e.target}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      {user?.role === "team_leader" && <p className="xs muted">Signed in as Team Leader. Financial and visa file gates route to you under Approvals.</p>}
    </div>
  );
}

function CounsellorOverview() {
  const { cases, user, snap, go } = useSession();
  const config = snap.org.config;
  if (!user) return null;
  const mine = Object.values(cases).filter((c) => c.counsellorId === user.id && inCaseScope(config, user, c));
  const open = mine.filter((c) => c.status === "open");
  const breaches = open.filter((c) => slaFlags(c, config).some((f) => f.state === "breached"));
  const dueSoon = open.filter((c) => slaFlags(c, config).some((f) => f.state === "due-soon"));
  const gates = open.filter((c) => ([16, 19] as const).some((g) => latestGate(c, g)?.status === "pending"));
  const returned = open.filter((c) => ([16, 19] as const).some((g) => { const l = latestGate(c, g); return l?.status === "returned" && !l.addressedAt; }));
  const docs = open.reduce((n, c) => n + pendingReviewCount(c), 0);
  const arrived = mine.filter((c) => { const a = c.steps[30]?.values.arrivalDate; return typeof a === "string" && a.startsWith(String(new Date().getFullYear())) && c.steps[30]?.status === "done"; });
  const byStage = PIPELINE.map((p) => ({ label: `${p.n}. ${p.name}`, n: open.filter((c) => currentPipeline(c).id === p.id).length }));
  const dest = countBy(open, caseDestination).slice(0, 6);
  const attention: { c: CaseRecord; what: string; tone: "bad" | "warn" | "info" }[] = [];
  open.forEach((c) => {
    slaFlags(c, config).filter((f) => f.state !== "ok").forEach((f) => attention.push({ c, what: `${f.label} · ${f.days < 0 ? `${-f.days}d overdue` : f.days === 0 ? "due today" : `${f.days}d left`}`, tone: f.state === "breached" ? "bad" : "warn" }));
    ([16, 19] as const).forEach((g) => { const l = latestGate(c, g); if (l?.status === "returned" && !l.addressedAt) attention.push({ c, what: `Gate ${g} returned with suggestions`, tone: "bad" }); });
    const d = pendingReviewCount(c); if (d) attention.push({ c, what: `${d} document${d === 1 ? "" : "s"} awaiting your review`, tone: "info" });
    if (c.steps[2]?.studentSubmittedAt && c.steps[2]?.status !== "done") attention.push({ c, what: "Student submitted profile — confirm it", tone: "info" });
  });
  const order = { bad: 0, warn: 1, info: 2 };
  attention.sort((a, b) => order[a.tone] - order[b.tone]);
  const recent = mine.flatMap((c) => c.events.slice(0, 3).map((e) => ({ c, e }))).sort((a, b) => b.e.at.localeCompare(a.e.at)).slice(0, 8);

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>My dashboard</h1><p>{user.name} · {open.length} open case{open.length === 1 ? "" : "s"} of {mine.length} assigned</p></div>
        <div className="actions"><button type="button" onClick={() => go({ page: "cases" })} className="btn btn-secondary">My caseload <ArrowRight aria-hidden /></button></div>
      </div>
      <div className="grid grid-4 stagger">
        <Kpi label="Active cases" icon={<FolderOpen aria-hidden />} value={open.length} sub="assigned to me" onClick={() => go({ page: "cases" })} />
        <Kpi label="SLA breaches" icon={<AlarmClock aria-hidden />} value={breaches.length} tone={breaches.length ? "bad" : "ok"} sub={`${dueSoon.length} due within window`} />
        <Kpi label="Awaiting Team Leader" icon={<ShieldCheck aria-hidden />} value={gates.length} tone={gates.length ? "info" : "neutral"} sub={returned.length ? `${returned.length} returned to address` : "gates 16 and 19"} />
        <Kpi label="Documents to review" icon={<FileSearch aria-hidden />} value={docs} tone={docs ? "warn" : "neutral"} sub={`${arrived.length} arrived this year`} />
      </div>
      <div className="grid grid-3 stagger">
        <Panel title="Needs attention" className="span2" flush>
          {attention.length === 0 ? <div className="panel-b"><Empty title="Nothing needs attention" hint="Service level clocks, returned gates and unreviewed documents appear here." /></div> : (
            <ul>
              {attention.slice(0, 10).map(({ c, what, tone }, i) => (
                <li key={c.id + i} className="flex aic g2 wrap" style={{ padding: "11px 20px", borderBottom: "1px solid var(--hair)" }}>
                  <Pill tone={tone}>{tone === "bad" ? "Overdue" : tone === "warn" ? "Due soon" : "Review"}</Pill>
                  <button type="button" className="row-btn ui small" onClick={() => go({ page: "case", caseId: c.id })}>{c.ref}</button>
                  <span className="ui small ink2">{c.student.name}</span>
                  <span className="small muted grow">{what}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Caseload by stage">
          {open.length === 0 ? <Empty title="No open cases" /> : <HBars data={byStage.filter((s) => s.n > 0)} ariaLabel="My caseload by stage" tone={1} />}
        </Panel>
      </div>
      <div className="grid grid-3 stagger">
        <Panel title="My funnel">
          {mine.length === 0 ? <Empty title="No cases assigned yet" /> : <Funnel rows={funnel(mine)} />}
        </Panel>
        <Panel title="Destinations in my caseload">
          {dest.length === 0 ? <Empty title="No destinations yet" /> : <div className="flex g3 aic wrap"><Donut data={dest} title="Destinations in my caseload" size={140} stroke={22} centerSub="cases" /><div className="grow"><Legend data={dest} /></div></div>}
        </Panel>
        <Panel title="Recent activity on my cases" flush>
          {recent.length === 0 ? <div className="panel-b muted">No activity yet.</div> : (
            <ul>
              {recent.map(({ c, e }) => (
                <li key={e.id} style={{ padding: "10px 20px", borderBottom: "1px solid var(--hair)", fontSize: "var(--fs-sm)" }}>
                  <p className="truncate">{e.text}</p>
                  <p className="ui xs muted">{c.ref} · {fmtDateTime(e.at)} · {e.byName}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      {open.length > 0 && (
        <Panel title="Where each case stands" flush>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th scope="col">Case</th><th scope="col">Destination</th><th scope="col">Current step</th><th scope="col">Progress</th><th scope="col">Status</th></tr></thead>
              <tbody>
                {open.slice(0, 12).map((c) => { const n = currentStep(c); const p = caseProgress(c); const stage = currentPipeline(c); return (
                  <tr key={c.id} className="row-link" onClick={() => go({ page: "case", caseId: c.id })}>
                    <td><button type="button" className="row-btn" onClick={(e) => { e.stopPropagation(); go({ page: "case", caseId: c.id }); }}>{c.ref}</button><p className="sub">{c.student.name}</p></td>
                    <td>{caseDestination(c)}</td>
                    <td>{n ? `${n}. ${STEP_BY_N[n].title}` : "Complete"}<p className="sub">Stage {stage.n} of 9</p></td>
                    <td style={{ minWidth: 150 }}><div className="flex aic g2"><Bar pct={p.pct} tone="" label={`${c.ref} progress`} /><span className="ui xs tnum" style={{ width: 34 }}>{p.pct}%</span></div></td>
                    <td><Pill tone={statusTone(c.status)}>{c.status === "open" ? "Open" : c.status}</Pill></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
