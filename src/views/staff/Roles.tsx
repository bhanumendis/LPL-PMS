/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Roles and permissions: the role list, each role's permissions, who holds it, and the whole
 * matrix side by side. Changing a cell or a case scope is reserved for SUPER ADMIN (Group IT);
 * ADMIN reads the same page to see exactly what each role may do. The database enforces
 * every cell (app_can, row-level security, guard triggers): this page shows and edits the
 * configuration, it is not the control.
 */
import React, { useId, useMemo, useRef, useState } from "react";
import { RotateCcw, Lock, Check, Minus, ShieldCheck, Users as UsersIcon } from "lucide-react";
import { useSession } from "@/App";
import { store } from "@/lib/store";
import {
  ROLES, ROLE_LABEL, RESOURCE_DEFS, PERMISSIONS, ACTION_LABEL, ACTION_HELP, DEFAULT_PERMISSIONS, DEFAULT_CASE_SCOPE, CASE_SCOPE_LABEL,
  permissionLabel, roleHas, isLocked, isReserved, caseScopeOf, normalizePermissions, canManageAccount, isPrivileged,
} from "@/lib/rbac";
import { useToast, Notice, Switch, Field, PageHeader, SegmentedSwitch, Pill, Avatar, EmptyState, CardList } from "@/lib/ui";
import { BP, useMediaQuery } from "@/lib/hooks";
import { fmtDateTime } from "@/lib/logic";
import { ACTIONS, type CaseScope, type Permission, type Role, type User } from "@/lib/types";
import { EVENTS } from "@/lib/audit";
import { ChangeRoleDialog } from "./ChangeRole";

const SCOPES: CaseScope[] = ["none", "own", "assigned", "all"];
const isScope = (v: string): v is CaseScope => (SCOPES as string[]).includes(v);
const isRole = (v: string | undefined): v is Role => ROLES.some((r) => r.id === v);
type View = "permissions" | "members" | "compare";

