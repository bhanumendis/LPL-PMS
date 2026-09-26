/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { Modal } from "./modal";
import { EXIT_MS } from "./presence";
import { BP } from "../hooks";
import tokensCss from "@/styles/tokens.css?raw";

function Host({ onSaved }: { onSaved?: () => void }) {
  const [item, setItem] = useState<{ name: string } | null>(null);
  return (
    <>
      <button onClick={() => setItem({ name: "Nimal" })}>edit</button>
      {/* The parent clears what the dialog shows the moment it closes. */}
      <Modal open={!!item} onClose={() => { onSaved?.(); setItem(null); }} title={item ? `Edit ${item.name}` : "—"}>
        <p>{item ? `Editing ${item.name}` : "nothing"}</p>
      </Modal>
    </>
  );
}

const realMatchMedia = window.matchMedia;
afterEach(() => { window.matchMedia = realMatchMedia; vi.useRealTimers(); });

describe("presence", () => {
  it("a closing dialog leaves the accessibility tree at once, plays its exit showing what it showed, then goes", () => {
    vi.useFakeTimers();
    render(<Host />);
    const trigger = screen.getByText("edit");
    trigger.focus();
    fireEvent.click(trigger);
    act(() => { vi.advanceTimersByTime(50); });
    expect(screen.getByRole("dialog", { name: "Edit Nimal" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    // Gone for everything but the eye: no dialog in the tree, focus home, nothing to tab into.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    const scrim = document.querySelector(".modal-scrim")!;
    expect(scrim).toHaveClass("is-leaving");
    expect(scrim).toHaveAttribute("inert");
    expect(scrim).toHaveAttribute("aria-hidden", "true");
    // It leaves showing what it showed, not the parent's cleared state.
    expect(scrim).toHaveTextContent("Editing Nimal");
    expect(scrim).toHaveTextContent("Edit Nimal");

    act(() => { vi.advanceTimersByTime(EXIT_MS.dialog - 1); });
    expect(document.querySelector(".modal-scrim")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1); });
    expect(document.querySelector(".modal-scrim")).toBeNull();
  });

  it("reopening while it leaves brings the same dialog back, live again", () => {
    vi.useFakeTimers();
    render(<Host />);
    fireEvent.click(screen.getByText("edit"));
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    const leaving = document.querySelector(".modal-scrim");
    fireEvent.click(screen.getByText("edit"));
    expect(document.querySelector(".modal-scrim")).toBe(leaving);
    expect(leaving).not.toHaveClass("is-leaving");
    expect(leaving).not.toHaveAttribute("inert");
    act(() => { vi.advanceTimersByTime(EXIT_MS.dialog * 2); });
    expect(screen.getByRole("dialog", { name: "Edit Nimal" })).toBeInTheDocument();
  });

  it("under reduced motion a dialog goes at once", () => {
    window.matchMedia = ((q: string) => ({ matches: q === BP.reducedMotion, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    render(<Host />);
    fireEvent.click(screen.getByText("edit"));
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(document.querySelector(".modal-scrim")).toBeNull();
  });

  it("exit durations are the stylesheet's --d-1 (popover) and --d-2 (everything else)", () => {
    const ms = (name: string) => Number(new RegExp(`--${name}:\\s*(\\d+)ms`).exec(tokensCss)?.[1]);
    expect(EXIT_MS.popover).toBe(ms("d-1"));
    expect(EXIT_MS.sheet).toBe(ms("d-2"));
    expect(EXIT_MS.dialog).toBe(ms("d-2"));
    expect(EXIT_MS.toast).toBe(ms("d-2"));
  });
});
