/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { useRef, useState } from "react";
import { Save, Download, Upload, Trash2 } from "lucide-react";
import { useSession } from "@/App";
import { store, DEFAULT_RETENTION } from "@/lib/store";
import { readServerConfig, writeServerConfig } from "@/lib/server";
import { Panel, useToast, Notice, Modal, TextField, TextArea } from "@/lib/ui";
import { retentionPolicy } from "@/lib/logic";
import type { AuditState, CasesState, OrgState, PromptsState } from "@/lib/types";

export function SettingsPage() {
  const { snap, log, signOut, can, isAdmin } = useSession();
  const toast = useToast();
  const cfg = snap.org.config;
  const ret = retentionPolicy(cfg);
  const mayWrite = can("settings.write");
  const mayReset = can("settings.delete");
  const [f, setF] = useState({ orgName: cfg.orgName, entityCode: cfg.entityCode, cisDays: String(cfg.sla.cisDays), offerReminderDays: String(cfg.sla.offerReminderDays), followUpMonths: String(cfg.sla.followUpMonths), exitedMonths: String(ret.exitedMonths), completedMonths: String(ret.completedMonths), dormantMonths: String(ret.dormantMonths), warnDays: String(ret.warnDays), channels: cfg.channels.join("\n"), branches: cfg.branches.join("\n") });
  const [confirm, setConfirm] = useState<"reset" | null>(null);
  const [typed, setTyped] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async () => {
    if (!mayWrite) return;
    await store.mutateOrg((o) => {
      o.config.orgName = f.orgName.trim() || o.config.orgName;
      o.config.entityCode = f.entityCode.trim().toUpperCase() || o.config.entityCode;
      o.config.sla = { cisDays: Number(f.cisDays) || 7, offerReminderDays: Number(f.offerReminderDays) || 21, followUpMonths: Number(f.followUpMonths) || 3 };
      o.config.retention = {
        exitedMonths: Number(f.exitedMonths) || DEFAULT_RETENTION.exitedMonths,
        completedMonths: Number(f.completedMonths) || DEFAULT_RETENTION.completedMonths,
        dormantMonths: Number(f.dormantMonths) || DEFAULT_RETENTION.dormantMonths,
        warnDays: Number(f.warnDays) || DEFAULT_RETENTION.warnDays,
      };
      o.config.channels = f.channels.split("\n").map((s) => s.trim()).filter(Boolean);
      o.config.branches = f.branches.split("\n").map((s) => s.trim()).filter(Boolean);
      return o;
    });
    await log("Settings updated");
    toast("Settings saved");
  };
  const reset = async () => { if (!mayReset) return; await store.resetAll(); setConfirm(null); signOut(); };
  const backup = () => {
    if (!isAdmin) return;
    const data = { exportedAt: new Date().toISOString(), org: snap.org, cases: snap.cases, audit: snap.audit, prompts: snap.prompts };
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = `lpl-pms-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    void log("Workspace backup exported");
    toast("Backup downloaded");
  };
  const restore = async (file: File) => {
    if (!isAdmin) return;
    try {
      const data = JSON.parse(await file.text()) as { org?: OrgState; cases?: CasesState; audit?: AuditState; prompts?: PromptsState };
      if (!data.org?.config || !data.cases?.cases) throw new Error("not a backup");
      await store.replaceAll(data.org, data.cases, data.audit ?? { entries: [], rev: 0 }, data.prompts?.prompts ? data.prompts : undefined);
      await log("Workspace restored from backup", file.name);
      toast("Backup restored");
    } catch { toast("That file is not a valid workspace backup", "bad"); }
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Settings</h1><p>Organisation, service levels and reference lists.</p></div>
        <div className="actions"><button type="button" className="btn btn-primary" onClick={save} disabled={!mayWrite}><Save aria-hidden />Save settings</button></div>
      </div>
      <div className="grid grid-2 stagger">
        <Panel title="Organisation">
          <div className="stack-sm">
            <TextField label="Organisation name" value={f.orgName} onChange={(v) => setF({ ...f, orgName: v })} />
            <TextField label="Case reference prefix" value={f.entityCode} onChange={(v) => setF({ ...f, entityCode: v })} hint="References are issued as PREFIX-YYYY-0001." maxLength={6} />
            <TextArea label="Branches" value={f.branches} onChange={(v) => setF({ ...f, branches: v })} rows={3} hint="One per line." />
          </div>
        </Panel>
        <Panel title="Service levels">
          <div className="stack-sm">
            <TextField label="Course Information Sheet — days from profile confirmation" value={f.cisDays} onChange={(v) => setF({ ...f, cisDays: v })} type="number" inputMode="numeric" />
            <TextField label="Offer lapse reminder window — days before lapse" value={f.offerReminderDays} onChange={(v) => setF({ ...f, offerReminderDays: v })} type="number" inputMode="numeric" />
            <TextField label="Post-arrival follow-up — months after arrival" value={f.followUpMonths} onChange={(v) => setF({ ...f, followUpMonths: v })} type="number" inputMode="numeric" />
          </div>
        </Panel>
        <Panel title="Retention schedule">
          <div className="stack-sm">
            <p className="xs muted">How long a case is kept after it stops being active. On expiry the record is anonymised, not deleted — outcomes and dates survive for reporting. Confirm these periods with Group Legal before 1 January 2027.</p>
            <TextField label="Exited cases — months from the exit date" value={f.exitedMonths} onChange={(v) => setF({ ...f, exitedMonths: v })} type="number" inputMode="numeric" />
            <TextField label="Placed students — months from the follow-up" value={f.completedMonths} onChange={(v) => setF({ ...f, completedMonths: v })} type="number" inputMode="numeric" hint="Seven years by default, against commercial and tax records." />
            <TextField label="Dormant holds and deferrals — months from last activity" value={f.dormantMonths} onChange={(v) => setF({ ...f, dormantMonths: v })} type="number" inputMode="numeric" />
            <TextField label="Warning window — days before disposal" value={f.warnDays} onChange={(v) => setF({ ...f, warnDays: v })} type="number" inputMode="numeric" />
          </div>
        </Panel>
        <Panel title="Enquiry channels">
          <TextArea label="Channels offered at enquiry" value={f.channels} onChange={(v) => setF({ ...f, channels: v })} rows={7} hint="One per line. The seven checklist channels are the standard set." />
        </Panel>
        <ServerPanel />
        <Panel title="Workspace">
          <div className="stack-sm small">
            <p>Data store: <b className="ui">{snap.backend === "server" ? "Connected server" : snap.backend === "shared" ? "Shared live workspace" : snap.backend === "local" ? "This browser" : "This session only"}</b></p>
            <p className="muted">{snap.backend === "server" ? "Records are held on the connected server. Who may read a case is decided there by row-level security, not by this application." : snap.backend === "shared" ? "Every signed-in user reads and writes the same records." : snap.backend === "local" ? "Records are held in this browser's local storage and mirrored across its open tabs. Take a backup before clearing browser data." : "Storage is unavailable in this browser, so records last only for this session."}</p>
            {isAdmin && (
              <div className="flex wrap g2 mt2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={backup}><Download aria-hidden />Download backup</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}><Upload aria-hidden />Restore backup</button>
                <input ref={fileRef} type="file" accept="application/json,.json" multiple={false} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void restore(file); }} />
              </div>
            )}
            {mayReset && (
              <>
                <Notice tone="bad">Resetting removes every account, case, document record, prompt template and audit entry and returns the system to first-run setup.</Notice>
                <div><button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirm("reset")}><Trash2 aria-hidden />Reset workspace</button></div>
              </>
            )}
          </div>
        </Panel>
      </div>
      <Modal open={confirm === "reset"} onClose={() => setConfirm(null)} title="Reset the workspace" width={460}>
        <p className="small ink2">Type <b className="ui">RESET</b> to confirm. This cannot be undone — download a backup first if you may need the records.</p>
        <div className="mt3"><TextField label="Confirmation" value={typed} onChange={setTyped} autoComplete="off" /></div>
        <div className="modal-f"><button type="button" className="btn btn-secondary" onClick={() => setConfirm(null)}>Cancel</button><button type="button" className="btn btn-danger" disabled={typed !== "RESET"} onClick={reset}>Reset everything</button></div>
      </Modal>
    </div>
  );
}

/**
 * Connecting a server changes where every record lives and who may read it, so it is
 * deliberately explicit: enter the project URL and the public anon key, test the
 * connection, then confirm. The anon key is safe in the browser — it grants nothing on
 * its own, because row-level security decides what a signed-in user may see.
 */
function ServerPanel() {
  const { snap, signOut } = useSession();
  const toast = useToast();
  const current = readServerConfig();
  const connected = snap.backend === "server";
  const [f, setF] = useState({ url: current?.url ?? "", anonKey: current?.anonKey ?? "" });
  const [state, setState] = useState<"idle" | "testing" | "ok" | "bad">("idle");
  const [msg, setMsg] = useState("");
  const [confirmOff, setConfirmOff] = useState(false);

  const test = async () => {
    setState("testing"); setMsg("");
    const url = f.url.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//.test(url) || !f.anonKey.trim()) { setState("bad"); setMsg("Enter the full project URL and the anon key."); return; }
    try {
      const res = await fetch(`${url}/rest/v1/rpc/needs_bootstrap`, {
        method: "POST",
        headers: { apikey: f.anonKey.trim(), Authorization: `Bearer ${f.anonKey.trim()}`, "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) {
        setState("bad");
        setMsg(res.status === 404
          ? "Reached the project, but needs_bootstrap() is missing. Run supabase/schema.sql in the SQL editor first."
          : `The project answered ${res.status}. Check the anon key.`);
        return;
      }
      const empty = await res.json() as boolean;
      setState("ok");
      setMsg(empty ? "Connected. The project has no accounts yet; the first administrator is created from the set-up screen after you connect." : "Connected. Sign in with an account issued on this project.");
    } catch {
      setState("bad");
      setMsg("Could not reach that URL from this browser. Check the address and the project's CORS settings.");
    }
  };

  const connect = async () => {
    writeServerConfig({ url: f.url.trim(), anonKey: f.anonKey.trim() });
    await store.reconnect();
    toast("Connected to the server. Sign in with a server account.");
    signOut();
  };

  const disconnect = async () => {
    writeServerConfig(null);
    await store.reconnect();
    setConfirmOff(false);
    toast("Disconnected. This browser's own records apply again.");
    signOut();
  };

  return (
    <Panel title="Server connection">
      <div className="stack-sm small">
        {connected ? (
          <>
            <Notice tone="ok">Connected to <b className="ui">{current?.url}</b>. Records are stored there and access is enforced by the database.</Notice>
            <p className="muted">Cases, profiles and the audit log all live on the server. Disconnecting does not delete anything there; this browser simply stops using it.</p>
            <div><button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmOff(true)}>Disconnect</button></div>
          </>
        ) : (
          <>
            <p className="muted">Without a server, records are held in this browser only. Connect a Supabase project to share one set of records across staff, with the visibility rules enforced by the database rather than by this page.</p>
            <Notice tone="warn">Run <b className="ui">supabase/schema.sql</b> against the project, then deploy the <b className="ui">admin-users</b> Edge Function (supabase/functions/admin-users). The schema creates the tables, the row-level security policies that mirror the permission matrix, and the closed-registration trigger; the function is how administrators issue sign-ins.</Notice>
            <TextField label="Project URL" value={f.url} onChange={(v) => { setF({ ...f, url: v }); setState("idle"); }} placeholder="https://xxxxxxxx.supabase.co" />
            <TextField label="Anon (public) key" value={f.anonKey} onChange={(v) => { setF({ ...f, anonKey: v }); setState("idle"); }} hint="The publishable key from Project Settings → API. Never the service_role key." />
            {msg && <Notice tone={state === "ok" ? "ok" : "bad"} role="status">{msg}</Notice>}
            <div className="flex wrap g2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={test} disabled={state === "testing"}>{state === "testing" ? "Testing…" : "Test connection"}</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={connect} disabled={state !== "ok"}>Connect and sign out</button>
            </div>
          </>
        )}
      </div>
      <Modal open={confirmOff} onClose={() => setConfirmOff(false)} title="Disconnect from the server" width={460}>
        <p className="small ink2">This browser will stop reading the server and fall back to its own storage. Nothing on the server is deleted, and you will be signed out.</p>
        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmOff(false)}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={disconnect}>Disconnect</button>
        </div>
      </Modal>
    </Panel>
  );
}
