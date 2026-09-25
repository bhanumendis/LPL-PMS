/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import React, { useMemo, useState } from "react";
import { Plus, KeyRound, UserRoundX, UserRoundCheck, Download, ShieldCheck, Search } from "lucide-react";
import { useSession } from "@/App";
import { store, uid, nowIso, hashPassword, passwordProblem } from "@/lib/store";
import { ROLE_LABEL, ROLES, assignableRoles, canManageAccount, isGroupItEmail, isPrivileged } from "@/lib/rbac";
import { Modal, Notice, useToast, Pill, Avatar, EmptyState, TextField, SelectField, PageHeader, StatStrip, CardList, FilterBar, ListSkeleton, ReadError, PageFooter } from "@/lib/ui";
import { BP, SEARCH_MIN, useDebounced, useMediaQuery } from "@/lib/hooks";
import { useDashboard, useUsersPage } from "@/lib/useRead";
import { fmtDateTime } from "@/lib/logic";
import { Donut, Legend } from "@/lib/charts";
import type { Role, User } from "@/lib/types";
import { EVENTS } from "@/lib/audit";
import { ChangeRoleDialog } from "./ChangeRole";

/** Shown beside an admin-users failure when the workspace is not connected through lpl-api. */
const NOT_DEPLOYED_HINT = "Sign-ins are issued by the API server (lpl-api). Connect this workspace to its address under Settings → Server connection, not to the database project directly.";

