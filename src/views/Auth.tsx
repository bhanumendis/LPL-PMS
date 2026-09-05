/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useSession, LiveBadge, Copyright, ThemeToggle, useDocumentTitle, APP_VERSION } from "@/App";
import { store, hashPassword, uid, nowIso, passwordProblem, MIN_PASSWORD_LENGTH } from "@/lib/store";
import { BRAND_LOGO, COPYRIGHT, ORG_SHORT, PRODUCT, DOC_REF } from "@/lib/brand";
import { Notice, useToast, TextField } from "@/lib/ui";
import type { User } from "@/lib/types";

export function AuthScreen() {
  const { snap } = useSession();
  const setup = snap.org.config.setupComplete;
  useDocumentTitle(setup ? "Sign in" : "Set up");
  return (
    <div className="auth">
      <aside className="auth-side">
        <div>
          <div className="brand"><img src={BRAND_LOGO} alt={ORG_SHORT} /></div>
          <p className="product">{PRODUCT}</p>
        </div>
        <div>
          <h2>{snap.org.config.orgName}</h2>
          <p className="lede">Restricted system. Access is issued by the administrator and every action is recorded in the audit log.</p>
          <dl className="auth-stats">
            <div><dt>9</dt><dd>process stages</dd></div>
            <div><dt>2</dt><dd>Team Leader gates</dd></div>
            <div><dt>3</dt><dd>service level clocks</dd></div>
          </dl>
        </div>
        <div className="foot">
          <span>Built on {DOC_REF}</span>
          <span>{COPYRIGHT}</span>
        </div>
      </aside>
      <main className="auth-main" id="main">
        <div className="auth-card glass page">
          <div className="flex aic jcb g2 mb3">
            <LiveBadge />
            <ThemeToggle />
          </div>
          {setup ? <SignInForm /> : <SetupAdmin />}
          <div className="flex aic jcb wrap g2 mt4">
            <Copyright />
            <span className="ui xs muted">v{APP_VERSION}</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function PasswordField({ label, value, onChange, autoComplete, required = true, hint }: { label: string; value: string; onChange: (v: string) => void; autoComplete: string; required?: boolean; hint?: string }) {
  const [show, setShow] = useState(false);
  const id = React.useId();
  return (
    <div className="field">
      <label htmlFor={id} className="label">{label}{required && <span className="req" aria-hidden="true">*</span>}{required && <span className="sr-only"> (required)</span>}</label>
      {hint && <span className="hint" id={`${id}-hint`}>{hint}</span>}
      <div className="input-wrap" style={{ display: "flex", gap: 6 }}>
        <input id={id} className="input" style={{ paddingLeft: 14 }} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete={autoComplete} required={required} aria-required={required} aria-describedby={hint ? `${id}-hint` : undefined} minLength={MIN_PASSWORD_LENGTH} />
        <button type="button" className="icon-btn" style={{ flexShrink: 0, width: 44, height: 44 }} onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show}>{show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}</button>
      </div>
    </div>
  );
}

function SetupAdmin() {
  const { signIn } = useSession();
  const toast = useToast();
  const [f, setF] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!f.name.trim() || !f.email.trim()) return setErr("Enter your name and work email.");
    const problem = passwordProblem(f.password) ?? passwordProblem(f.confirm);
    if (problem) return setErr(problem);
    if (f.password !== f.confirm) return setErr("The two passwords do not match.");
    setBusy(true);

    // Server-backed: the identity provider owns the password. The database trigger makes
    // the first account an administrator and rejects every later sign-up, so there is
    // nothing to assert from the client.
    const server = store.server;
    if (server) {
      const r = await server.bootstrapSignUp(f.email, f.password, { name: f.name.trim(), phone: f.phone.trim() });
      if ("error" in r) { setBusy(false); return setErr(r.error); }
      if (r.needsConfirmation) { setBusy(false); return setErr("Confirm the email address from your inbox, then sign in. To skip this for a pilot, turn off email confirmation in Supabase under Authentication → Providers."); }
      const profile = await server.profileForAuth(r.authId);
      if (!profile) { setBusy(false); return setErr("The account was created but no LPL profile came back. Check that supabase/schema.sql has been run against this project."); }
      await store.refresh();
      await store.mutateOrg((o) => { o.config.setupComplete = true; return o; });
      await store.appendAudit({ actorId: profile.id, actorName: profile.name, actorRole: "admin", action: "Administrator account created", target: profile.email });
      setBusy(false);
      toast("Administrator account created");
      signIn(profile);
      return;
    }

    const hash = await hashPassword(f.password);
    const u: User = { id: uid(), name: f.name.trim(), email: f.email.trim().toLowerCase(), phone: f.phone.trim(), role: "admin", passwordHash: hash, active: true, createdAt: nowIso(), lastSignInAt: nowIso() };
    const org = await store.mutateOrg((o) => {
      if (o.config.setupComplete) return o;
      o.users[u.id] = u;
      o.config.setupComplete = true;
      return o;
    });
    if (!org.users[u.id]) { setBusy(false); setErr("An administrator has already been set up. Sign in instead."); return; }
    await store.appendAudit({ actorId: u.id, actorName: u.name, actorRole: "admin", action: "Administrator account created", target: u.email });
    setBusy(false);
    toast("Administrator account created");
    signIn(u);
  };
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <div>
        <h1>Set up the administrator</h1>
        <p className="muted mt1">This is the only account ever created from this screen. Every other sign-in is issued by the administrator.</p>
      </div>
      <div className="form-grid">
        <TextField label="Full name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required autoComplete="name" />
        <TextField label="Work email" value={f.email} onChange={(v) => setF({ ...f, email: v })} type="email" required autoComplete="email" inputMode="email" />
        <TextField label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} type="tel" autoComplete="tel" inputMode="tel" />
        <div />
        <PasswordField label="Password" value={f.password} onChange={(v) => setF({ ...f, password: v })} autoComplete="new-password" hint={`At least ${MIN_PASSWORD_LENGTH} characters, mixing three of: lower case, upper case, digits, symbols.`} />
        <PasswordField label="Confirm password" value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} autoComplete="new-password" />
      </div>
      {err && <Notice tone="bad" role="alert">{err}</Notice>}
      <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? "Creating…" : "Create administrator account"}</button>
    </form>
  );
}

