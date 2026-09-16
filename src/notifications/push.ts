/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Browser push: feature detection, the service worker, and this device's subscription.
 * The permission prompt is only ever raised from subscribeThisDevice(), which the user
 * triggers from Notification settings; never on page load.
 */
export type PushSupport = "unsupported" | "insecure" | "no-key" | "ready";

export interface PushSubscriptionInput { endpoint: string; p256dh: string; auth: string; userAgent: string }
export interface PushDevice { endpoint: string; createdAt: string; lastSeenAt?: string; userAgent?: string }

export function pushSupport(vapidPublicKey?: string): PushSupport {
  if (typeof window === "undefined" || typeof navigator === "undefined") return "unsupported";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  const local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if (location.protocol === "file:" || !(location.protocol === "https:" || local)) return "insecure";
  if (!vapidPublicKey) return "no-key";
  return "ready";
}

export function permissionState(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  try { return await navigator.serviceWorker.register("./sw.js", { scope: "./" }); } catch { return null; }
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try { return (await navigator.serviceWorker.getRegistration("./")) ?? null; } catch { return null; }
}

/** Raises the browser prompt (once) and subscribes this device. Null when refused or unavailable. */
export async function subscribeThisDevice(vapidPublicKey: string): Promise<PushSubscriptionInput | null> {
  const reg = await registerServiceWorker();
  if (!reg) return null;
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return null;
  const key = urlBase64ToUint8Array(vapidPublicKey);
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key.buffer as ArrayBuffer });
  const json = sub.toJSON();
  return { endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", userAgent: navigator.userAgent.slice(0, 200) };
}

export async function currentEndpoint(): Promise<string | null> {
  const reg = await registration();
  try { return (await reg?.pushManager.getSubscription())?.endpoint ?? null; } catch { return null; }
}

/** Unsubscribes this device locally and returns the endpoint so the server row can be revoked. */
export async function unsubscribeThisDevice(): Promise<string | null> {
  const reg = await registration();
  try {
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return null;
    const endpoint = sub.endpoint;
    await sub.unsubscribe();
    return endpoint;
  } catch { return null; }
}

/** Short device label from a user agent string. */
export function deviceLabel(ua?: string): string {
  if (!ua) return "Device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} on ${os}` : browser;
}
