/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { Layer, rubberBand, shouldDismissSheet } from "./layer";
import { BP } from "../hooks";

function Host({ onClose, variant = "popover" }: { onClose?: () => void; variant?: "auto" | "popover" | "sheet" }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button ref={ref} onClick={() => setOpen(true)}>anchor</button>
      <Layer open={open} onClose={() => { onClose?.(); setOpen(false); }} anchorRef={ref} label="Test layer" variant={variant}>
        <button>inside</button>
      </Layer>
    </>
  );
}

const realMatchMedia = window.matchMedia;
afterEach(() => { window.matchMedia = realMatchMedia; });

describe("Layer", () => {
  it("opens from its anchor, traps focus, closes on Escape and returns focus", async () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    const anchor = screen.getByText("anchor");
    anchor.focus();
    fireEvent.click(anchor);
    expect(screen.getByRole("dialog", { name: "Test layer" })).toBeInTheDocument();
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(document.activeElement).toBe(screen.getByText("inside"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(anchor);
  });
  it("closes on an outside mousedown but not on a click inside", () => {
    const onClose = vi.fn();
    render(<Host onClose={onClose} />);
    fireEvent.click(screen.getByText("anchor"));
    fireEvent.mouseDown(screen.getByText("inside"));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it("renders as a bottom sheet on phones when the variant is auto", () => {
    window.matchMedia = ((q: string) => ({ matches: q === BP.mobile, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    const { container } = render(<Host variant="auto" />);
    fireEvent.click(screen.getByText("anchor"));
    expect(document.body.querySelector(".sheet")).toBeTruthy();
    expect(container.querySelector(".layer")).toBeNull();
  });
  it("a sheet closes when let go past 120 px or thrown down, and stays otherwise", () => {
    expect(shouldDismissSheet(130, 0)).toBe(true);
    expect(shouldDismissSheet(60, 1.2)).toBe(true);
    expect(shouldDismissSheet(60, 0.15)).toBe(false);
    expect(shouldDismissSheet(0, 5)).toBe(false);
    // Thrown upwards is never a dismissal, however fast.
    expect(shouldDismissSheet(-50, 3)).toBe(false);
  });
  it("pulled past its resting place a sheet rubber-bands: follows at first, never passes the limit", () => {
    expect(rubberBand(0, 40)).toBe(0);
    expect(rubberBand(-5, 40)).toBe(0);
    const pulls = [2, 10, 40, 120, 1000, 100000].map((x) => rubberBand(x, 40));
    for (let i = 1; i < pulls.length; i++) expect(pulls[i]).toBeGreaterThan(pulls[i - 1]);
    expect(pulls[0]).toBeGreaterThan(1);
    expect(pulls[pulls.length - 1]).toBeLessThan(40);
    expect(rubberBand(40, 40)).toBeLessThan(20);
  });
});
