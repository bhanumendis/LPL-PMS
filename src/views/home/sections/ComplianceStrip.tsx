/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { useMemo } from "react";
import { useSession } from "@/App";
import { consentCoverage, retentionPolicy, retentionSummary, unsafeguardedTransfers, allTransfers } from "@/lib/logic";
import { StatStrip, type Stat } from "@/lib/ui";
import type { CaseRecord, OrgConfig } from "@/lib/types";

export function ComplianceStrip({ cases, config }: { cases: CaseRecord[]; config: OrgConfig }) {
  const { go } = useSession();
  const stats = useMemo<Stat[]>(() => {
    const summary = retentionSummary(cases, config);
    const policy = retentionPolicy(config);
    const gaps = unsafeguardedTransfers(cases);
    const transfers = allTransfers(cases).length;
    const consent = consentCoverage(cases);
    return [
      { id: "retention", label: "Retention overdue", value: summary.overdue, tone: summary.overdue ? "bad" : "ok", sub: summary.due_soon ? `${summary.due_soon} due within ${policy.warnDays} days` : "none due soon", onClick: () => go({ page: "dataprotection", id: "retention" }) },
      { id: "gaps", label: "Transfers without a safeguard", value: gaps, tone: gaps ? "bad" : "ok", sub: `${transfers} transfer${transfers === 1 ? "" : "s"} logged`, onClick: () => go({ page: "dataprotection", id: "register" }) },
      { id: "consent", label: "Consent recorded", value: `${consent.pct}%`, tone: consent.pct >= 95 ? "ok" : "warn", sub: `${consent.covered} of ${consent.total} profiled cases`, onClick: () => go({ page: "dataprotection", id: "retention" }) },
    ];
  }, [cases, config, go]);
  return <StatStrip stats={stats} label="Compliance" className="compact" />;
}