export function StaffPage() {
  const { users, user, audit, snap, can, go } = useSession();
  const phone = useMediaQuery(BP.mobile);
  const toast = useToast();
  const [tab, setTab] = useState<"staff" | "students">("staff");
  const [creating, setCreating] = useState(false);
  const [passwordFor, setPasswordFor] = useState<User | null>(null);
  const [roleFor, setRoleFor] = useState<User | null>(null);
  const [q, setQ] = useState("");
  const canWrite = can("staff.write");
  const canAccount = can("account.write");
  const canDeactivate = can("account.delete");
  // Staff are few and held by the session; student profiles grow with the caseload and are
  // read a page at a time from the server.
  const staff = useMemo(() => Object.values(users).filter((u) => u.role !== "student").sort((a, b) => a.name.localeCompare(b.name)), [users]);
  const term = useDebounced(q.trim(), 250);
  const students = useUsersPage(tab === "students" ? { role: "student", ...(term.length >= SEARCH_MIN ? { q: term } : {}) } : null);
  const dash = useDashboard(tab === "staff");
  const openLoad = useMemo(() => new Map((dash.data?.counsellors ?? []).map((x) => [x.id, x.open])), [dash.data]);
  const list: (User & { caseId?: string | null; caseRef?: string | null })[] = tab === "staff" ? staff : students.rows;
  const byRole = ROLES.filter((r) => r.id !== "student").map((r) => ({ label: r.label, n: staff.filter((u) => u.role === r.id && u.active).length })).filter((x) => x.n > 0);
  const searchId = React.useId();

  /** What the signed-in user may do to this account; administrator accounts belong to Super Admin. */
  const acts = (u: User) => {
    const manage = canManageAccount(user, u) && u.id !== user?.id;
    return { password: canAccount && canManageAccount(user, u), active: canDeactivate && manage, role: canWrite && manage };
  };

  const toggle = async (u: User) => {
    if (!user || !acts(u).active) return;
    const next = !u.active;
    const server = store.server;
    /** The profile flag is always written; on a server the identity itself is also blocked or unblocked. */
    let warn: string | null = null;
    try {
      if (server) {
        const r = await server.setSignInActive(u.id, next);
        if (!r.ok) warn = r.notDeployed ? `Profile updated. Deploy the admin-users function to also ${next ? "unblock" : "block"} the sign-in itself.` : `Profile updated. The sign-in itself was not changed: ${r.error}`;
      }
      await store.mutateUser(u.id, (x) => { x.active = next; });
      await audit(EVENTS.accountActive(u, next, warn ? "Profile only; sign-in unchanged" : undefined));
      if (warn) toast(warn, "warn"); else toast(`${u.name} ${next ? "reactivated" : "deactivated"}`);
    } catch { /* reported by the store */ }
  };

  const exportCsv = () => {
    const rows = [["Name", "Role", "Email", "Phone", "Branch", "Status", "Last sign-in"], ...staff.map((u) => [u.name, ROLE_LABEL[u.role], u.email, u.phone ?? "", u.branch ?? "", u.active ? "Active" : "Deactivated", u.lastSignInAt ?? ""])];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "lpl-staff.csv"; a.click();
    void audit(EVENTS.staffExported());
  };

  const caseCell = (u: User & { caseId?: string | null; caseRef?: string | null }) => (tab === "staff"
    ? (openLoad.get(u.id) ?? 0)
    : u.caseId ? <button type="button" className="row-btn" onClick={() => go({ page: "case", caseId: u.caseId! })}>{u.caseRef}</button> : "—");

  return (
    <div className="stack">
      <PageHeader
        title="Staff"
        context={<>Profiles, roles and access for {snap.org.config.orgName}.</>}
        actions={<>
          {can("staff.download") && <button type="button" className="btn btn-secondary" onClick={exportCsv}><Download aria-hidden />Export staff CSV</button>}
          {canWrite && <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><Plus aria-hidden />Create a profile</button>}
        </>}
      />
      <StatStrip label="Staff position" stats={[
        { id: "active", label: "Active staff", value: staff.filter((u) => u.active).length, sub: `${staff.filter((u) => !u.active).length} deactivated` },
        { id: "couns", label: "Counsellors", value: staff.filter((u) => u.role === "counsellor" && u.active).length, sub: "case owners" },
        { id: "tl", label: "Team Leaders", value: staff.filter((u) => u.role === "team_leader" && u.active).length, tone: "info", sub: "approval authority" },
        { id: "admins", label: "Administrators", value: staff.filter((u) => isPrivileged(u.role) && u.active).length, sub: "Admin and Super Admin" },
      ]} />
      <div className="grid staff-grid stagger">
        <div className="staff-main stack">
          <div className="seg" role="tablist" aria-label="Account type">
            <button type="button" role="tab" aria-selected={tab === "staff"} onClick={() => setTab("staff")}>Staff accounts</button>
            <button type="button" role="tab" aria-selected={tab === "students"} onClick={() => setTab("students")}>Student accounts</button>
          </div>
          {tab === "students" && (
            <FilterBar label="Find a student account">
              <div className="input-wrap f-search"><Search aria-hidden /><label htmlFor={searchId} className="sr-only">Search student accounts</label><input id={searchId} className="input" type="search" placeholder="Search name or email (three characters or more)" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            </FilterBar>
          )}
          {tab === "students" && students.error ? <ReadError error={students.error} onRetry={students.reload} />
            : tab === "students" && students.loading ? <ListSkeleton label="Loading student accounts" />
            : list.length === 0 ? <EmptyState glyph="students" title={tab === "staff" ? "No staff profiles yet" : term ? "No student accounts match" : "No student accounts yet"} reason={tab === "staff" ? "Create counsellor and Team Leader profiles so cases can be assigned." : term ? "Search for a different name or email." : "Student sign-ins are issued by staff when a student case is created."} /> : (
            phone ? (
              <CardList items={list} keyOf={(u) => u.id} label={tab === "staff" ? "Staff accounts" : "Student accounts"} render={(u) => (
                <div className="case-card">
                  <div className="flex aic jcb g2"><span className="flex aic g2" style={{ minWidth: 0 }}><Avatar name={u.name} size={30} tone={isPrivileged(u.role) ? "ink" : undefined} /><span className="ui small strong truncate">{u.name}</span></span><Pill tone={u.active ? "ok" : "bad"}>{u.active ? "Active" : "Deactivated"}</Pill></div>
                  <p className="xs muted truncate">{ROLE_LABEL[u.role]} · {u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
                  <p className="xs muted">{tab === "staff" ? `${openLoad.get(u.id) ?? 0} open case${openLoad.get(u.id) === 1 ? "" : "s"}` : u.caseRef ?? "No case"} · {u.lastSignInAt ? `signed in ${fmtDateTime(u.lastSignInAt)}` : "never signed in"}</p>
                  {(acts(u).password || acts(u).active || acts(u).role) && (
                    <div className="flex wrap g1">
                      {acts(u).role && tab === "staff" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRoleFor(u)}><ShieldCheck aria-hidden />Change role</button>}
                      {acts(u).password && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPasswordFor(u)}><KeyRound aria-hidden />Temporary password</button>}
                      {acts(u).active && <button type="button" className={`btn btn-sm ${u.active ? "btn-danger-ghost" : "btn-ghost"}`} onClick={() => toggle(u)}>{u.active ? <><UserRoundX aria-hidden />Deactivate</> : <><UserRoundCheck aria-hidden />Reactivate</>}</button>}
                    </div>
                  )}
                </div>
              )} />
            ) : (
            <div className="panel table-wrap">
              <table className="tbl" style={{ minWidth: 760 }}>
                <thead><tr><th scope="col">Name</th><th scope="col">Role</th><th scope="col">Contact</th><th scope="col">Branch</th><th scope="col" className="right">{tab === "staff" ? "Open cases" : "Case"}</th><th scope="col">Last sign-in</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {list.map((u) => (
                    <tr key={u.id}>
                      <td><div className="flex aic g2"><Avatar name={u.name} size={30} tone={isPrivileged(u.role) ? "ink" : undefined} /><span className="primary">{u.name}</span></div></td>
                      <td>{ROLE_LABEL[u.role]}</td>
                      <td><p>{u.email}</p><p className="sub">{u.phone || "—"}</p></td>
                      <td>{u.branch || "—"}</td>
                      <td className="right tnum">{caseCell(u)}</td>
                      <td className="muted nowrap">{u.lastSignInAt ? fmtDateTime(u.lastSignInAt) : "Never"}</td>
                      <td><Pill tone={u.active ? "ok" : "bad"}>{u.active ? "Active" : "Deactivated"}</Pill></td>
                      <td className="right nowrap">
                        {acts(u).role && tab === "staff" && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRoleFor(u)} aria-label={`Change role of ${u.name}`}><ShieldCheck aria-hidden />Role</button>}
                        {acts(u).password && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPasswordFor(u)} aria-label={`Set a temporary password for ${u.name}`}><KeyRound aria-hidden />Password</button>}
                        {acts(u).active && <button type="button" className={`btn btn-sm ${u.active ? "btn-danger-ghost" : "btn-ghost"}`} onClick={() => toggle(u)} aria-label={`${u.active ? "Deactivate" : "Reactivate"} ${u.name}`}>{u.active ? <><UserRoundX aria-hidden />Deactivate</> : <><UserRoundCheck aria-hidden />Reactivate</>}</button>}
                        {!acts(u).password && !acts(u).active && !acts(u).role && <span className="muted" aria-label={isPrivileged(u.role) ? "Managed by Super Admin" : "No actions"}>{isPrivileged(u.role) && user?.role !== "super_admin" ? "Super Admin managed" : "—"}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )
          )}
          {tab === "students" && !students.loading && !students.error && <PageFooter shown={students.rows.length} hasMore={students.hasMore} loadingMore={students.loadingMore} onMore={students.loadMore} noun="accounts" />}
        </div>
        <div className="panel"><div className="panel-h"><h2>Active staff by role</h2></div><div className="panel-b">{byRole.length === 0 ? <EmptyState compact glyph="students" title="No staff yet" /> : <div className="flex g3 aic wrap"><Donut data={byRole} title="Active staff by role" size={130} stroke={20} centerSub="staff" /><div className="grow"><Legend data={byRole} /></div></div>}</div></div>
      </div>
      {creating && <CreateProfile onClose={() => setCreating(false)} />}
      {passwordFor && <SetTemporaryPassword u={passwordFor} onClose={() => setPasswordFor(null)} />}
      {roleFor && <ChangeRoleDialog target={roleFor} onClose={() => setRoleFor(null)} />}
    </div>
  );
}

/**
 * Creates a staff profile and, with the account.write permission, issues its sign-in in the
 * same step. On a server the sign-in goes through lpl-api's admin-users endpoint; if that
 * fails the profile is kept and the sign-in can be issued later from this page.
 */
function CreateProfile({ onClose }: { onClose: () => void }) {
  const { user, audit, snap, can } = useSession();
  const toast = useToast();
  const canAccount = can("account.write");
  const grantable = assignableRoles(user);
  const roles = ROLES.filter((r) => r.id !== "student" && grantable.includes(r.id));
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
    if (f.role === "super_admin" && !isGroupItEmail(f.email, await store.groupItDomains())) return setErr("Super Admin is restricted to Group IT email addresses.");
    if (issue) { const problem = passwordProblem(f.password); if (problem) return setErr(problem); }
    setBusy(true);
    try {
    if (await store.emailTaken(f.email)) { setBusy(false); return setErr("A profile with this email already exists."); }
    const server = store.server;
    // Browser storage keeps the hash on the profile. On a server the identity provider holds
    // the password and this field stays empty.
    const hash = issue && !server ? await hashPassword(f.password) : "";
    const u: User = { id: uid(), name: f.name.trim(), email: f.email.trim().toLowerCase(), phone: f.phone.trim(), branch: f.branch.trim(), role: f.role, passwordHash: hash, active: true, createdAt: nowIso(), createdBy: user.id };
    await store.mutateOrg((o) => { o.users[u.id] = u; return o; });
    await audit(EVENTS.profileCreated(u));
    if (issue) {
      if (server) {
        const r = await server.createSignIn({ appUserId: u.id, email: u.email, password: f.password, name: u.name, phone: u.phone });
        if (!r.ok) {
          await audit(EVENTS.signInNotIssued(u.email, r.error));
          setBusy(false);
          toast(`${ROLE_LABEL[u.role]} profile created for ${u.name}`);
          setCreated({ name: u.name, error: r.error, notDeployed: !!r.notDeployed });
          return;
        }
      }
      await audit(EVENTS.signInIssued(u.email, ROLE_LABEL[u.role]));
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
 * through lpl-api's admin-users endpoint. A profile that has no sign-in yet (the endpoint
 * answers 409) is offered "Create sign-in" instead, which issues one with the same password.
 */
function SetTemporaryPassword({ u, onClose }: { u: User; onClose: () => void }) {
  const { audit } = useSession();
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
      await audit(EVENTS.temporaryPassword(u));
      setBusy(false);
      toast(`Temporary password set for ${u.name}`);
      onClose();
      return;
    }
    if (noSignIn) {
      const r = await server.createSignIn({ appUserId: u.id, email: u.email, password: pw, name: u.name, phone: u.phone });
      if (!r.ok) return fail(r.error, r.notDeployed);
      await audit(EVENTS.signInIssued(u.email, ROLE_LABEL[u.role]));
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
    await audit(EVENTS.temporaryPassword(u));
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
