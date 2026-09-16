/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { Layer, shouldDismissSheet } from "./layer";
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
  it("a sheet closes when dragged past 120 px or flicked, and stays otherwise", () => {
    expect(shouldDismissSheet(130, 1000)).toBe(true);
    expect(shouldDismissSheet(60, 50)).toBe(true);
    expect(shouldDismissSheet(60, 400)).toBe(false);
    expect(shouldDismissSheet(0, 10)).toBe(false);
  });
});
