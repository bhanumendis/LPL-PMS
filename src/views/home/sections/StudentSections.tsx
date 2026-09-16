/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Student home sections: the "where you are now" hero and the "what we need from you" list.
 */
import { ArrowRight } from "lucide-react";
import { useSession } from "@/App";
import { STEP_BY_N, ORDERED_STEP_NUMBERS, pipelineOfStep } from "@/lib/spine";
import { studentTasks, pipelineProgress, currentPipeline, stepState, fmtDate, daysUntil, currentStep, caseProgress, caseDestination } from "@/lib/logic";
import { Pill, Notice } from "@/lib/ui";
import { Ring, StageTrack } from "@/lib/charts";
import type { CaseRecord } from "@/lib/types";

export function StudentHero({ c }: { c: CaseRecord }) {
  const prog = pipelineProgress(c);
  const stage = currentPipeline(c);
  const cur = currentStep(c);
  const p = caseProgress(c);
  const nextIdx = cur ? ORDERED_STEP_NUMBERS.indexOf(cur) : -1;
  const nextStep = nextIdx >= 0 ? ORDERED_STEP_NUMBERS.slice(nextIdx + 1).find((n) => !STEP_BY_N[n].optional) : undefined;
  return (
    <section className="surface hero-card" aria-label="Where you are now">
      <div className="hero">
        <Ring pct={p.pct} size={176} stroke={13} tone={c.status === "completed" ? "ok" : ""} label="Your progress" sub={`${p.done} of ${p.applicable} steps`} />
        <div className="hero-txt">
          <p className="ui xs muted" style={{ letterSpacing: ".04em" }}>Where you are now</p>
          <h2>{c.status === "completed" ? "Placement complete" : stage.studentName}</h2>
          <p className="ink2">{cur ? STEP_BY_N[cur].studentTitle : "Every step has been recorded."}{cur && STEP_BY_N[cur].studentAction ? " — this one needs you." : ""}</p>
          <div className="flex wrap g1">
            {cur && <Pill tone="warn">Stage {stage.n} of 9 · {STEP_BY_N[cur].studentTitle}</Pill>}
            {cur && STEP_BY_N[cur].gate && <Pill tone="info">Under internal review</Pill>}
            <Pill tone="neutral">{caseDestination(c)}</Pill>
          </div>
          {nextStep && <div className="next-box"><p className="nb-label">Coming next</p><p><b className="ui">{STEP_BY_N[nextStep].studentTitle}</b> · {pipelineOfStep(nextStep).studentName}</p></div>}
        </div>
      </div>
      <div className="mt4"><StageTrack prog={prog} labels="name" /></div>
      <p className="xs muted mt2">Completion is measured against the {p.applicable} steps that apply to your case, across 9 stages.</p>
    </section>
  );
}

export function StudentTasks({ c }: { c: CaseRecord }) {
  const { go } = useSession();
  const tasks = studentTasks(c);
  const s13 = stepState(c, 13), s14 = stepState(c, 14);
  const lapse = s13.values.offerLapseDate as string | undefined;
  const lapseDays = lapse ? daysUntil(new Date(lapse)) : null;
  return (
    <>
      {tasks.length === 0 ? <p className="ink2">Nothing is required from you right now. Your counsellor is working on the next step.</p> : (
        <ul className="stack-sm">
          {tasks.map((t) => (
            <li key={t.id} className={`task ${t.tone}`}>
              <span><span className="t-title" style={{ display: "block" }}>{t.label}</span>{t.detail && <span className="t-detail">{t.detail}</span>}</span>
              {t.step === 2 && <button type="button" className="btn btn-primary btn-sm" onClick={() => go({ page: "profile" })}>Open profile <ArrowRight aria-hidden /></button>}
              {(t.step === 10 || t.step === 15) && <button type="button" className="btn btn-primary btn-sm" onClick={() => go({ page: "documents" })}>Open documents <ArrowRight aria-hidden /></button>}
              {(t.step === 26 || t.step === 29) && <button type="button" className="btn btn-primary btn-sm" onClick={() => go({ page: "journey", step: t.step })}>Confirm <ArrowRight aria-hidden /></button>}
              {(t.step === 13 || t.step === 22) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => go({ page: "journey" })}>View</button>}
            </li>
          ))}
        </ul>
      )}
      {lapseDays !== null && s14.status !== "done" && lapseDays >= 0 && lapseDays <= 21 && <div className="mt3"><Notice tone="warn">Your offer lapses in {lapseDays} day{lapseDays === 1 ? "" : "s"} ({fmtDate(lapse)}). Confirm your choice with your counsellor.</Notice></div>}
    </>
  );
}
