/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { useMemo } from "react";
import { useSession } from "@/App";
import { retentionPolicy } from "@/lib/logic";
import { StatStrip, type Stat } from "@/lib/ui";
import type { OrgConfig } from "@/lib/types";
import type { DashboardSummary } from "@/lib/summary";

export function ComplianceStrip({ dashboard: d, config }: { dashboard: DashboardSummary; config: OrgConfig }) {
  const { go } = useSession();
  const stats = useMemo<Stat[]>(() => {
    const summary = d.retention;
    const policy = retentionPolicy(config);
    const gaps = d.compliance.unsafeguarded;
    const transfers = d.compliance.transfers;
    const consent = { pct: d.compliance.consentPct, covered: d.compliance.consentCovered, total: d.compliance.consentTotal };
    return [
      { id: "retention", label: "Retention overdue", value: summary.overdue, tone: summary.overdue ? "bad" : "ok", sub: summary.due_soon ? `${summary.due_soon} due within ${policy.warnDays} days` : "none due soon", onClick: () => go({ page: "dataprotection", id: "retention" }) },
      { id: "gaps", label: "Transfers without a safeguard", value: gaps, tone: gaps ? "bad" : "ok", sub: `${transfers} transfer${transfers === 1 ? "" : "s"} logged`, onClick: () => go({ page: "dataprotection", id: "register" }) },
      { id: "consent", label: "Consent recorded", value: `${consent.pct}%`, tone: consent.pct >= 95 ? "ok" : "warn", sub: `${consent.covered} of ${consent.total} profiled cases`, onClick: () => go({ page: "dataprotection", id: "retention" }) },
    ];
  }, [d, config, go]);
  return <StatStrip stats={stats} label="Compliance" className="compact" />;
}
