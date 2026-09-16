/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Notification settings: browser push for this device, the devices already subscribed, and
 * an honest account of why push may be unavailable. The browser's permission prompt is
 * raised only from the "Enable on this device" button.
 */
import { useCallback, useEffect, useState } from "react";
import { BellRing, MonitorSmartphone, Trash2 } from "lucide-react";
import { useSession } from "@/App";
import { store } from "@/lib/store";
import { fmtDate } from "@/lib/logic";
import { Notice, Pill, useToast } from "@/lib/ui";
import { currentEndpoint, deviceLabel, permissionState, pushSupport, subscribeThisDevice, unsubscribeThisDevice, type PushDevice } from "./push";

export function NotificationSettings() {
  const { snap, isAdmin } = useSession();
  const toast = useToast();
  const key = snap.org.config.push?.vapidPublicKey;
  const support = pushSupport(key);
  const [perm, setPerm] = useState(permissionState());
  const [devices, setDevices] = useState<PushDevice[] | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [list, ep] = await Promise.all([store.listPushSubscriptions(), currentEndpoint()]);
      setDevices(list); setMine(ep);
    } catch { setDevices([]); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const thisDeviceOn = !!mine && (devices ?? []).some((d) => d.endpoint === mine);

  const enable = async () => {
    if (!key) return;
    setBusy(true);
    try {
      const sub = await subscribeThisDevice(key);
      setPerm(permissionState());
      if (!sub) { toast(permissionState() === "denied" ? "Notifications are blocked for this site in the browser." : "This device could not be subscribed.", "warn"); return; }
      await store.savePushSubscription(sub);
      toast("This device will receive notifications");
      await refresh();
    } catch (e) { toast((e as Error).message || "The subscription could not be saved.", "bad"); }
    finally { setBusy(false); }
  };
  const remove = async (endpoint?: string) => {
    setBusy(true);
    try {
      const ep = endpoint ?? (await unsubscribeThisDevice());
      if (endpoint && endpoint === mine) await unsubscribeThisDevice();
      if (ep) await store.revokePushSubscription(ep);
      await refresh();
      toast("Device removed");
    } catch (e) { toast((e as Error).message || "The device could not be removed.", "bad"); }
    finally { setBusy(false); }
  };

  return (
    <div className="stack-sm nsettings">
      <div className="surface-2" style={{ padding: 14 }}>
        <p className="ui strong flex aic g2"><BellRing aria-hidden style={{ width: 16, height: 16, color: "var(--accent-text)" }} />Push notifications on this device</p>
        {support === "unsupported" && <p className="small muted mt1">This browser does not support push notifications. The bell and in-app notifications still work.</p>}
        {support === "insecure" && <p className="small muted mt1">Push notifications need the hosted (HTTPS) version of the application. They are not available when the file is opened directly.</p>}
        {support === "no-key" && <p className="small muted mt1">Push has not been set up for this workspace yet.{isAdmin ? " Add the VAPID public key under Settings → Notifications." : " Ask an administrator."}</p>}
        {support === "ready" && perm === "denied" && <Notice tone="warn">Notifications are blocked for this site. Allow them in the browser's site settings, then try again.</Notice>}
        {support === "ready" && perm !== "denied" && !thisDeviceOn && (
          <>
            <p className="small muted mt1">Get a desktop or phone notification when a gate is decided, a document is reviewed, a case is assigned to you or a deadline approaches. Your browser will ask once; you can turn this off here at any time.</p>
            <div className="mt2"><button type="button" className="btn btn-primary btn-sm" onClick={enable} disabled={busy}>{busy ? "Working…" : "Enable on this device"}</button></div>
          </>
        )}
        {support === "ready" && thisDeviceOn && (
          <div className="flex aic jcb wrap g2 mt1">
            <span className="small"><Pill tone="ok">On</Pill> <span className="ink2">This device receives notifications.</span></span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => remove()} disabled={busy}>Disable on this device</button>
          </div>
        )}
      </div>
      <div>
        <p className="ui xs muted" style={{ marginBottom: 6 }}>Subscribed devices</p>
        {devices === null ? <p className="small muted">Loading…</p> : devices.length === 0 ? <p className="small muted">No devices yet.</p> : (
          <ul className="stack-sm">
            {devices.map((d) => (
              <li key={d.endpoint} className="flex aic g2 device-row">
                <MonitorSmartphone aria-hidden style={{ width: 16, height: 16, color: "var(--muted)", flexShrink: 0 }} />
                <span className="grow small" style={{ minWidth: 0 }}>
                  <span className="ui strong" style={{ display: "block" }}>{deviceLabel(d.userAgent)}{d.endpoint === mine && <Pill tone="info" className="ml1">This device</Pill>}</span>
                  <span className="xs muted">Added {fmtDate(d.createdAt)}</span>
                </span>
                <button type="button" className="icon-btn sm" aria-label={`Remove ${deviceLabel(d.userAgent)}`} onClick={() => remove(d.endpoint)} disabled={busy}><Trash2 aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="xs muted">In-app notifications and the bell work on every device regardless of this setting.</p>
    </div>
  );
}
