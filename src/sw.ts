/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Service worker: receives Web Push messages and opens the deep link on click. It caches
 * nothing (the application is one file) and only runs on hosted builds over HTTPS. Built to
 * dist/sw.js by scripts/finalize.mjs; typechecked by tsconfig.sw.json.
 */
/// <reference lib="webworker" />
export {};
declare const self: ServiceWorkerGlobalScope;

interface PushPayload { id?: string; title?: string; body?: string; link?: string }

self.addEventListener("install", () => { void self.skipWaiting(); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener("push", (event) => {
  let data: PushPayload = {};
  try { data = (event.data?.json() as PushPayload) ?? {}; } catch { data = { title: event.data?.text() ?? undefined }; }
  const title = data.title || "Lyceum Placements";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body,
    tag: data.id,
    data: { link: data.link || "#/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = String((event.notification.data as { link?: string } | undefined)?.link ?? "#/");
  const target = self.registration.scope.replace(/\/?$/, "/") + link;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if ("navigate" in c) {
        const w = c as WindowClient;
        await w.navigate(target);
        await w.focus();
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
