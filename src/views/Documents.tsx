/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import React, { useRef, useState } from "react";
import { Upload, Check, RotateCcw, FileText, Image as ImageIcon, Download, Trash2 } from "lucide-react";
import { useSession } from "@/App";
import { store } from "@/lib/store";
import { STEP_BY_N } from "@/lib/spine";
import { addDocument, reviewDocument, removeDocument, docsForStep, fmtDateTime } from "@/lib/logic";
import { Pill, statusTone, Modal, useToast, TextArea } from "@/lib/ui";
import type { CaseRecord, DocItem } from "@/lib/types";

const fmtSize = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const DOC_STATUS: Record<string, string> = { uploaded: "Awaiting review", accepted: "Accepted", rejected: "Returned" };
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
const MAX = 25 * 1048576;
/** One file per upload. A replacement supersedes the previous file; it never sits beside it. */
const MAX_FILES = 1;

export function DocumentChecklist({ c, step, canUpload, canReview, canDownload = false, canDelete = false, canRead = true, compact = false }: { c: CaseRecord; step: 10 | 15; canUpload: boolean; canReview: boolean; canDownload?: boolean; canDelete?: boolean; canRead?: boolean; compact?: boolean }) {
  const { user, log } = useSession();
  const toast = useToast();
  const def = STEP_BY_N[step];
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingKind, setPendingKind] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [review, setReview] = useState<{ d: DocItem; accept: boolean } | null>(null);
  const [removing, setRemoving] = useState<DocItem | null>(null);
  const [note, setNote] = useState("");
  const workable = c.status === "open";
  const kindLabel = (kind: string) => def.docs?.find((k) => k.id === kind)?.label ?? kind;

  const accept = async (kind: string, file: File) => {
    if (!user) return;
    if (file.size > MAX) { toast("That file is larger than 25 MB", "bad"); return; }
    const ok = /\.(pdf|jpe?g|png|docx?)$/i.test(file.name);
    if (!ok) { toast("Upload a PDF, JPG, PNG or Word file", "bad"); return; }
    await store.mutateCase(c.id, (x) => addDocument(x, step, kind, { name: file.name, size: file.size, type: file.type }, user));
    await log("Document uploaded", c.ref, `${kindLabel(kind)} — ${file.name}`);
    toast(`${file.name} uploaded`);
  };
  const pick = (kind: string) => { setPendingKind(kind); fileRef.current?.click(); };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !pendingKind) return;
    await accept(pendingKind, file);
    setPendingKind(null);
  };
  const onDrop = async (e: React.DragEvent, kind: string) => {
    e.preventDefault(); setOver(null);
    if (e.dataTransfer.files.length > MAX_FILES) { toast("Upload one file at a time", "bad"); return; }
    const file = e.dataTransfer.files[0];
    if (file) await accept(kind, file);
  };
  const decide = async () => {
    if (!review || !user) return;
    if (!review.accept && !note.trim()) return;
    await store.mutateCase(c.id, (x) => reviewDocument(x, review.d.id, review.accept, note.trim(), user));
    await log(review.accept ? "Document accepted" : "Document returned", c.ref, review.d.fileName);
    toast(review.accept ? "Document accepted" : "Document returned to the student");
    setReview(null); setNote("");
  };
  const remove = async () => {
    if (!removing || !user) return;
    const d = removing;
    await store.mutateCase(c.id, (x) => removeDocument(x, d.id, user));
    await log("Document removed", c.ref, `${kindLabel(d.kind)} — ${d.fileName}`);
    toast("Document removed");
    setRemoving(null);
  };

  const kinds = def.docs ?? [];
  const acceptedCount = kinds.filter((k) => docsForStep(c, step).some((d) => d.kind === k.id && d.status === "accepted")).length;
  const safeUrl = (u?: string) => { if (!u) return false; try { const x = new URL(u); return x.protocol === "https:" && /\.supabase\.(co|in)$/.test(x.hostname); } catch { return false; } };
  const downloadLink = (d: DocItem) => (
    <a className="btn btn-ghost btn-sm" href={d.url} target="_blank" rel="noopener noreferrer" download><Download aria-hidden />Download<span className="sr-only"> {d.fileName}</span></a>
  );

  return (
    <div>
      <input ref={fileRef} type="file" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={onFile} accept={ACCEPT} multiple={false} />
      <div className="flex aic jcb g2 mb2">
        <p className="ui xs muted">{acceptedCount} of {kinds.length} document types accepted · one file per document · PDF, JPG, PNG or Word up to 25 MB</p>
      </div>
      <ul className="panel solid" style={{ borderRadius: 14 }}>
        {kinds.map((k) => {
          const items = docsForStep(c, step).filter((d) => d.kind === k.id).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
          const latest = items[0];
          const accepted = items.some((d) => d.status === "accepted");
          const canDrop = canUpload && workable && !accepted;
          return (
            <li key={k.id} className={`doc-row ${over === k.id ? "over" : ""}`} onDragOver={canDrop ? (e) => { e.preventDefault(); setOver(k.id); } : undefined} onDragLeave={canDrop ? () => setOver(null) : undefined} onDrop={canDrop ? (e) => onDrop(e, k.id) : undefined} style={over === k.id ? { background: "var(--accent-soft)" } : undefined}>
              <div className="grow" style={{ minWidth: 200 }}>
                <p className="d-name">{k.label}{k.required && <span style={{ color: "var(--exit)" }} aria-hidden="true"> *</span>}{k.required && <span className="sr-only"> (required)</span>}</p>
                {k.hint && <p className="d-hint">{k.hint}</p>}
                {latest && !compact && canRead && (
                  <ul>
                    {items.slice(0, 3).map((d) => (
                      <li key={d.id} className="doc-file">
                        <span className="flex aic g1" style={{ minWidth: 0 }}>{/image/.test(d.mime) ? <ImageIcon aria-hidden style={{ width: 14, height: 14, color: "var(--muted)" }} /> : <FileText aria-hidden style={{ width: 14, height: 14, color: "var(--muted)" }} />}<span className="truncate" style={{ maxWidth: 260 }}>{d.fileName}</span><span className="muted nowrap">· {fmtSize(d.size)} · {fmtDateTime(d.uploadedAt)}</span></span>
                        <span className="flex aic g1 wrap">
                          {d.status === "rejected" && d.reviewNote && <span style={{ color: "var(--exit)" }}>Returned: {d.reviewNote}</span>}
                          {d.status === "accepted" && <span style={{ color: "var(--green-text)" }}>Accepted {fmtDateTime(d.reviewedAt)}</span>}
                          {canDownload && safeUrl(d.url) && downloadLink(d)}
                          {canReview && workable && d.status === "uploaded" && (
                            <>
                              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setReview({ d, accept: true }); setNote(""); }}><Check aria-hidden />Accept<span className="sr-only"> {d.fileName}</span></button>
                              <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => { setReview({ d, accept: false }); setNote(""); }}><RotateCcw aria-hidden />Return<span className="sr-only"> {d.fileName}</span></button>
                            </>
                          )}
                          {canDelete && workable && d.status !== "accepted" && (
                            <button type="button" className="btn btn-danger-ghost btn-sm" onClick={() => setRemoving(d)}><Trash2 aria-hidden />Remove<span className="sr-only"> {d.fileName}</span></button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {latest && compact && latest.status === "rejected" && latest.reviewNote && <p className="xs mt1" style={{ color: "var(--exit)" }}>Returned: {latest.reviewNote}</p>}
                {latest && compact && latest.status !== "rejected" && <p className="xs muted mt1">{latest.fileName} · {fmtSize(latest.size)}</p>}
              </div>
              <div className="flex aic g2">
                {accepted ? <Pill tone="ok" icon={<Check aria-hidden />}>Accepted</Pill> : latest ? <Pill tone={statusTone(latest.status)}>{DOC_STATUS[latest.status]}</Pill> : <Pill>Not uploaded</Pill>}
                {compact && canDownload && latest && safeUrl(latest.url) && downloadLink(latest)}
                {canDrop && <button type="button" className="btn btn-secondary btn-sm" onClick={() => pick(k.id)} aria-label={`${latest ? "Replace" : "Upload"} ${k.label}`}><Upload aria-hidden />{latest ? "Replace" : "Upload"}</button>}
              </div>
            </li>
          );
        })}
      </ul>
      {review && (
        <Modal open onClose={() => setReview(null)} title={review.accept ? "Accept document" : "Return document"} width={460}>
          <p className="ui small mb3">{review.d.fileName}</p>
          <TextArea label={review.accept ? "Note (optional)" : "Reason for return"} required={!review.accept} value={note} onChange={setNote} rows={3} placeholder={review.accept ? "" : "Tell the student what to fix before re-uploading"} />
          <div className="modal-f"><button type="button" className="btn btn-secondary" onClick={() => setReview(null)}>Cancel</button><button type="button" className={review.accept ? "btn btn-primary" : "btn btn-danger"} disabled={!review.accept && !note.trim()} onClick={decide}>{review.accept ? "Accept" : "Return to student"}</button></div>
        </Modal>
      )}
      {removing && (
        <Modal open onClose={() => setRemoving(null)} title="Remove document" subtitle={removing.fileName} width={440}>
          <p className="ui small">Remove <b>{kindLabel(removing.kind)}</b> from the checklist? The file comes off the case and the removal is recorded on the timeline. A new file can be uploaded in its place.</p>
          <div className="modal-f"><button type="button" className="btn btn-secondary" onClick={() => setRemoving(null)}>Cancel</button><button type="button" className="btn btn-danger" onClick={remove}><Trash2 aria-hidden />Remove</button></div>
        </Modal>
      )}
    </div>
  );
}
