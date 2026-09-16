/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { Check } from "lucide-react";
import { useSession } from "@/App";
import { derivedStatus } from "@/lib/logic";
import { Pill, Panel, PageHeader } from "@/lib/ui";
import { DocumentChecklist } from "@/views/Documents";
import type { CaseRecord } from "@/lib/types";

export function DocumentsPage({ c }: { c: CaseRecord }) {
  const { can } = useSession();
  const canWrite = can("document.write");
  const canDownload = can("document.download");
  const d10 = derivedStatus(c, 10), d15 = derivedStatus(c, 15);
  const section = (n: 10 | 15, d: string, title: string, intro: string, lockedMsg: string) => (
    <Panel title={title} action={d === "done" ? <Pill tone="ok" icon={<Check aria-hidden />}>Accepted</Pill> : d === "active" ? <Pill tone="warn">Open</Pill> : <Pill>Not yet open</Pill>}>
      {d === "locked" ? <p className="ink2">{lockedMsg}</p> : (
        <>
          <p className="small muted mb3">{intro} {d === "done" ? "This set has been accepted." : canWrite ? "Upload one PDF, JPG, PNG or Word file per document, up to 25 MB, or drag a file onto a row. Returned documents show the reason and can be replaced." : "Your counsellor uploads documents on your behalf. Returned documents show the reason."}</p>
          <DocumentChecklist c={c} step={n} canUpload={c.status === "open" && d !== "done" && canWrite} canReview={false} canDownload={canDownload} compact />
        </>
      )}
    </Panel>
  );
  return (
    <div className="stack">
      <PageHeader title="Documents" context="Everything you upload is reviewed by your counsellor. Accepted documents are shared with universities and visa authorities as required." />
      {section(10, d10, "University application documents", "Required for your applications.", "Your counsellor will open this list once your programme and destination are confirmed and the document checklist has been issued.")}
      {section(15, d15, "Visa file documents", "Required for financial verification and your visa file.", "Your counsellor will open this list once an offer has been received.")}
    </div>
  );
}
