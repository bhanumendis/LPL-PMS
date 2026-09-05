// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
//
// admin-users — the only place a sign-in account is created.
//
// Registration is closed: the browser never calls /auth/v1/signup except to bootstrap the
// first administrator on an empty project. Every other account is created here, by an
// administrator, with the service role key that never leaves the server.
//
// Deploy:   supabase functions deploy admin-users
// Secrets:  SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are injected by
//           the platform; nothing else is required.
//
// Contract (POST, JSON, Authorization: Bearer <caller access token>):
//   { action: "create",       app_user_id, password }   -> { auth_id }
//   { action: "set_password", app_user_id, password }   -> { auth_id }
//   { action: "deactivate",   app_user_id }             -> { auth_id }
//   { action: "reactivate",   app_user_id }             -> { auth_id }
// The caller must resolve to an active Administrator through public.current_app_role().
// The profile row must already exist in public.app_users; its email is the sign-in email.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MIN_PASSWORD_LENGTH = 10;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

/** Same rule as the application: length plus at least three character classes. */
function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return "Mix at least three of: lower case, upper case, digits, symbols.";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "The function environment is incomplete." }, 500);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Sign in required." }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; } catch { return json({ error: "Invalid JSON body." }, 400); }
  const action = String(body.action ?? "");
  const appUserId = typeof body.app_user_id === "string" ? body.app_user_id.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!appUserId) return json({ error: "app_user_id is required." }, 400);

  // Who is calling, and do they hold the matrix cell for this action? Resolved through the
  // same SECURITY DEFINER helpers the policies use, with the caller's own token, so a forged
  // or expired token gets no role. The Administrator holds every cell; other roles hold
  // account.write / account.delete only when the matrix grants it.
  const caller = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
  const needed = action === "deactivate" || action === "reactivate" ? "account.delete" : "account.write";
  const { data: allowed, error: permError } = await caller.rpc("app_can", { perm: needed });
  if (permError || allowed !== true) return json({ error: `This action requires the ${needed} permission.` }, 403);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: profile, error: profileError } = await admin
    .from("app_users")
    .select("id, email, name, phone, auth_id, active")
    .eq("id", appUserId)
    .maybeSingle();
  if (profileError) return json({ error: profileError.message }, 500);
  if (!profile) return json({ error: "No profile with that id. Create the profile first." }, 404);

  switch (action) {
    case "create": {
      if (profile.auth_id) return json({ error: "This profile already has a sign-in." }, 409);
      const problem = passwordProblem(password);
      if (problem) return json({ error: problem }, 400);
      // app_metadata can only be written with the service role, which is how the database
      // trigger tells a provisioned identity from a public sign-up.
      const { data, error } = await admin.auth.admin.createUser({
        email: String(profile.email).toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { name: profile.name, phone: profile.phone ?? "" },
        app_metadata: { provisioned: "admin-users", app_user_id: profile.id },
      });
      if (error || !data.user) return json({ error: error?.message ?? "The identity provider refused the request." }, 400);
      const { error: linkError } = await admin.from("app_users").update({ auth_id: data.user.id }).eq("id", profile.id).is("auth_id", null);
      if (linkError) return json({ error: `Identity created but not linked: ${linkError.message}` }, 500);
      return json({ auth_id: data.user.id });
    }
    case "set_password": {
      if (!profile.auth_id) return json({ error: "This profile has no sign-in yet." }, 409);
      const problem = passwordProblem(password);
      if (problem) return json({ error: problem }, 400);
      const { error } = await admin.auth.admin.updateUserById(profile.auth_id, { password });
      if (error) return json({ error: error.message }, 400);
      return json({ auth_id: profile.auth_id });
    }
    case "deactivate": {
      if (!profile.auth_id) return json({ auth_id: "" });
      // A banned identity cannot obtain a new token; the active flag on the profile removes
      // the role from any token that is still live.
      const { error } = await admin.auth.admin.updateUserById(profile.auth_id, { ban_duration: "876000h" });
      if (error) return json({ error: error.message }, 400);
      return json({ auth_id: profile.auth_id });
    }
    case "reactivate": {
      if (!profile.auth_id) return json({ auth_id: "" });
      const { error } = await admin.auth.admin.updateUserById(profile.auth_id, { ban_duration: "none" });
      if (error) return json({ error: error.message }, 400);
      return json({ auth_id: profile.auth_id });
    }
    default:
      return json({ error: "Unknown action." }, 400);
  }
});
