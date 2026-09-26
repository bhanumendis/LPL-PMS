/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 *
 * Assigning a role to someone else's profile. The choices are the roles the signed-in user
 * may grant (SUPER ADMIN may grant any; ADMIN never grants an administrator role), SUPER
 * ADMIN is offered only to Group IT addresses, and the change is audited with its before
 * and after. The database enforces every one of these rules again; this dialog explains
 * them before a refusal.
 */
import React, { useEffect, useId, useState } from "react";
import { useSession } from "@/App";
import { store } from "@/lib/store";
import { ROLES, ROLE_LABEL, assignableRoles, isGroupItEmail } from "@/lib/rbac";
import { EVENTS } from "@/lib/audit";
import { Modal, Notice, useToast } from "@/lib/ui";
import type { Role, User } from "@/lib/types";

export function ChangeRoleDialog({ target, onClose }: { target: User; onClose: () => void }) {
  const { user, audit } = useSession();
  const toast = useToast();
  const groupId = useId();
  const [role, setRole] = useState<Role>(target.role);
  const [domains, setDomains] = useState<string[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let live = true; void store.groupItDomains().then((d) => { if (live) setDomains(d); }); return () => { live = false; }; }, []);

  const choices = assignableRoles(user).filter((r) => (target.role === "student") === (r === "student"));
  const groupIt = domains ? isGroupItEmail(target.email, domains) : false;
  const blocked = role === "super_admin" && !groupIt;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || role === target.role || blocked) return;
    setErr(""); setBusy(true);
    try {
      await store.mutateOrg((o) => { if (o.users[target.id]) o.users[target.id].role = role; return o; });
      await audit(EVENTS.roleAssigned(target, ROLE_LABEL[target.role], ROLE_LABEL[role]));
      toast(`${target.name} is now ${ROLE_LABEL[role]}`);
      onClose();
    } catch (ex) { setErr((ex as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Change role — ${target.name}`} width={520}>
      <form onSubmit={submit} className="stack-sm" noValidate>
        <p className="small muted">{target.email} · currently {ROLE_LABEL[target.role]}</p>
        <fieldset className="role-choices" aria-describedby={`${groupId}-hint`}>
          <legend className="sr-only">New role</legend>
          {choices.map((r) => {
            const def = ROLES.find((x) => x.id === r)!;
            const disabled = r === "super_admin" && !groupIt;
            return (
              <label key={r} className={`role-choice ${role === r ? "on" : ""} ${disabled ? "disabled" : ""}`}>
                <input type="radio" name={groupId} value={r} checked={role === r} disabled={disabled} onChange={() => setRole(r)} />
                <span>
                  <span className="ui strong">{def.label}{r === target.role ? " (current)" : ""}</span>
                  <span className="xs muted">{def.description}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <p id={`${groupId}-hint`} className="xs muted">
          {user?.role === "super_admin"
            ? `Super Admin is restricted to Group IT addresses${domains?.length ? ` (${domains.map((d) => "@" + d).join(", ")})` : ""}. Administrator roles are granted by a Super Admin only.`
            : "Administrator roles are granted by a Super Admin (Group IT)."}
        </p>
        {err && <Notice tone="bad" role="alert">{err}</Notice>}
        <div className="modal-f">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || role === target.role || blocked}>{busy ? "Saving…" : "Change role"}</button>
        </div>
      </form>
    </Modal>
  );
}
