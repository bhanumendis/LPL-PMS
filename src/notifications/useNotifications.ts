/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 *
 * Client model for the notification center: the unread count from the store's poll, a paged
 * list loaded on open, optimistic mark-as-read with rollback.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { nowIso, store } from "@/lib/store";
import type { NotificationRow, NotificationState } from "./types";

export type NotificationFilter = "all" | "unread" | "reminders";
const PAGE = 30;

export function useNotifications() {
  const [state, setState] = useState<NotificationState>(store.notif);
  useEffect(() => store.onNotifications(setState), []);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [filter, setFilter] = useState<NotificationFilter>("all");
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const load = useCallback(async (before: string | null, replace: boolean, unreadOnly: boolean) => {
    setLoading(true); setError(undefined);
    try {
      const rows = await store.notificationsPage(before, PAGE, unreadOnly);
      setItems((prev) => (replace ? rows : [...prev, ...rows.filter((r) => !prev.some((p) => p.id === r.id))]));
      setHasMore(rows.length === PAGE);
    } catch (e) {
      setError((e as Error).message || "Notifications could not be loaded.");
    } finally { setLoading(false); }
  }, []);

  /** Load the first page for the current filter (called when the center opens or the filter changes). */
  const open = useCallback(() => load(null, true, filter === "unread"), [load, filter]);
  const loadMore = useCallback(() => {
    const last = itemsRef.current[itemsRef.current.length - 1];
    return load(last ? last.at : null, false, filter === "unread");
  }, [load, filter]);

  const markRead = useCallback(async (ids: string[]) => {
    const snapshot = itemsRef.current;
    const now = nowIso();
    const affected = snapshot.filter((r) => ids.includes(r.id) && !r.readAt).length;
    if (!affected) return;
    setItems((list) => list.map((r) => (ids.includes(r.id) && !r.readAt ? { ...r, readAt: now } : r)));
    setState((s) => ({ ...s, unread: Math.max(0, s.unread - affected) }));
    try { await store.markNotificationsRead(ids); }
    catch (e) { setItems(snapshot); setState(store.notif); setError((e as Error).message || "The change could not be saved."); }
  }, []);

  const markAll = useCallback(async () => {
    const snapshot = itemsRef.current;
    const now = nowIso();
    setItems((list) => list.map((r) => (r.readAt ? r : { ...r, readAt: now })));
    setState((s) => ({ ...s, unread: 0 }));
    try { await store.markAllNotificationsRead(); }
    catch (e) { setItems(snapshot); setState(store.notif); setError((e as Error).message || "The change could not be saved."); }
  }, []);

  return { unread: state.unread, latest: state.latest, items, loading, hasMore, error, filter, setFilter, open, loadMore, markRead, markAll };
}
