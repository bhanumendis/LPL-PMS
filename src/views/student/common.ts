/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { STEP_BY_N } from "@/lib/spine";
import type { CaseRecord } from "@/lib/types";

export const COUNSELLOR_RECORDS = "Your counsellor records this step.";

/** The student-facing view of the case timeline: internal review commentary is withheld, step names use student wording. */
export function studentView(c: CaseRecord): CaseRecord {
  const events = c.events.flatMap((e) => {
    const title = e.step ? STEP_BY_N[e.step].studentTitle : "";
    if (e.type === "gate") {
      if (/approved/i.test(e.text)) return [{ ...e, text: `Internal review completed${title ? ` — ${title}` : ""}`, byName: "Lyceum Placements" }];
      if (/returned|addressed/i.test(e.text)) return [];
      return [{ ...e, text: `Internal review started${title ? ` — ${title}` : ""}`, byName: "Lyceum Placements" }];
    }
    if (e.type === "step") return [{ ...e, text: title ? (/not applicable/i.test(e.text) ? `Not required — ${title}` : /reopened/i.test(e.text) ? `Reopened — ${title}` : title) : e.text }];
    if (e.type === "loop") return [{ ...e, text: title ? `Updated — ${title}` : "Your case was updated", byName: "Lyceum Placements" }];
    return [e];
  });
  return { ...c, events };
}
