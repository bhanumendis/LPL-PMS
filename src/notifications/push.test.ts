/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { afterEach, describe, expect, it } from "vitest";
import { deviceLabel, permissionState, pushSupport, urlBase64ToUint8Array } from "./push";

const w = window as unknown as Record<string, unknown>;
const nav = navigator as unknown as Record<string, unknown>;
const saved = { PushManager: w.PushManager, Notification: w.Notification, serviceWorker: nav.serviceWorker };

afterEach(() => {
  w.PushManager = saved.PushManager;
  w.Notification = saved.Notification;
  Object.defineProperty(navigator, "serviceWorker", { value: saved.serviceWorker, configurable: true });
});

function fakePushApis(permission: NotificationPermission) {
  w.PushManager = class {};
  w.Notification = class { static permission = permission; };
  Object.defineProperty(navigator, "serviceWorker", { value: { register: async () => null, getRegistration: async () => null }, configurable: true });
}

describe("push support", () => {
  it("reports unsupported in a bare browser", () => {
    expect(pushSupport("key")).toBe("unsupported");
  });
  it("reports no-key then ready on localhost once the APIs exist", () => {
    fakePushApis("default");
    expect(pushSupport(undefined)).toBe("no-key");
    expect(pushSupport("BPublicKey")).toBe("ready");
    expect(permissionState()).toBe("default");
  });
  it("decodes a URL-safe base64 key", () => {
    expect(Array.from(urlBase64ToUint8Array("AQAB"))).toEqual([1, 0, 1]);
    expect(Array.from(urlBase64ToUint8Array("_-8"))).toEqual([255, 239]);
  });
  it("labels devices from the user agent", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0) Chrome/128.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(deviceLabel("Mozilla/5.0 (iPhone) Safari/605.1")).toBe("Safari on iOS");
    expect(deviceLabel(undefined)).toBe("Device");
  });
});
