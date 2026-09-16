/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * The student's home: where you are, what we need from you, who is helping, what changed.
 */
import { Phone, Mail, ArrowRight, Sparkles, CalendarClock } from "lucide-react";
import { useSession } from "@/App";
import { stepState, fmtDate, fmtMonth, caseDestination, caseProgramme } from "@/lib/logic";
import { Pill, statusTone, STATUS_LABEL, Panel, Notice, Avatar, PageHeader } from "@/lib/ui";
import { Timeline } from "@/views/CaseWorkspace";
import type { CaseRecord } from "@/lib/types";
import { studentView } from "@/views/student/common";
import { StudentHero, StudentTasks } from "./sections/StudentSections";
import { greeting } from "./greeting";

export function StudentHome({ c }: { c: CaseRecord }) {
  const { users, go, user } = useSession();
  const owner = c.counsellorId ? users[c.counsellorId] : undefined;
  const s6 = stepState(c, 6), s13 = stepState(c, 13), s14 = stepState(c, 14), s21 = stepState(c, 21), s27 = stepState(c, 27), s28 = stepState(c, 28), s30 = stepState(c, 30);
  const lapse = s13.values.offerLapseDate as string | undefined;
  const facts: { label: string; value: string }[] = [];
  if (s14.status === "done") facts.push({ label: "University", value: `${s14.values.university} — ${s14.values.programme}, ${s14.values.country}` });
  else if (s6.status === "done") facts.push({ label: "Programme and destination", value: `${String(s6.values.programmes ?? "").split("\n")[0]} · ${(s6.values.countries as string[] | undefined)?.join(", ")}` });
  if (s13.values.commencementDate) facts.push({ label: "Commencement", value: fmtDate(String(s13.values.commencementDate)) });
  if (lapse && s14.status !== "done") facts.push({ label: "Offer lapse date", value: fmtDate(lapse) });
  if (s21.status === "done") facts.push({ label: `${s21.values.docType} issued`, value: `${s21.values.reference} · ${fmtDate(String(s21.values.receivedDate))}` });
  if (s27.status === "done") facts.push({ label: "Visa", value: `${s27.values.outcome} · ${fmtDate(String(s27.values.decisionDate))}` });
  if (s28.values.travelDate) facts.push({ label: "Travel date", value: fmtDate(String(s28.values.travelDate)) });
  if (s30.values.briefingDate) facts.push({ label: "Pre-departure briefing", value: fmtDate(String(s30.values.briefingDate)) });

  return (
    <div className="stack home-page">
      <PageHeader className="home-greeting" title={greeting(user?.name ?? c.student.name)} context={<>{c.ref} · {caseDestination(c)} · {caseProgramme(c)} · opened {fmtDate(c.createdAt)}</>} actions={<Pill tone={statusTone(c.status)}>{STATUS_LABEL[c.status]}</Pill>} />
      {c.status === "hold" && <Notice tone="warn">Your application is on hold{c.hold?.reviewDate ? ` and will be reviewed on ${fmtDate(c.hold.reviewDate)}` : ""}. Your counsellor will contact you.</Notice>}
      {c.status === "deferred" && <Notice tone="gold">Your intake has been deferred{c.hold?.intake ? ` to ${fmtMonth(c.hold.intake)}` : ""}. Your counsellor will contact you ahead of the new intake.</Notice>}
      {c.status === "exited" && <Notice tone="neutral">This application is closed. Contact Lyceum Placements if you would like to reopen it.</Notice>}
      {c.status === "completed" && <Notice tone="ok">Your placement is complete. Thank you for choosing Lyceum Placements.</Notice>}

      <StudentHero c={c} />

      <div className="home">
        <div className="home-main">
          <Panel title="What we need from you">
            <StudentTasks c={c} />
          </Panel>
          {facts.length > 0 && (
            <Panel title="Key details">
              <dl className="form-grid">{facts.map((f) => <div key={f.label}><dt className="ui xs muted">{f.label}</dt><dd className="ui small" style={{ margin: 0 }}>{f.value}</dd></div>)}</dl>
            </Panel>
          )}
        </div>
        <div className="home-side">
          <Panel title="Your counsellor">
            {owner ? (
              <div className="flex g3" style={{ alignItems: "flex-start" }}>
                <Avatar name={owner.name} size={48} />
                <div className="small">
                  <p className="ui strong">{owner.name}</p>
                  <p className="muted">{owner.branch ? `${owner.branch} office` : "Lyceum Placements"}</p>
                  {owner.email && <p className="mt2 flex aic g1"><Mail aria-hidden style={{ width: 14, height: 14, color: "var(--muted)" }} /><a href={`mailto:${owner.email}`}>{owner.email}</a></p>}
                  {owner.phone && <p className="flex aic g1"><Phone aria-hidden style={{ width: 14, height: 14, color: "var(--muted)" }} /><a href={`tel:${owner.phone}`}>{owner.phone}</a></p>}
                </div>
              </div>
            ) : <p className="ink2">A counsellor will be assigned to your case shortly. You can complete your profile in the meantime.</p>}
          </Panel>
          <Panel title="Recent updates">
            <Timeline c={studentView(c)} limit={5} />
            <button type="button" className="btn btn-ghost btn-sm mt2" onClick={() => go({ page: "journey" })}>Full journey <ArrowRight aria-hidden /></button>
          </Panel>
          {facts.length === 0 && (
            <Panel title="Service levels that protect you">
              <ul className="stack-sm small ink2">
                <li className="flex g2"><CalendarClock aria-hidden style={{ width: 16, height: 16, color: "var(--accent-text)", flexShrink: 0, marginTop: 3 }} /><span>Your Course Information Sheet is sent within 7 days of your profile being confirmed.</span></li>
                <li className="flex g2"><CalendarClock aria-hidden style={{ width: 16, height: 16, color: "var(--accent-text)", flexShrink: 0, marginTop: 3 }} /><span>Three reminders go to you and your counsellor from 21 days before an offer lapses.</span></li>
                <li className="flex g2"><Sparkles aria-hidden style={{ width: 16, height: 16, color: "var(--accent-text)", flexShrink: 0, marginTop: 3 }} /><span>We check in three months after you arrive.</span></li>
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
