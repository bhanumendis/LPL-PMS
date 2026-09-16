/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { useRef, useState } from "react";
import { Save, Download, Upload, Trash2, FlaskConical, Eraser } from "lucide-react";
import { useSession } from "@/App";
import { store, DEFAULT_RETENTION } from "@/lib/store";
import { readServerConfig, writeServerConfig } from "@/lib/server";
import { Panel, useToast, Notice, Modal, TextField, TextArea, PageHeader } from "@/lib/ui";
import { retentionPolicy } from "@/lib/logic";
import type { AuditState, CasesState, OrgConfig, OrgState, PromptsState } from "@/lib/types";
import { EVENTS, diffChanges } from "@/lib/audit";
import { addSampleData, removeSampleData, sampleCounts, isSampleId, SAMPLE_PASSWORD, SAMPLE_SHAPE_SUMMARY } from "@/lib/sample";

/** The editable settings as form strings; also the "before" side of the audit diff. */
function settingsForm(cfg: OrgConfig, ret: ReturnType<typeof retentionPolicy>) {
  return { orgName: cfg.orgName, entityCode: cfg.entityCode, cisDays: String(cfg.sla.cisDays), offerReminderDays: String(cfg.sla.offerReminderDays), followUpMonths: String(cfg.sla.followUpMonths), exitedMonths: String(ret.exitedMonths), completedMonths: String(ret.completedMonths), dormantMonths: String(ret.dormantMonths), warnDays: String(ret.warnDays), channels: cfg.channels.join("\n"), branches: cfg.branches.join("\n"), vapidPublicKey: cfg.push?.vapidPublicKey ?? "" };
}

const SETTINGS_FIELDS = [
  { id: "orgName", label: "Organisation name" }, { id: "entityCode", label: "Case reference prefix" },
  { id: "cisDays", label: "Course Information Sheet days" }, { id: "offerReminderDays", label: "Offer reminder days" }, { id: "followUpMonths", label: "Follow-up months" },
  { id: "exitedMonths", label: "Retention after exit (months)" }, { id: "completedMonths", label: "Retention after completion (months)" }, { id: "dormantMonths", label: "Dormant hold (months)" }, { id: "warnDays", label: "Retention warning days" },
  { id: "channels", label: "Enquiry channels" }, { id: "branches", label: "Branches" }, { id: "vapidPublicKey", label: "VAPID public key" },
];

