/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Prompt Engineer Workspace. An isolated, Administrator-only area for authoring, previewing
 * and versioning prompt templates. Nothing here calls a model or any external API: the
 * preview is a plain string substitution done in the browser.
 */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Plus, Upload, Download, Save, Copy, Trash2, RotateCcw } from "lucide-react";
import { useSession } from "@/App";
import { store, uid, nowIso } from "@/lib/store";
import { fmtDateTime } from "@/lib/logic";
import { Panel, Empty, Pill, Notice, Modal, TextField, SelectField, TextArea, Field, useToast, type Tone } from "@/lib/ui";
import type { PromptStatus, PromptTemplate, PromptVersion, User } from "@/lib/types";

const STATUSES: PromptStatus[] = ["draft", "review", "approved", "retired"];
const STATUS_LABEL: Record<PromptStatus, string> = { draft: "Draft", review: "In review", approved: "Approved", retired: "Retired" };
const STATUS_TONE: Record<PromptStatus, Tone> = { draft: "neutral", review: "warn", approved: "ok", retired: "bad" };
const MODEL_SUGGESTIONS = ["claude-fable-5-1", "claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5-20251001"];
const VAR_RE = /{{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*}}/g;
const HISTORY_CAP = 50;

// ---------- pure helpers ----------

