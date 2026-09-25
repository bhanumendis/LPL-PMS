/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "@/App";
import { addUser, signInAs } from "@/test/session";
import { store } from "@/lib/store";
import { user } from "@/test/fixtures";

async function openRoles(as: "super_admin" | "admin", role = "admin") {
  await signInAs(as, as === "super_admin" ? { email: "it@lyceum.lk" } : {});
  await addUser(user({ id: "a1", role: "admin", name: "Placement Lead", email: "lead@example.com" }));
  await addUser(user({ id: "c1", role: "counsellor", name: "Counsellor One" }));
  window.location.hash = `#/roles/${role}`;
  render(<App />);
  return screen.findByRole("heading", { level: 1, name: "Roles and permissions" });
}

describe("Roles and permissions", () => {
  it("lists every role and deep-links to one", async () => {
    await openRoles("super_admin");
    const tabs = within(screen.getByRole("tablist", { name: "Roles" })).getAllByRole("tab");
    expect(tabs.map((t) => t.querySelector(".role-tab-name")?.textContent)).toEqual(["Super Admin", "Admin", "Team Leader", "Counsellor", "Student"]);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { level: 2, name: "Admin" })).toBeInTheDocument();
    expect(screen.getByText("Placement Team")).toBeInTheDocument();
  });

  it("SUPER ADMIN edits a cell; reserved cells stay locked for every other role", async () => {
    await openRoles("super_admin");
    const reserved = screen.getByRole("switch", { name: /Write · System configuration for Admin \(locked\)/ });
    expect(reserved).toHaveAttribute("aria-disabled", "true");
    const del = screen.getByRole("switch", { name: "Delete · Cases for Admin" });
    expect(del).toHaveAttribute("aria-checked", "false");
    fireEvent.click(del);
    await waitFor(() => expect(store.snap.org.config.permissions["case.delete"]).toContain("admin"));
    expect(screen.getByRole("button", { name: /Restore standard model/ })).toBeInTheDocument();
  });

  it("ADMIN reads the page but cannot change anything", async () => {
    await openRoles("admin", "counsellor");
    expect(screen.getByText(/changed by a Super Admin \(Group IT\)/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Restore standard model/ })).toBeNull();
    const switches = screen.getAllByRole("switch");
    expect(switches.length).toBeGreaterThan(20);
    for (const s of switches) expect(s).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByLabelText("Case visibility")).toBeDisabled();
  });

  it("members: ADMIN cannot change an administrator's role; SUPER ADMIN can, but only Group IT may become SUPER ADMIN", async () => {
    await openRoles("admin");
    fireEvent.click(screen.getByRole("radio", { name: /Members/ }));
    expect(await screen.findByText("Placement Lead")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change role of Placement Lead" })).toBeNull();
  });

  it("SUPER ADMIN changes a member's role; Super Admin is not offered to a non-Group IT address", async () => {
    await openRoles("super_admin");
    fireEvent.click(screen.getByRole("radio", { name: /Members/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Change role of Placement Lead" }));
    const dialog = await screen.findByRole("dialog");
    const superChoice = within(dialog).getByRole("radio", { name: /Super Admin/ });
    await waitFor(() => expect(superChoice).toBeDisabled());
    fireEvent.click(within(dialog).getByRole("radio", { name: /Team Leader/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Change role" }));
    await waitFor(() => expect(store.snap.org.users.a1.role).toBe("team_leader"));
  });

  it("compares every role side by side", async () => {
    await openRoles("super_admin");
    fireEvent.click(screen.getByRole("radio", { name: "Compare roles" }));
    const table = await screen.findByRole("table", { name: "Every permission for every role" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Permission", "Super Admin", "Admin", "Team Leader", "Counsellor", "Student"]);
  });
});
