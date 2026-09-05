/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import React, { useId, useRef, useState } from "react";
import { RotateCcw, Lock } from "lucide-react";
import { useSession } from "@/App";
import { store } from "@/lib/store";
import { ROLES, ROLE_LABEL, RESOURCE_DEFS, PERMISSIONS, ACTION_LABEL, ACTION_HELP, DEFAULT_PERMISSIONS, DEFAULT_CASE_SCOPE, CASE_SCOPE_LABEL, permissionLabel, roleHas, isLocked, caseScopeOf, normalizePermissions } from "@/lib/rbac";
import { useToast, Notice, Switch, Field } from "@/lib/ui";
import { ACTIONS, type CaseScope, type Permission, type Role } from "@/lib/types";

const SCOPES: CaseScope[] = ["none", "own", "assigned", "all"];
const isScope = (v: string): v is CaseScope => (SCOPES as string[]).includes(v);

export function RolesPage() {
  const { snap, log, can } = useSession();
  const toast = useToast();
  const config = snap.org.config;
  const editable = can("role.write");
  const [role, setRole] = useState<Role>("admin");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const scopeId = useId();
  const groups = Array.from(new Set(RESOURCE_DEFS.map((d) => d.group)));
  const roleDef = ROLES.find((r) => r.id === role) ?? ROLES[0];
  const held = PERMISSIONS.filter((p) => roleHas(config, p, role)).length;
  const scope = caseScopeOf(config, role);
  const scopeLocked = role === "admin" || !editable;

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const n = ROLES.length; let j = i;
    if (e.key === "ArrowRight") j = (i + 1) % n; else if (e.key === "ArrowLeft") j = (i - 1 + n) % n; else if (e.key === "Home") j = 0; else if (e.key === "End") j = n - 1; else return;
    e.preventDefault(); setRole(ROLES[j].id); tabRefs.current[j]?.focus();
  };

  const toggle = async (perm: Permission, r: Role) => {
    if (isLocked(perm, r) || !editable) return;
    const has = roleHas(config, perm, r);
    await store.mutateOrg((o) => {
      const cur = o.config.permissions[perm] ?? [...DEFAULT_PERMISSIONS[perm]];
      o.config.permissions[perm] = has ? cur.filter((x) => x !== r) : [...cur, r];
      o.config.permissions = normalizePermissions(o.config.permissions);
      return o;
    });
    await log(has ? "Permission removed" : "Permission granted", `${r} · ${perm}`);
    toast(`${has ? "Removed" : "Granted"} “${permissionLabel(perm)}” for ${ROLE_LABEL[r]}`);
  };
  const reset = async () => {
    await store.mutateOrg((o) => { o.config.permissions = normalizePermissions(DEFAULT_PERMISSIONS); o.config.caseScope = { ...DEFAULT_CASE_SCOPE }; return o; });
    await log("Permissions reset to default");
    toast("Permissions restored to the standard model");
  };
  const setScope = async (v: string) => {
    if (scopeLocked || !isScope(v)) return;
    await store.mutateOrg((o) => { o.config.caseScope = { ...DEFAULT_CASE_SCOPE, ...(o.config.caseScope ?? {}), [role]: v }; return o; });
    await log("Case scope changed", `${role} · ${v}`);
    toast(`${ROLE_LABEL[role]}: ${CASE_SCOPE_LABEL[v].toLowerCase()}`);
  };

  return (
    <div className="stack">
      <div className="page-head">
        <div><h1>Roles and permissions</h1><p>Each resource exposes the same five actions. Administrator is the system owner and holds every cell; the Prompt Engineer Workspace cannot be granted to any other role. Changes apply immediately.</p></div>
        {editable && <div className="actions"><button type="button" className="btn btn-secondary" onClick={reset}><RotateCcw aria-hidden />Restore standard model</button></div>}
      </div>

      <div className="seg" role="tablist" aria-label="Role">
        {ROLES.map((r, i) => (
          <button key={r.id} ref={(el) => { tabRefs.current[i] = el; }} type="button" role="tab" aria-selected={role === r.id} tabIndex={role === r.id ? 0 : -1} onClick={() => setRole(r.id)} onKeyDown={(e) => onTabKey(e, i)}>{r.label}</button>
        ))}
      </div>

      <div className="card">
        <div className="flex wrap aic jcb g3">
          <div className="grow" style={{ minWidth: 240 }}>
            <p className="ui strong">{roleDef.label}</p>
            <p className="small muted mt1">{roleDef.description}</p>
            <p className="ui xs mt2" style={{ color: "var(--accent-text)", fontWeight: 600 }}>{held} of {PERMISSIONS.length} cells held</p>
          </div>
          <div style={{ minWidth: 220 }}>
            <Field label="Case visibility" htmlFor={scopeId} hint={role === "admin" ? "Locked: the Administrator sees every case." : "Applied on top of the case cells below."}>
              <select id={scopeId} className="input" value={scope} disabled={scopeLocked} onChange={(e) => setScope(e.target.value)} aria-describedby={`${scopeId}-hint`}>
                {SCOPES.map((s) => <option key={s} value={s}>{CASE_SCOPE_LABEL[s]}</option>)}
              </select>
            </Field>
          </div>
        </div>
      </div>

      {!can("role.read") ? <Notice tone="neutral">Your role can see this area but not the full matrix. The role.read permission opens it.</Notice> : (
      <div className="panel table-wrap">
        <table className="tbl rbac" style={{ minWidth: 820 }}>
          <thead>
            <tr>
              <th scope="col">Resource</th>
              {ACTIONS.map((a) => <th key={a} scope="col" className="act">{ACTION_LABEL[a]}<span className="sr-only">: {ACTION_HELP[a]}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g}>
                <tr className="group"><td colSpan={6}>{g}</td></tr>
                {RESOURCE_DEFS.filter((d) => d.group === g).map((def) => (
                  <tr key={def.id}>
                    <td><p className="primary">{def.label}</p><span className="res-desc">{def.description}</span></td>
                    {ACTIONS.map((a) => {
                      if (!def.actions.includes(a)) return <td key={a} className="cell"><span className="na" aria-hidden="true">—</span><span className="sr-only">not applicable</span></td>;
                      const perm = `${def.id}.${a}` as Permission;
                      const locked = isLocked(perm, role);
                      const note = def.notes?.[a];
                      return (
                        <td key={a} className="cell">
                          <Switch checked={roleHas(config, perm, role)} locked={locked || !editable} onChange={() => toggle(perm, role)} label={`${permissionLabel(perm)} for ${ROLE_LABEL[role]}${locked ? " (locked)" : !editable ? " (read only)" : ""}`} />
                          {locked && <div><span className="lock"><Lock aria-hidden />Locked</span></div>}
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
      </div>)}
      <Notice tone="neutral">Case visibility is applied on top of these cells: a role that may read cases still only sees the cases inside its scope.</Notice>
    </div>
  );
}