function variablesOf(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(VAR_RE)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
function previewNodes(body: string, inputs: Record<string, string>): React.ReactNode[] {
  const out: React.ReactNode[] = []; let last = 0; let k = 0;
  for (const m of body.matchAll(VAR_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(body.slice(last, at));
    const v = inputs[m[1]];
    out.push(v ? v : <mark key={k++}>{m[0]}</mark>);
    last = at + m[0].length;
  }
  if (last < body.length) out.push(body.slice(last));
  return out;
}
const toStatus = (v: unknown): PromptStatus => STATUSES.find((s) => s === v) ?? "draft";
/** Blank input means "use the default", never zero. */
const blank = (v: unknown): boolean => v == null || (typeof v === "string" && v.trim() === "");
const toTemperature = (v: unknown): number => { if (blank(v)) return 0.2; const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.2; };
const toMaxTokens = (v: unknown): number => { if (blank(v)) return 1024; const n = Math.floor(typeof v === "number" ? v : Number(v)); return Number.isFinite(n) && n >= 1 ? n : 1024; };
const toStrings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const parseTags = (s: string): string[] => Array.from(new Set(s.split(",").map((t) => t.trim()).filter(Boolean)));
function toInputs(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (typeof x === "string") out[k] = x;
  return out;
}
function toHistory(v: unknown): PromptVersion[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((h): PromptVersion[] => {
    if (!h || typeof h !== "object") return [];
    const o = h as Record<string, unknown>;
    if (typeof o.version !== "number" || typeof o.at !== "string" || typeof o.body !== "string") return [];
    return [{ version: o.version, at: o.at, by: typeof o.by === "string" ? o.by : "", byName: typeof o.byName === "string" ? o.byName : "Unknown", body: o.body, note: typeof o.note === "string" && o.note ? o.note : undefined }];
  }).slice(-HISTORY_CAP);
}
/** Accepts one exported template of unknown shape and returns a well-formed record, or null when it is not a template. */
function parseTemplate(v: unknown, user: User, at: string): PromptTemplate | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.title !== "string" || typeof o.body !== "string") return null;
  return {
    id: o.id, title: o.title, description: typeof o.description === "string" ? o.description : "", model: typeof o.model === "string" ? o.model : "",
    temperature: toTemperature(o.temperature), maxTokens: toMaxTokens(o.maxTokens), tags: toStrings(o.tags), status: toStatus(o.status), body: o.body,
    sampleInputs: toInputs(o.sampleInputs), version: typeof o.version === "number" && o.version >= 1 ? Math.floor(o.version) : 1, history: toHistory(o.history),
    createdAt: typeof o.createdAt === "string" ? o.createdAt : at, createdBy: typeof o.createdBy === "string" ? o.createdBy : user.id, updatedAt: at, updatedBy: user.id,
  };
}
function blankTemplate(user: User): PromptTemplate {
  const at = nowIso();
  return { id: uid(), title: "Untitled template", description: "", model: "", temperature: 0.2, maxTokens: 1024, tags: [], status: "draft", body: "", sampleInputs: {}, version: 1, history: [], createdAt: at, updatedAt: at, createdBy: user.id, updatedBy: user.id };
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "template";

// ---------- editor draft ----------

interface Draft { title: string; description: string; model: string; temperature: string; maxTokens: string; tags: string; status: PromptStatus; body: string; sampleInputs: Record<string, string>; note: string }
const draftOf = (t: PromptTemplate): Draft => ({ title: t.title, description: t.description, model: t.model, temperature: String(t.temperature), maxTokens: String(t.maxTokens), tags: t.tags.join(", "), status: t.status, body: t.body, sampleInputs: { ...t.sampleInputs }, note: "" });
const sameDraft = (a: Draft, b: Draft) => JSON.stringify({ ...a, note: "" }) === JSON.stringify({ ...b, note: "" });

// ---------- page ----------

export function PromptEngineerPage() {
  const { isAdmin, user, snap, route, go, log } = useSession();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | PromptStatus>("all");
  const [confirm, setConfirm] = useState<PromptTemplate | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const filterId = useId();
  if (!isAdmin || !user) return <div className="panel"><div className="panel-b"><h2>Not permitted</h2><p className="muted mt1">The Prompt Engineer Workspace is available to the Administrator only.</p></div></div>;

  const prompts = Object.values(snap.prompts.prompts).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const needle = q.trim().toLowerCase();
  const list = prompts.filter((p) => (filter === "all" || p.status === filter) && (!needle || [p.title, p.description, p.model, p.tags.join(" ")].join(" ").toLowerCase().includes(needle)));
  const selected = route.id ? snap.prompts.prompts[route.id] : undefined;
  const select = (id?: string) => go({ page: "prompts", id });

  const create = async () => {
    const t = blankTemplate(user);
    await store.mutatePrompts((s) => { s.prompts[t.id] = t; return s; });
    await log("Prompt template created", t.title, t.id);
    toast("Template created");
    select(t.id);
  };
  const duplicate = async (t: PromptTemplate) => {
    const at = nowIso();
    const copy: PromptTemplate = { ...t, id: uid(), title: `${t.title} (copy)`, tags: [...t.tags], sampleInputs: { ...t.sampleInputs }, version: 1, history: [], createdAt: at, updatedAt: at, createdBy: user.id, updatedBy: user.id };
    await store.mutatePrompts((s) => { s.prompts[copy.id] = copy; return s; });
    await log("Prompt template duplicated", copy.title, `from ${t.id}`);
    toast(`Duplicated as “${copy.title}”`);
    select(copy.id);
  };
  const remove = async () => {
    const t = confirm; if (!t) return;
    await store.mutatePrompts((s) => { delete s.prompts[t.id]; return s; });
    await log("Prompt template deleted", t.title, t.id);
    setConfirm(null); toast("Template deleted");
    if (route.id === t.id) select(undefined);
  };
  const save = async (t: PromptTemplate, d: Draft) => {
    const title = d.title.trim(); if (!title) return;
    const at = nowIso();
    const entry: PromptVersion = { version: t.version, at, by: user.id, byName: user.name, body: t.body, note: d.note.trim() || undefined };
    const version = t.version + 1;
    await store.mutatePrompts((s) => {
      const prev = s.prompts[t.id] ?? t;
      s.prompts[t.id] = { ...prev, title, description: d.description.trim(), model: d.model.trim(), temperature: toTemperature(d.temperature), maxTokens: toMaxTokens(d.maxTokens), tags: parseTags(d.tags), status: d.status, body: d.body, sampleInputs: { ...d.sampleInputs }, version, history: [...prev.history, entry].slice(-HISTORY_CAP), updatedAt: at, updatedBy: user.id };
      return s;
    });
    await log("Prompt template saved", title, `v${version}`);
    toast(`Saved “${title}” as v${version}`);
  };
  const exportJson = (items: PromptTemplate[], name: string) => {
    if (!items.length) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(items.length === 1 ? items[0] : items, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    void log("Prompt templates exported", items.length === 1 ? items[0].title : `${items.length} templates`);
    toast(items.length === 1 ? "Template exported" : `${items.length} templates exported`);
  };
  const importFile = async (file: File) => {
    try {
      const data: unknown = JSON.parse(await file.text());
      const at = nowIso();
      const parsed = (Array.isArray(data) ? data : [data]).map((x) => parseTemplate(x, user, at));
      if (!parsed.length || parsed.some((x) => !x)) throw new Error("shape");
      const items = parsed as PromptTemplate[];
      const taken = new Set(Object.keys(snap.prompts.prompts));
      for (const t of items) { if (taken.has(t.id)) t.id = uid(); taken.add(t.id); }
      await store.mutatePrompts((s) => { for (const t of items) s.prompts[t.id] = t; return s; });
      await log("Prompt templates imported", file.name, `${items.length} template${items.length === 1 ? "" : "s"}`);
      toast(`Imported ${items.length} template${items.length === 1 ? "" : "s"}`);
      select(items[0].id);
    } catch { toast("That file is not a prompt template export", "bad"); }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Prompt Engineer Workspace</h1><p>Author, preview and version the prompt templates the organisation relies on. Variables are written as {"{{name}}"} and filled from sample inputs for preview.</p></div>
        <div className="actions">
          <button type="button" className="btn btn-primary" onClick={create}><Plus aria-hidden />New template</button>
          <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}><Upload aria-hidden />Import</button>
          <input ref={fileRef} type="file" accept="application/json,.json" multiple={false} hidden aria-label="Import a prompt template export" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ""; }} />
          <button type="button" className="btn btn-secondary" disabled={!prompts.length} onClick={() => exportJson(prompts, `prompt-templates-${new Date().toISOString().slice(0, 10)}.json`)}><Download aria-hidden />Export all</button>
        </div>
      </div>
      <Notice tone="info">Templates are authored, previewed and versioned here. No model is called from the browser and no student data is sent anywhere.</Notice>

      <div className="pe-layout">
        <Panel title="Templates" flush>
          <div className="stack-sm" style={{ padding: 12, borderBottom: "1px solid var(--hair)" }}>
            <label htmlFor={searchId} className="sr-only">Search templates</label>
            <input id={searchId} type="search" className="input" placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
            <label htmlFor={filterId} className="sr-only">Filter by status</label>
            <select id={filterId} className="input" value={filter} onChange={(e) => setFilter(e.target.value === "all" ? "all" : toStatus(e.target.value))}>
              <option value="all">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          {list.length === 0 ? <Empty title={prompts.length ? "No templates match" : "No templates yet"} hint={prompts.length ? "Try a different search or status." : "Create a template or import an export."} /> : (
            <ul className="pe-list" style={{ padding: 8 }}>
              {list.map((p) => (
                <li key={p.id}>
                  <button type="button" className="pe-item" aria-current={selected?.id === p.id ? "true" : undefined} onClick={() => select(p.id)}>
                    <span className="pe-title">{p.title}</span>
                    <span className="pe-meta"><Pill tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Pill> v{p.version} · {p.model || "no model"} · updated {fmtDateTime(p.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {!selected ? <Empty title="Select a template" hint="Choose a template on the left or create a new one." /> : (
          <Editor key={selected.id} t={selected} onSave={save} onDuplicate={() => duplicate(selected)} onExport={() => exportJson([selected], `prompt-${slug(selected.title)}-v${selected.version}.json`)} onDelete={() => setConfirm(selected)} />
        )}
      </div>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title="Delete template" width={460}>
        <p>This removes every version of “{confirm?.title}”. It cannot be undone.</p>
        <div className="modal-f"><button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button><button type="button" className="btn btn-danger" onClick={remove}><Trash2 aria-hidden />Delete template</button></div>
      </Modal>
    </div>
  );
}

// ---------- editor ----------

function Editor({ t, onSave, onDuplicate, onExport, onDelete }: { t: PromptTemplate; onSave: (t: PromptTemplate, d: Draft) => Promise<void>; onDuplicate: () => void; onExport: () => void; onDelete: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(() => draftOf(t));
  const bodyId = useId();
  const modelId = useId();
  const listId = useId();
  useEffect(() => { setD(draftOf(t)); }, [t.id, t.updatedAt, t.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));
  const vars = useMemo(() => variablesOf(d.body), [d.body]);
  const preview = useMemo(() => previewNodes(d.body, d.sampleInputs), [d.body, d.sampleInputs]);
  const dirty = !sameDraft(d, draftOf(t));
  const canSave = dirty && d.title.trim().length > 0;
  const chars = d.body.length;
  const words = d.body.trim() ? d.body.trim().split(/\s+/).length : 0;
  const history = [...t.history].sort((a, b) => b.version - a.version);

  const doSave = () => { if (canSave) void onSave(t, d); };
  const restore = (v: PromptVersion) => { set("body", v.body); toast(`Loaded v${v.version} into the editor. Save to keep it.`, "info"); };
  const onKey = (e: React.KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); doSave(); } };

  return (
    <div className="stack" onKeyDown={onKey}>
      <Panel title={t.title}>
        <div className="stack">
          <div className="pe-toolbar">
            <div className="flex aic wrap g2">
              <Pill tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Pill>
              <Pill tone="navy">v{t.version}</Pill>
              <span className="ui xs muted">{dirty ? "Unsaved changes" : `Saved ${fmtDateTime(t.updatedAt)}`}</span>
            </div>
            <div className="actions">
              <button type="button" className="btn btn-primary" disabled={!canSave} onClick={doSave}><Save aria-hidden />Save</button>
              <button type="button" className="btn btn-secondary" onClick={onDuplicate}><Copy aria-hidden />Duplicate</button>
              <button type="button" className="btn btn-secondary" onClick={onExport}><Download aria-hidden />Export</button>
              <button type="button" className="btn btn-danger-ghost" onClick={onDelete}><Trash2 aria-hidden />Delete</button>
            </div>
          </div>

          <div className="form-grid">
            <TextField label="Title" value={d.title} onChange={(v) => set("title", v)} required maxLength={120} />
            <SelectField label="Status" value={d.status} onChange={(v) => set("status", toStatus(v))} options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))} required />
            <Field label="Target model" htmlFor={modelId} hint="Free text; suggestions appear as you type">
              <input id={modelId} className="input" list={listId} value={d.model} onChange={(e) => set("model", e.target.value)} autoComplete="off" aria-describedby={`${modelId}-hint`} />
              <datalist id={listId}>{MODEL_SUGGESTIONS.map((m) => <option key={m} value={m} />)}</datalist>
            </Field>
            <TextField label="Temperature" type="number" value={d.temperature} onChange={(v) => set("temperature", v)} hint="0 to 1" inputMode="decimal" />
            <TextField label="Max output tokens" type="number" value={d.maxTokens} onChange={(v) => set("maxTokens", v)} inputMode="numeric" />
            <TextField label="Tags" value={d.tags} onChange={(v) => set("tags", v)} hint="Comma separated" full />
            <TextArea label="Description" value={d.description} onChange={(v) => set("description", v)} rows={2} />
          </div>

          <div>
            <Field label="Prompt body" required htmlFor={bodyId} hint={"Write variables as {{name}}. Ctrl+S or Cmd+S saves."}>
              <textarea id={bodyId} className="input code" rows={16} value={d.body} onChange={(e) => set("body", e.target.value)} spellCheck={false} aria-required aria-describedby={`${bodyId}-hint`} />
            </Field>
            <p className="pe-stat mt1"><b>{chars}</b> characters · <b>{words}</b> words · ≈ <b>{Math.ceil(chars / 4)}</b> tokens · <b>{vars.length}</b> variable{vars.length === 1 ? "" : "s"}</p>
          </div>

          <div>
            <h3>Variables</h3>
            {vars.length === 0 ? <p className="small muted mt1">No variables detected yet.</p> : (
              <>
                <div className="flex wrap g1 mt1">{vars.map((v) => <span key={v} className="pe-var">{`{{${v}}}`}</span>)}</div>
                <div className="form-grid mt2">{vars.map((v) => <TextField key={v} label={`Sample: ${v}`} value={d.sampleInputs[v] ?? ""} onChange={(x) => set("sampleInputs", { ...d.sampleInputs, [v]: x })} />)}</div>
              </>
            )}
          </div>

          <div>
            <h3>Preview</h3>
            <div className="pe-preview mt1" aria-live="polite">{preview.length ? preview : <span className="muted">Nothing to preview yet.</span>}</div>
          </div>

          <TextField label="Version note (optional)" value={d.note} onChange={(v) => set("note", v)} hint="Kept in the version history with the state you are replacing." maxLength={200} />
        </div>
      </Panel>

      <Panel title="Version history" flush>
        {history.length === 0 ? <p className="small muted" style={{ padding: 16 }}>No earlier versions. Save a change to start the history.</p> : (
          <div className="pe-history" style={{ padding: 12 }}>
            {history.map((v) => (
              <div key={`${v.version}-${v.at}`} className="pe-version">
                <span className="strong">v{v.version}</span>
                <span className="muted">{fmtDateTime(v.at)} · {v.byName}</span>
                {v.note && <span className="grow">{v.note}</span>}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => restore(v)} aria-label={`Restore v${v.version} into the editor`}><RotateCcw aria-hidden />Restore</button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
