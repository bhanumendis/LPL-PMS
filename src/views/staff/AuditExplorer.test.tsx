/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "@/App";
import { store } from "@/lib/store";
import { EVENTS, RESTRICTED } from "@/lib/audit";
import { signInAs } from "@/test/session";
import type { AuditEntry } from "@/lib/types";
import { PAGE_SIZE } from "./AuditExplorer";

function entry(i: number, over: Partial<AuditEntry> = {}): AuditEntry {
  return { id: `a${i}`, at: new Date(Date.UTC(2026, 8, 12, 12, 0, 0) - i * 60_000).toISOString(), actorId: "adm", actorName: "Ada Admin", actorRole: "admin", action: `Action ${i}`, eventType: "update", entityType: "case", entityLabel: `LPL-2026-${i}`, summary: `Summary ${i}`, hasChanges: true, ...over };
}

async function openExplorer() {
  await signInAs("admin", { id: "adm", name: "Ada Admin" });
  window.location.hash = "#/audit";
  render(<App />);
  return await screen.findByRole("search", { name: "Filter the audit log" }, { timeout: 5000 });
}

describe("audit explorer", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("passes the event-type filter to auditPage", async () => {
    const page = vi.spyOn(store, "auditPage").mockResolvedValue([entry(1)]);
    const bar = await openExplorer();
    await screen.findByText("Summary 1");
    fireEvent.change(within(bar).getByLabelText("Event type"), { target: { value: "gate" } });
    await waitFor(() => expect(page).toHaveBeenLastCalledWith(expect.objectContaining({ eventType: "gate", before: null, limit: PAGE_SIZE })));
  });

  it("expanding a row reads the detail once and shows old and new values, restricted values as a chip", async () => {
    vi.spyOn(store, "auditPage").mockResolvedValue([entry(1), entry(2, { eventType: undefined, entityType: undefined, summary: undefined, action: "Case opened" })]);
    const detail = vi.spyOn(store, "auditDetail").mockResolvedValue({ changes: [{ field: "phone", label: "Phone", old: "0771", new: "0772" }, { field: "maritalStatus", label: "Marital status", old: RESTRICTED, new: RESTRICTED }] });
    await openExplorer();
    const row = (await screen.findByText("Summary 1")).closest("button")!;
    expect(screen.getByText("Legacy")).toBeInTheDocument();
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-expanded", "true");
    const table = await screen.findByRole("table", { name: "Changed fields" });
    expect(within(table).getByText("0771")).toBeInTheDocument();
    expect(within(table).getByText("0772")).toBeInTheDocument();
    expect(within(table).getAllByText("restricted")).toHaveLength(2);
    fireEvent.click(row);
    fireEvent.click(row);
    expect(detail).toHaveBeenCalledTimes(1);
  });

  it("Load more appends the next page keyed on the last row", async () => {
    const first = Array.from({ length: PAGE_SIZE }, (_, i) => entry(i));
    const page = vi.spyOn(store, "auditPage").mockResolvedValueOnce(first).mockResolvedValueOnce([entry(PAGE_SIZE, { summary: "The next page" })]);
    await openExplorer();
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(await screen.findByText("The next page")).toBeInTheDocument();
    expect(page).toHaveBeenLastCalledWith(expect.objectContaining({ before: first[PAGE_SIZE - 1].at }));
    expect(screen.getByText("Summary 0")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
  });

  it("reads real entries written through the store", async () => {
    await signInAs("admin", { id: "adm", name: "Ada Admin" });
    await store.audit(EVENTS.permissionsReset(), { id: "adm", name: "Ada Admin", role: "admin" });
    window.location.hash = "#/audit";
    render(<App />);
    expect(await screen.findByText("Restored the standard permission model", {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
