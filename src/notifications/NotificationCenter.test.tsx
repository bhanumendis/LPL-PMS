/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "@/App";
import { store } from "@/lib/store";
import { submitGate } from "@/lib/logic";
import { addUser, seedCases, signInAs } from "@/test/session";
import { blankCase, user } from "@/test/fixtures";

async function seedGateForTeamLeader() {
  const couns = user({ id: "couns", role: "counsellor", name: "Case Counsellor" });
  const tl = await signInAs("team_leader", { id: "tl", name: "Team Leader" });
  await addUser(couns);
  await seedCases([blankCase({ counsellorId: couns.id, steps: { 1: { status: "done", values: {} }, 14: { status: "done", values: {} }, 15: { status: "done", values: {} } } })]);
  store.setCurrentUser(couns.id);
  await store.mutateCase("c1", (c) => submitGate(c, 16, { summary: "ready" }, couns));
  store.setCurrentUser(null);
  return tl;
}

describe("notification bell and center", () => {
  it("shows the unread count, lists the notification grouped by case, and marks all as read", async () => {
    await seedGateForTeamLeader();
    render(<App />);
    const bell = await screen.findByRole("button", { name: "Notifications, 1 unread" });
    fireEvent.click(bell);
    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    expect(await within(dialog).findByText("LPL-2026-0001 · Nimal Perera")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /Gate 16 submitted on LPL-2026-0001/ })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument());
    expect(within(dialog).getByRole("button", { name: "Mark all as read" })).toBeDisabled();
  });
  it("opening a notification marks it read and follows its deep link", async () => {
    await seedGateForTeamLeader();
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications, 1 unread" }));
    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    fireEvent.click(await within(dialog).findByRole("button", { name: /Gate 16 submitted on LPL-2026-0001/ }));
    expect(window.location.hash).toBe("#/case/c1/step/16");
    await waitFor(() => expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument());
    expect(screen.queryByRole("dialog", { name: "Notifications" })).toBeNull();
  });
  it("the Unread tab hides read rows and the Reminders tab shows a due clock", async () => {
    const couns = await signInAs("counsellor", { id: "couns" });
    await seedCases([blankCase({ counsellorId: couns.id, steps: { 1: { status: "done", values: {} }, 2: { status: "done", values: {} }, 3: { status: "done", completedAt: "2026-01-01T00:00:00.000Z", values: {} } } })]);
    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    const dialog = await screen.findByRole("dialog", { name: "Notifications" });
    fireEvent.click(within(dialog).getByRole("radio", { name: /Reminders/ }));
    expect(await within(dialog).findByText(/Course Information Sheet due/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("radio", { name: /Unread/ }));
    expect(await within(dialog).findByText("Nothing unread")).toBeInTheDocument();
  });
});