export function SettingsPage() {
  const { snap, user, audit, signOut, can, isAdmin } = useSession();
  const toast = useToast();
  const cfg = snap.org.config;
  const ret = retentionPolicy(cfg);
  const mayWrite = can("settings.write");
  const mayReset = can("settings.delete");
  const [f, setF] = useState(() => settingsForm(cfg, ret));
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
      const vapid = f.vapidPublicKey.trim();
      o.config.push = vapid ? { ...(o.config.push ?? {}), vapidPublicKey: vapid } : undefined;
      return o;
    });
    await audit(EVENTS.settingsUpdated(diffChanges(settingsForm(cfg, ret), f, SETTINGS_FIELDS)));
    toast("Settings saved");
  };
  const reset = async () => { if (!mayReset || !user) return; await store.resetAll(); await store.audit(EVENTS.workspaceReset(), user); setConfirm(null); signOut(); };
  const backup = () => {
    if (!isAdmin) return;
    const data = { exportedAt: new Date().toISOString(), org: snap.org, cases: snap.cases, audit: snap.audit, prompts: snap.prompts };
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })); a.download = `lpl-pms-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    void audit(EVENTS.backupExported());
    toast("Backup downloaded");
  };
  const restore = async (file: File) => {
    if (!isAdmin) return;
    try {
      const data = JSON.parse(await file.text()) as { org?: OrgState; cases?: CasesState; audit?: AuditState; prompts?: PromptsState };
      if (!data.org?.config || !data.cases?.cases) throw new Error("not a backup");
      await store.replaceAll(data.org, data.cases, data.audit ?? { entries: [], rev: 0 }, data.prompts?.prompts ? data.prompts : undefined);
      await audit(EVENTS.backupRestored(file.name, { cases: Object.keys(data.cases.cases).length, users: Object.keys(data.org.users ?? {}).length, audit: data.audit?.entries.length ?? 0 }));
      toast("Backup restored");
    } catch { toast("That file is not a valid workspace backup", "bad"); }
  };

  return (
    <div className="stack">
      <PageHeader
        title="Settings"
        context={<>Organisation, service levels and reference lists.</>}
        actions={<><button type="button" className="btn btn-primary" onClick={save} disabled={!mayWrite}><Save aria-hidden />Save settings</button></>}
      />
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
        <Panel title="Notifications">
          <div className="stack-sm">
            <p className="xs muted">Browser push notifications are delivered by the push-dispatch function on the server. Generate a VAPID key pair once (for example <code>npx web-push generate-vapid-keys</code>), put the private key and a dispatch secret in the function's secrets, and paste the public key here. Nothing secret is stored in the workspace.</p>
            <TextField label="VAPID public key" value={f.vapidPublicKey} onChange={(v) => setF({ ...f, vapidPublicKey: v })} hint="Leave empty to keep push switched off; the bell and in-app notifications work regardless." autoComplete="off" />
          </div>
        </Panel>
        <ServerPanel />
        {isAdmin && <SampleDataPanel />}
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
 * Demonstration data, for showing the system to a room. Adding merges a self-contained set of
 * staff accounts, students and cases into the workspace; removing deletes exactly that set and
 * nothing else, so it stays safe to use on a workspace that already holds real records.
 *
 * Administrator only, and deliberately not offered while a server is connected: the generated
 * accounts exist in browser storage and would have no identity-provider sign-in behind them.
 */
function SampleDataPanel() {
  const { snap, user } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState<"add" | "remove" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const counts = sampleCounts(snap.org, snap.cases, snap.audit);
  const present = counts.cases > 0 || counts.users > 0;
  const onServer = snap.backend === "server";
  const accounts = Object.values(snap.org.users).filter((u) => isSampleId(u.id));

  const add = async () => {
    if (!user || busy) return;
    setBusy("add");
    try {
      const made = await addSampleData(user);
      toast(`Added ${made.cases} sample cases and ${made.users} sample accounts`);
    } catch {
      toast("Could not add the sample data", "bad");
    } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!user || busy) return;
    setBusy("remove");
    try {
      const gone = await removeSampleData(user);
      setConfirmRemove(false);
      toast(`Removed ${gone.cases} sample cases and ${gone.users} sample accounts`);
    } catch {
      toast("Could not remove the sample data", "bad");
    } finally { setBusy(null); }
  };

  return (
    <Panel title="Sample data">
      <div className="stack-sm small">
        <p className="muted">
          A self-contained demonstration set: {SAMPLE_SHAPE_SUMMARY.cases} cases spread across all {SAMPLE_SHAPE_SUMMARY.stages} stages
          and every case status, {SAMPLE_SHAPE_SUMMARY.staff} staff accounts and {SAMPLE_SHAPE_SUMMARY.withSignIn} student sign-ins.
          It fills the dashboards, charts, queues, registers and the audit log, so each role can be shown as it really reads.
        </p>
        {onServer ? (
          <Notice tone="warn">Sample data is only available on browser storage. While a server is connected, accounts are issued by the identity provider, so generated sign-ins would not work.</Notice>
        ) : (
          <>
            <Notice tone="info">Every sample record is tagged. Removing deletes only those records — any real cases, accounts and audit history in this workspace are left untouched.</Notice>
            {present ? (
              <>
                <p>Present now: <b className="ui">{counts.cases}</b> cases, <b className="ui">{counts.users}</b> accounts, <b className="ui">{counts.audit}</b> audit entries.</p>
                <p className="muted">Sign in as any of these with the password <b className="ui">{SAMPLE_PASSWORD}</b>:</p>
                <ul className="stack-sm xs">
                  {accounts.filter((u) => u.role !== "student").map((u) => (
                    <li key={u.id}><b className="ui">{ROLE_WORD[u.role] ?? u.role}</b> — {u.email}</li>
                  ))}
                  {accounts.filter((u) => u.role === "student").slice(0, 1).map((u) => (
                    <li key={u.id}><b className="ui">Student</b> — {u.email}{accounts.filter((x) => x.role === "student").length > 1 ? ` (and ${accounts.filter((x) => x.role === "student").length - 1} more)` : ""}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="muted">No sample data is present.</p>
            )}
            <div className="flex wrap g2 mt2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={add} disabled={present || busy !== null}>
                <FlaskConical aria-hidden />{busy === "add" ? "Adding…" : "Add sample data"}
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmRemove(true)} disabled={!present || busy !== null}>
                <Eraser aria-hidden />Remove sample data
              </button>
            </div>
          </>
        )}
      </div>
      <Modal open={confirmRemove} onClose={() => setConfirmRemove(false)} title="Remove the sample data" width={460}>
        <p className="small ink2">
          This deletes the <b className="ui">{counts.cases}</b> sample cases, <b className="ui">{counts.users}</b> sample accounts and their audit entries.
          Nothing else in the workspace is affected.
        </p>
        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmRemove(false)}>Cancel</button>
          <button type="button" className="btn btn-danger" onClick={remove} disabled={busy !== null}>{busy === "remove" ? "Removing…" : "Remove sample data"}</button>
        </div>
      </Modal>
    </Panel>
  );
}

const ROLE_WORD: Record<string, string> = { admin: "Administrator", team_leader: "Team Leader", counsellor: "Counsellor", student: "Student" };

/**
 * Connecting a server changes where every record lives and who may read it, so it is
 * deliberately explicit: enter the project URL and the public anon key, test the
 * connection, then confirm. The anon key is safe in the browser — it grants nothing on
 * its own, because row-level security decides what a signed-in user may see.
 */
function ServerPanel() {
  const { snap, signOut, audit } = useSession();
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
    await audit(EVENTS.serverConnected(f.url.trim()));
    writeServerConfig({ url: f.url.trim(), anonKey: f.anonKey.trim() });
    await store.reconnect();
    toast("Connected to the server. Sign in with a server account.");
    signOut();
  };

  const disconnect = async () => {
    await audit(EVENTS.serverDisconnected());
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
