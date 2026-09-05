/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import React, { useState } from "react";
import { Plus, KeyRound, UserRoundX, UserRoundCheck, Download } from "lucide-react";
import { useSession } from "@/App";
import { store, uid, nowIso, hashPassword, passwordProblem } from "@/lib/store";
import { ROLE_LABEL, ROLES } from "@/lib/rbac";
import { Modal, Notice, useToast, Pill, Avatar, Empty, TextField, SelectField, Kpi } from "@/lib/ui";
import { fmtDateTime } from "@/lib/logic";
import { Donut, Legend } from "@/lib/charts";
import type { Role, User } from "@/lib/types";

/** Shown beside an admin-users failure when the Edge Function is not on the project yet. */
const NOT_DEPLOYED_HINT = "Deploy the admin-users function (supabase/functions/admin-users) to issue sign-ins from here.";

export function StaffPage() {
  const { users, user, cases, log, snap, can } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<"staff" | "students">("staff");
  const [creating, setCreating] = useState(false);
  const [passwordFor, setPasswordFor] = useState<User | null>(null);
  const canWrite = can("staff.write");
  const canAccount = can("account.write");
  const canDeactivate = can("account.delete");
  const list = Object.values(users).filter((u) => (tab === "staff" ? u.role !== "student" : u.role === "student")).sort((a, b) => a.name.localeCompare(b.name));
  const staff = Object.values(users).filter((u) => u.role !== "student");
  const byRole = ROLES.filter((r) => r.id !== "student").map((r) => ({ label: r.label, n: staff.filter((u) => u.role === r.id && u.active).length })).filter((x) => x.n > 0);

  const toggle = async (u: User) => {
    if (!user || u.id === user.id || !canDeactivate) return;
    const next = !u.active;
    const server = store.server;
    /** The profile flag is always written; on a server the identity itself is also blocked or unblocked. */
    let warn: string | null = null;
    if (server) {
      const r = await server.setSignInActive(u.id, next);
      if (!r.ok) warn = r.notDeployed ? `Profile updated. Deploy the admin-users function to also ${next ? "unblock" : "block"} the sign-in itself.` : `Profile updated. The sign-in itself was not changed: ${r.error}`;
    }
    await store.mutateOrg((o) => { if (o.users[u.id]) o.users[u.id].active = next; return o; });
    await log(next ? "Account reactivated" : "Account deactivated", u.email, warn ? "Profile only; sign-in unchanged" : undefined);
    if (warn) toast(warn, "warn"); else toast(`${u.name} ${next ? "reactivated" : "deactivated"}`);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Staff</h1><p>Profiles, roles and access for {snap.org.config.orgName}.</p></div>
        <div className="actions">
          {can("staff.download") && <button type="button" className="btn btn-secondary" onClick={() => { const rows = [["Name","Role","Email","Phone","Branch","Status","Last sign-in"], ...Object.values(users).map((u) => [u.name, ROLE_LABEL[u.role], u.email, u.phone ?? "", u.branch ?? "", u.active ? "Active" : "Deactivated", u.lastSignInAt ?? ""])]; const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"); const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "lpl-staff.csv"; a.click(); void log("Staff list exported"); }}><Download aria-hidden />Export CSV</button>}
          {canWrite && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus aria-hidden />Create a profile</button>}
        </div>
      </div>
      <div className="grid grid-4 stagger">
        <Kpi label="Active staff" value={staff.filter((u) => u.active).length} sub={`${staff.filter((u) => !u.active).length} deactivated`} />
        <Kpi label="Counsellors" value={staff.filter((u) => u.role === "counsellor" && u.active).length} sub="case owners" />
        <Kpi label="Team Leaders" value={staff.filter((u) => u.role === "team_leader" && u.active).length} tone="info" sub="approval authority" />
        <Kpi label="Student profiles" value={Object.values(users).filter((u) => u.role === "student").length} sub="created from a case" />
      </div>
      <div className="grid grid-3 stagger">
        <div className="span2 stack">
          <div className="seg" role="tablist" aria-label="Account type">
            <button type="button" role="tab" aria-selected={tab === "staff"} onClick={() => setTab("staff")}>Staff accounts</button>
            <button type="button" role="tab" aria-selected={tab === "students"} onClick={() => setTab("students")}>Student accounts</button>
          </div>
          {list.length === 0 ? <Empty title={tab === "staff" ? "No staff profiles yet" : "No student accounts yet"} hint={tab === "staff" ? "Create counsellor and Team Leader profiles so cases can be assigned." : "Student sign-ins are issued by staff when a student case is created."} /> : (
            <div className="panel table-wrap">
              <table className="tbl" style={{ minWidth: 760 }}>
                <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Contact</th><th scope="col">Branch</th><th scope="col" className="right">{tab === "staff" ? "Open cases" : "Case"}</th><th scope="col">Last sign-in</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {list.map((u) => {
                    const open = Object.values(cases).filter((c) => (tab === "staff" ? c.counsellorId === u.id : c.studentUserId === u.id) && c.status === "open");
                    const own = Object.values(cases).find((c) => c.studentUserId === u.id);
                    return (
                      <tr key={u.id}>
                        <td><div className="flex aic g2"><Avatar name={u.name} size={30} tone={u.role === "admin" ? "ink" : undefined} /><span className="primary">{u.name}</span></div></td>
                        <td>{ROLE_LABEL[u.role]}</td>
                        <td><p>{u.email}</p><p className="sub">{u.phone || "—"}</p></td>
                        <td>{u.branch || "—"}</td>
                        <td className="right tnum">{tab === "staff" ? open.length : own?.ref ?? "—"}</td>
                        <td className="muted nowrap">{u.lastSignInAt ? fmtDateTime(u.lastSignInAt) : "Never"}</td>
                        <td><Pill tone={u.active ? "ok" : "bad"}>{u.active ? "Active" : "Deactivated"}</Pill></td>
                        <td className="right nowrap">
                          {canAccount && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPasswordFor(u)}><KeyRound aria-hidden />Set temporary password</button>}
                          {canDeactivate && u.id !== user?.id && <button type="button" className={`btn btn-sm ${u.active ? "btn-danger-ghost" : "btn-ghost"}`} onClick={() => toggle(u)}>{u.active ? <><UserRoundX aria-hidden />Deactivate</> : <><UserRoundCheck aria-hidden />Reactivate</>}</button>}
                          {!canAccount && !(canDeactivate && u.id !== user?.id) && <span className="muted">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="panel"><div className="panel-h"><h2>Active staff by role</h2></div><div className="panel-b">{byRole.length === 0 ? <Empty title="No staff yet" /> : <div className="flex g3 aic wrap"><Donut data={byRole} title="Active staff by role" size={130} stroke={20} centerSub="staff" /><div className="grow"><Legend data={byRole} /></div></div>}</div></div>
      </div>
      {creating && <CreateProfile onClose={() => setCreating(false)} />}
      {passwordFor && <SetTemporaryPassword u={passwordFor} onClose={() => setPasswordFor(null)} />}
    </div>
  );
}

/**
 * Creates a staff profile and, with the account.write permission, issues its sign-in in the
 * same step. On a server the sign-in goes through the admin-users Edge Function; if that
 * fails the profile is kept and the sign-in can be issued later from this page.
 */
function CreateProfile({ onClose }: { onClose: () => void }) {
  const { user, log, snap, can } = useSession();
  const toast = useToast();
  const canAccount = can("account.write");
  const roles = ROLES.filter((r) => r.id !== "student");
  const [f, setF] = useState({ name: "", email: "", phone: "", branch: snap.org.config.branches[0] ?? "", role: "counsellor" as Role, issue: true, password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  /** Set when the profile exists but the server refused to issue the sign-in; the dialog then waits to be acknowledged. */
  const [created, setCreated] = useState<{ name: string; error: string; notDeployed: boolean } | null>(null);
  const issue = canAccount && f.issue;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErr("");
    if (!f.name.trim() || !f.email.trim()) return setErr("Name and email are required.");
    if (issue) { const problem = passwordProblem(f.password); if (problem) return setErr(problem); }
    setBusy(true);
    try {
    await store.refresh();
    if (store.findUserByEmail(f.email)) { setBusy(false); return setErr("A profile with this email already exists."); }
    const server = store.server;
    // Browser storage keeps the hash on the profile. On a server the identity provider holds
    // the password and this field stays empty.
    const hash = issue && !server ? await hashPassword(f.password) : "";
    const u: User = { id: uid(), name: f.name.trim(), email: f.email.trim().toLowerCase(), phone: f.phone.trim(), branch: f.branch.trim(), role: f.role, passwordHash: hash, active: true, createdAt: nowIso(), createdBy: user.id };
    await store.mutateOrg((o) => { o.users[u.id] = u; return o; });
    await log("Profile created", u.email, ROLE_LABEL[u.role]);
    if (issue) {
      if (server) {
        const r = await server.createSignIn({ appUserId: u.id, email: u.email, password: f.password, name: u.name, phone: u.phone });
        if (!r.ok) {
          await log("Sign-in not issued", u.email, r.error);
          setBusy(false);
          toast(`${ROLE_LABEL[u.role]} profile created for ${u.name}`);
          setCreated({ name: u.name, error: r.error, notDeployed: !!r.notDeployed });
          return;
        }
      }
      await log("Sign-in issued", u.email, ROLE_LABEL[u.role]);
    }
    toast(`${ROLE_LABEL[u.role]} profile created for ${u.name}`);
    onClose();
    } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
  };

  if (created) {
    return (
      <Modal open onClose={onClose} title="Create a profile">
        <div className="stack">
          <Notice tone="ok">The profile for <b className="ui">{created.name}</b> was created.</Notice>
          <Notice tone="bad" role="alert">
            <p>The sign-in was not issued: {created.error}</p>
            {created.notDeployed && <p className="mt1">{NOT_DEPLOYED_HINT}</p>}
            <p className="mt1">The profile is kept. Issue the sign-in later with "Set temporary password" on this page.</p>
          </Notice>
          <div className="modal-f"><button type="button" className="btn btn-primary" onClick={onClose}>Close</button></div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} title="Create a profile" subtitle="Staff profiles carry the role. A sign-in can be issued now or later from this page.">
      <form onSubmit={submit} className="stack" noValidate>
        <div className="form-grid">
          <TextField label="Full name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required autoComplete="off" />
          <SelectField label="Role" value={f.role} onChange={(v) => setF({ ...f, role: v as Role })} options={roles.map((r) => ({ value: r.id, label: r.label }))} required placeholder="Select a role" />
          <TextField label="Email" value={f.email} onChange={(v) => setF({ ...f, email: v })} required type="email" inputMode="email" full autoComplete="off" />
          <TextField label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} type="tel" inputMode="tel" autoComplete="off" />
          <SelectField label="Branch" value={f.branch} onChange={(v) => setF({ ...f, branch: v })} options={snap.org.config.branches} placeholder="No branch" />
        </div>
        <p className="xs muted">{roles.find((r) => r.id === f.role)?.description}</p>
        {canAccount ? (
          <div className="soft" style={{ padding: 12 }}>
            <label className="check" style={{ border: 0, background: "transparent", padding: "4px 2px", minHeight: 0 }}><input type="checkbox" checked={f.issue} onChange={(e) => setF({ ...f, issue: e.target.checked })} /><span>Issue a sign-in now</span></label>
            {f.issue && <div className="mt2" style={{ maxWidth: 300 }}><TextField label="Temporary password" value={f.password} onChange={(v) => setF({ ...f, password: v })} required hint="Share it with the staff member. They sign in with their email and this password." autoComplete="off" /></div>}
          </div>
        ) : (
          <p className="xs muted">Sign-ins are issued by an administrator from this page.</p>
        )}
        {err && <Notice tone="bad" role="alert">{err}</Notice>}
        <div className="modal-f"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "Creating…" : "Create profile"}</button></div>
      </form>
    </Modal>
  );
}

/**
 * Sets a temporary password. Browser storage writes the hash to the profile; a server goes
 * through the admin-users Edge Function. A profile that has no sign-in yet (the function
 * answers 409) is offered "Create sign-in" instead, which issues one with the same password.
 */
function SetTemporaryPassword({ u, onClose }: { u: User; onClose: () => void }) {
  const { log } = useSession();
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);
  /** True once the server has said this profile has no sign-in to set a password on. */
  const [noSignIn, setNoSignIn] = useState(false);

  const fail = (error: string, notDeployed?: boolean) => { setBusy(false); setErr(notDeployed ? `${error} ${NOT_DEPLOYED_HINT}` : error); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setHint("");
    const problem = passwordProblem(pw);
    if (problem) return setErr(problem);
    setBusy(true);
    try {
    const server = store.server;
    if (!server) {
      const hash = await hashPassword(pw);
      await store.mutateOrg((o) => { if (o.users[u.id]) o.users[u.id].passwordHash = hash; return o; });
      await log("Temporary password set", u.email);
      setBusy(false);
      toast(`Temporary password set for ${u.name}`);
      onClose();
      return;
    }
    if (noSignIn) {
      const r = await server.createSignIn({ appUserId: u.id, email: u.email, password: pw, name: u.name, phone: u.phone });
      if (!r.ok) return fail(r.error, r.notDeployed);
      await log("Sign-in issued", u.email, ROLE_LABEL[u.role]);
      setBusy(false);
      toast(`Sign-in issued for ${u.name}`);
      onClose();
      return;
    }
    const r = await server.setTemporaryPassword(u.id, pw);
    if (!r.ok) {
      if (/no sign-in yet/i.test(r.error)) { setBusy(false); setNoSignIn(true); setHint("This profile has no sign-in yet. Create one with this password instead."); return; }
      return fail(r.error, r.notDeployed);
    }
    await log("Temporary password set", u.email);
    toast(`Temporary password set for ${u.name}`);
    onClose();
    } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`${noSignIn ? "Create sign-in" : "Set temporary password"} — ${u.name}`} width={460}>
      <form onSubmit={submit} className="stack-sm" noValidate>
        <p className="muted">{u.email}</p>
        <TextField label="Temporary password" value={pw} onChange={setPw} required autoComplete="off" hint={noSignIn ? "They sign in with their email and this password." : "Share it with them. They sign in with their email and this password."} />
        {hint && <Notice tone="info" role="status">{hint}</Notice>}
        {err && <Notice tone="bad" role="alert">{err}</Notice>}
        <div className="modal-f"><button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : noSignIn ? "Create sign-in" : "Set password"}</button></div>
      </form>
    </Modal>
  );
}
