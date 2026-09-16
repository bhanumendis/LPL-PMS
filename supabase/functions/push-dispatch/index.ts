// Lyceum Placements — Placement Management System
// Copyright (c) 2026 Bhanu Mendis. All rights reserved.
// Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
//
// push-dispatch — delivers pending notifications to Web Push subscriptions.
//
// Deploy:   supabase functions deploy push-dispatch
// Secrets:  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…), DISPATCH_SECRET.
//           SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
// Invoke:   POST with header  x-lpl-dispatch-secret: <DISPATCH_SECRET>
//           from a Database Webhook on insert into public.notifications, or from pg_cron every
//           minute:  select cron.schedule('lpl-push', '* * * * *', $$select net.http_post(
//             url := '<functions-url>/push-dispatch', headers := '{"x-lpl-dispatch-secret":"…"}'::jsonb) $$);
//
// Behaviour: takes up to 200 notifications with pushed_at null (oldest first), sends each to
// the recipient's active subscriptions, marks pushed_at on success or permanent failure,
// revokes subscriptions that answer 404/410, and leaves rows for retry on transient errors
// (up to 5 attempts). The service role key never leaves this function.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

const CORS: Record<string, string> = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-lpl-dispatch-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const MAX_ATTEMPTS = 5;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

interface NotificationRow { id: string; recipient_id: string; title: string; body: string | null; link: string | null; push_attempts: number }
interface SubscriptionRow { id: string; user_id: string; endpoint: string; p256dh: string; auth: string }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:it@lyceum.lk";
  const secret = Deno.env.get("DISPATCH_SECRET");
  if (!url || !service || !vapidPublic || !vapidPrivate || !secret) return json({ error: "The function environment is incomplete." }, 500);
  if (req.headers.get("x-lpl-dispatch-secret") !== secret) return json({ error: "Not authorised." }, 401);

  webpush.setVapidDetails(subject, vapidPublic, vapidPrivate);
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: pending, error } = await admin.from("notifications")
    .select("id, recipient_id, title, body, link, push_attempts")
    .is("pushed_at", null).lt("push_attempts", MAX_ATTEMPTS)
    .order("at", { ascending: true }).limit(200);
  if (error) return json({ error: error.message }, 500);
  const rows = (pending ?? []) as NotificationRow[];
  if (!rows.length) return json({ sent: 0, pending: 0 });

  const recipients = [...new Set(rows.map((r) => r.recipient_id))];
  const { data: subs, error: subError } = await admin.from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth").in("user_id", recipients).is("revoked_at", null);
  if (subError) return json({ error: subError.message }, 500);
  const byUser = new Map<string, SubscriptionRow[]>();
  for (const s of (subs ?? []) as SubscriptionRow[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  let sent = 0, revoked = 0, retried = 0;
  const now = new Date().toISOString();
  for (const n of rows) {
    const targets = byUser.get(n.recipient_id) ?? [];
    // No device: nothing to deliver; mark done so the row is not re-read every minute.
    if (!targets.length) { await admin.from("notifications").update({ pushed_at: now }).eq("id", n.id); continue; }
    let transient = false;
    for (const s of targets) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ id: n.id, title: n.title, body: n.body ?? undefined, link: n.link ?? "#/" }), { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode ?? 0;
        if (status === 404 || status === 410) { await admin.from("push_subscriptions").update({ revoked_at: now }).eq("id", s.id); revoked++; }
        else if (status >= 500 || status === 429 || status === 0) transient = true;
        // 4xx other than 404/410 is permanent for this row: fall through and mark pushed.
      }
    }
    if (transient) { await admin.from("notifications").update({ push_attempts: n.push_attempts + 1 }).eq("id", n.id); retried++; }
    else await admin.from("notifications").update({ pushed_at: now }).eq("id", n.id);
  }
  return json({ sent, revoked, retried, pending: rows.length });
});
