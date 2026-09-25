/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { store } from "@/lib/store";
import { submitGate } from "@/lib/logic";
import { useNotifications } from "./useNotifications";
import { addUser, seedCases, signInAs } from "@/test/session";
import { blankCase, user } from "@/test/fixtures";

describe("notifications through the store (browser-storage mode)", () => {
  it("a gate submission by the counsellor reaches the team leader, who can read it", async () => {
    const couns = await signInAs("counsellor");
    const tl = user({ id: "tl", role: "team_leader", name: "Team Leader" });
    await addUser(tl);
    await seedCases([blankCase({ counsellorId: couns.id, steps: { 1: { status: "done", values: {} }, 14: { status: "done", values: {} }, 15: { status: "done", values: {} } } })]);
    store.setCurrentUser(couns.id);
    await store.mutateCase("c1", (c) => submitGate(c, 16, { summary: "ok" }, couns));
    expect((await store.notificationsPage(null, 10, false))).toHaveLength(0); // the actor gets nothing

    store.setCurrentUser(tl.id);
    await store.pollNotifications();
    expect(store.notif.unread).toBe(1);

    const { result } = renderHook(() => useNotifications());
    await act(async () => { await result.current.open(); });
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]).toMatchObject({ type: "gate_submitted", title: "Gate 16 submitted on LPL-2026-0001", link: "#/case/c1/step/16" });
    expect(result.current.unread).toBe(1);

    await act(async () => { await result.current.markRead([result.current.items[0].id]); });
    expect(result.current.items[0].readAt).toBeTruthy();
    await waitFor(() => expect(result.current.unread).toBe(0));
    expect(store.notif.unread).toBe(0);
  });
  it("markAll clears every unread row for the signed-in user only", async () => {
    const couns = await signInAs("counsellor");
    const tl = user({ id: "tl", role: "team_leader" });
    await addUser(tl);
    await seedCases([blankCase({ counsellorId: couns.id }), blankCase({ id: "c2", ref: "LPL-2026-0002", counsellorId: couns.id })]);
    store.setCurrentUser(couns.id);
    await store.mutateCase("c1", (c) => submitGate(c, 16, {}, couns));
    await store.mutateCase("c2", (c) => submitGate(c, 16, {}, couns));
    store.setCurrentUser(tl.id);
    await store.pollNotifications();
    expect(store.notif.unread).toBe(2);
    expect(await store.markAllNotificationsRead()).toBe(2);
    expect(store.notif.unread).toBe(0);
  });
});