export function RolesPage() {
  const { snap, audit, can, users, user, route, go } = useSession();
  const toast = useToast();
  const phone = useMediaQuery(BP.mobile);
  const config = snap.org.config;
  const editable = can("role.write");
  const readable = can("role.read");
  const role: Role = isRole(route.id) ? route.id : "super_admin";
  const [view, setView] = useState<View>("permissions");
  const [roleFor, setRoleFor] = useState<User | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const scopeId = useId();
  const panelId = useId();
  const groups = Array.from(new Set(RESOURCE_DEFS.map((d) => d.group)));
  const roleDef = ROLES.find((r) => r.id === role) ?? ROLES[0];
  const members = useMemo(() => {
    const out: Record<Role, User[]> = { super_admin: [], admin: [], team_leader: [], counsellor: [], student: [] };
    for (const u of Object.values(users)) out[u.role]?.push(u);
    for (const k of Object.keys(out) as Role[]) out[k].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
    return out;
  }, [users]);
  const held = (r: Role) => PERMISSIONS.filter((p) => roleHas(config, p, r)).length;
  const scope = caseScopeOf(config, role);
  const scopeLocked = role === "super_admin" || !editable;
  const select = (r: Role) => go({ page: "roles", id: r });

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = ROLES.length; let j = i;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") j = (i + 1) % n;
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") j = (i - 1 + n) % n;
    else if (e.key === "Home") j = 0; else if (e.key === "End") j = n - 1; else return;
    e.preventDefault(); select(ROLES[j].id); tabRefs.current[j]?.focus();
  };

  const toggle = async (perm: Permission, r: Role) => {
    if (isLocked(perm, r) || !editable) return;
    const has = roleHas(config, perm, r);
    try {
      await store.mutateOrg((o) => {
        const cur = o.config.permissions[perm] ?? [...DEFAULT_PERMISSIONS[perm]];
        o.config.permissions[perm] = has ? cur.filter((x) => x !== r) : [...cur, r];
        o.config.permissions = normalizePermissions(o.config.permissions);
        return o;
      });
      await audit(EVENTS.permissionChanged(perm, r, !has));
      toast(`${has ? "Removed" : "Granted"} “${permissionLabel(perm)}” for ${ROLE_LABEL[r]}`);
    } catch { /* the store reports the refusal */ }
  };
  const reset = async () => {
    try {
      await store.mutateOrg((o) => { o.config.permissions = normalizePermissions(DEFAULT_PERMISSIONS); o.config.caseScope = { ...DEFAULT_CASE_SCOPE }; return o; });
      await audit(EVENTS.permissionsReset());
      toast("Permissions restored to the standard model");
    } catch { /* reported by the store */ }
  };
  const setScope = async (v: string) => {
    if (scopeLocked || !isScope(v)) return;
    const from = config.caseScope?.[role];
    try {
      await store.mutateOrg((o) => { o.config.caseScope = { ...DEFAULT_CASE_SCOPE, ...(o.config.caseScope ?? {}), [role]: v }; return o; });
      await audit(EVENTS.caseScopeChanged(role, v, from));
      toast(`${ROLE_LABEL[role]}: ${CASE_SCOPE_LABEL[v].toLowerCase()}`);
    } catch { /* reported by the store */ }
  };

  const cell = (perm: Permission) => {
    const locked = isLocked(perm, role);
    return <Switch checked={roleHas(config, perm, role)} locked={locked || !editable} onChange={() => toggle(perm, role)} label={`${permissionLabel(perm)} for ${ROLE_LABEL[role]}${locked ? " (locked)" : !editable ? " (read only)" : ""}`} />;
  };

  return (
    <div className="stack">
      <PageHeader
        title="Roles and permissions"
        context="Who can do what. Super Admin (Group IT) holds every permission and is the only role that can change this page. Every cell is enforced by the database, not by what the interface shows."
        actions={editable ? <button type="button" className="btn btn-secondary" onClick={reset}><RotateCcw aria-hidden />Restore standard model</button> : undefined}
      />
      {!editable && <Notice tone="info">You can read this page. Roles, permissions and case visibility are changed by a Super Admin (Group IT).</Notice>}

      <div className="roles-layout">
        <div className="role-list" role="tablist" aria-label="Roles" aria-orientation={phone ? "horizontal" : "vertical"}>
          {ROLES.map((r, i) => {
            const n = members[r.id].filter((u) => u.active).length;
            return (
              <button key={r.id} ref={(el) => { tabRefs.current[i] = el; }} type="button" role="tab" id={`role-tab-${r.id}`} aria-controls={panelId}
                aria-selected={role === r.id} tabIndex={role === r.id ? 0 : -1} className="role-tab" onClick={() => select(r.id)} onKeyDown={(e) => onTabKey(e, i)}>
                <span className="role-tab-name">{r.label}{isPrivileged(r.id) && <ShieldCheck aria-hidden />}</span>
                <span className="role-tab-meta">{n} active · {held(r.id)} of {PERMISSIONS.length}</span>
              </button>
            );
          })}
        </div>

        <section className="role-detail stack" role="tabpanel" id={panelId} aria-labelledby={`role-tab-${role}`}>
          <div className="card">
            <div className="role-head">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="flex wrap aic g2">
                  <h2>{roleDef.label}</h2>
                  {role === "super_admin" && <Pill tone="info">Group IT only</Pill>}
                  {role === "admin" && <Pill tone="neutral">Placement Team</Pill>}
                </div>
                <p className="small muted mt1">{roleDef.description}</p>
              </div>
              <dl className="role-facts">
                <div><dt>Active members</dt><dd className="tnum">{members[role].filter((u) => u.active).length}</dd></div>
                <div><dt>Permissions held</dt><dd className="tnum">{held(role)} <span className="muted">of {PERMISSIONS.length}</span></dd></div>
              </dl>
              <div className="role-scope">
                <Field label="Case visibility" htmlFor={scopeId} hint={role === "super_admin" ? "Locked: Super Admin sees every case." : "Applied on top of the case permissions."}>
                  <select id={scopeId} className="input" value={scope} disabled={scopeLocked} onChange={(e) => setScope(e.target.value)} aria-describedby={`${scopeId}-hint`}>
                    {SCOPES.map((s) => <option key={s} value={s}>{CASE_SCOPE_LABEL[s]}</option>)}
                  </select>
                </Field>
              </div>
            </div>
          </div>

          {!readable ? <Notice tone="neutral">Your role can see the role summaries. The role.read permission opens the full matrix and membership.</Notice> : <>
            <SegmentedSwitch<View> label="View" value={view} onChange={setView} options={[
              { id: "permissions", label: "Permissions" },
              { id: "members", label: "Members", count: members[role].length || undefined },
              { id: "compare", label: "Compare roles" },
            ]} />

            {view === "permissions" && (phone ? (
              <CardList label={`${roleDef.label} permissions`} items={RESOURCE_DEFS} keyOf={(d) => d.id} render={(def) => (
                <div className="stack-sm">
                  <div><p className="ui small strong">{def.label}</p><p className="xs muted">{def.description}</p></div>
                  <ul className="perm-rows" role="list">
                    {def.actions.map((a) => {
                      const perm = `${def.id}.${a}` as Permission;
                      return <li key={a}><span className="small">{ACTION_LABEL[a]}{isLocked(perm, role) && <span className="lock"><Lock aria-hidden />Locked</span>}</span>{cell(perm)}</li>;
                    })}
                  </ul>
                </div>
              )} />
            ) : (
              <div className="panel table-wrap">
                <table className="tbl rbac">
                  <caption className="sr-only">Permissions held by {roleDef.label}</caption>
                  <thead><tr><th scope="col">Resource</th>{ACTIONS.map((a) => <th key={a} scope="col" className="act">{ACTION_LABEL[a]}<span className="sr-only">: {ACTION_HELP[a]}</span></th>)}</tr></thead>
                  <tbody>
                    {groups.map((g) => (
                      <React.Fragment key={g}>
                        <tr className="group"><th scope="rowgroup" colSpan={6}>{g}</th></tr>
                        {RESOURCE_DEFS.filter((d) => d.group === g).map((def) => (
                          <tr key={def.id}>
                            <th scope="row"><p className="primary">{def.label}</p><span className="res-desc">{def.description}</span></th>
                            {ACTIONS.map((a) => {
                              if (!def.actions.includes(a)) return <td key={a} className="cell"><span className="na" aria-hidden="true">—</span><span className="sr-only">not applicable</span></td>;
                              const perm = `${def.id}.${a}` as Permission;
                              const note = def.notes?.[a];
                              return (
                                <td key={a} className="cell">
                                  {cell(perm)}
                                  {isLocked(perm, role) && role !== "super_admin" && <div><span className="lock"><Lock aria-hidden />Super Admin only</span></div>}
                                  {note && <span className="cell-note">{note}</span>}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {view === "members" && (
              role === "student" ? (
                <Notice tone="neutral">{members.student.length ? `${members.student.length} student account${members.student.length === 1 ? "" : "s"} loaded. ` : ""}Student accounts are created from a case and listed under Staff → Student accounts.</Notice>
              ) : members[role].length === 0 ? (
                <EmptyState glyph="students" title={`No ${roleDef.label} accounts`} reason={role === "admin" ? "Placement Team administrators are appointed by a Super Admin, from Staff or from another role's member list." : "Assign this role from Staff, or change an existing member's role here."} />
              ) : (
                <CardList label={`${roleDef.label} members`} items={members[role]} keyOf={(u) => u.id} className="members" render={(u) => {
                  const mayChange = can("staff.write") && canManageAccount(user, u) && u.id !== user?.id;
                  return (
                    <div className="member-row">
                      <Avatar name={u.name} size={32} tone={isPrivileged(u.role) ? "ink" : undefined} />
                      <div className="grow" style={{ minWidth: 0 }}>
                        <p className="ui small strong truncate">{u.name}{u.id === user?.id ? " (you)" : ""}</p>
                        <p className="xs muted truncate">{u.email} · {u.lastSignInAt ? `signed in ${fmtDateTime(u.lastSignInAt)}` : "never signed in"}</p>
                      </div>
                      <Pill tone={u.active ? "ok" : "bad"}>{u.active ? "Active" : "Deactivated"}</Pill>
                      {mayChange && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRoleFor(u)} aria-label={`Change role of ${u.name}`}><UsersIcon aria-hidden />Change role</button>}
                    </div>
                  );
                }} />
              )
            )}

            {view === "compare" && (
              <div className="panel table-wrap">
                <table className="tbl rbac compare">
                  <caption className="sr-only">Every permission for every role</caption>
                  <thead><tr><th scope="col">Permission</th>{ROLES.map((r) => <th key={r.id} scope="col" className="act"><abbr title={r.label}>{r.label}</abbr></th>)}</tr></thead>
                  <tbody>
                    {RESOURCE_DEFS.map((def) => (
                      <React.Fragment key={def.id}>
                        <tr className="group"><th scope="rowgroup" colSpan={ROLES.length + 1}>{def.label}{isReserved(`${def.id}.view` as Permission) && def.id !== "role" ? " · Super Admin only" : ""}</th></tr>
                        {def.actions.map((a) => {
                          const perm = `${def.id}.${a}` as Permission;
                          return (
                            <tr key={perm}>
                              <th scope="row" className="small">{ACTION_LABEL[a]}</th>
                              {ROLES.map((r) => {
                                const on = roleHas(config, perm, r.id);
                                return <td key={r.id} className="cell">{on ? <Check className="yes" aria-label="Yes" /> : <Minus className="no" aria-label="No" />}</td>;
                              })}
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>}
          <Notice tone="neutral">Case visibility applies on top of the permissions: a role that may read cases still only sees the cases inside its scope. Administrator accounts (Super Admin, Admin) are managed by a Super Admin only.</Notice>
        </section>
      </div>
      {roleFor && <ChangeRoleDialog target={roleFor} onClose={() => setRoleFor(null)} />}
    </div>
  );
}