function SignInForm() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setBusy(true);

    const server = store.server;
    if (server) {
      const r = await server.signIn(email, pw);
      if ("error" in r) { setBusy(false); return setErr(r.error); }
      const profile = await server.profileForAuth(r.authId);
      if (!profile) { await server.signOut(); setBusy(false); return setErr("No Lyceum Placements profile is linked to this account. Ask an administrator to add you."); }
      if (!profile.active) { await server.signOut(); setBusy(false); return setErr("This account has been deactivated. Contact your administrator."); }
      await server.touchSignIn(profile.id);
      await store.refresh();
      setBusy(false);
      signIn(profile);
      return;
    }

    await store.refresh();
    const u = store.findUserByEmail(email);
    const hash = await hashPassword(pw);
    setBusy(false);
    if (!u || u.passwordHash !== hash) return setErr("The email or password is incorrect.");
    if (!u.active) return setErr("This account has been deactivated. Contact your administrator.");
    void store.mutateOrg((o) => { if (o.users[u.id]) o.users[u.id].lastSignInAt = nowIso(); return o; });
    signIn(u);
  };
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <div>
        <h1>Sign in</h1>
        <p className="muted mt1">Use the email address and password issued to you.</p>
      </div>
      <TextField label="Email" value={email} onChange={setEmail} type="email" required autoComplete="username" inputMode="email" />
      <PasswordField label="Password" value={pw} onChange={setPw} autoComplete="current-password" />
      {err && <Notice tone="bad" role="alert">{err}</Notice>}
      <button className="btn btn-primary btn-lg" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
