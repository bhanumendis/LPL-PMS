/**
 * Lyceum Placements — Placement Management System
 * Developed by Bhanu Mendis - Group IT
 */
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MiniStageTrack, SeverityChip } from "./progress";
import { SegmentedSwitch } from "./segmented";
import { StatStrip } from "./stats";
import { EmptyState } from "./empty";
import { pipelineProgress } from "../logic";
import { blankCase } from "@/test/fixtures";
import { useState } from "react";

describe("compact primitives", () => {
  it("MiniStageTrack marks done, current and pending segments", () => {
    const stages = pipelineProgress(blankCase());
    const { container } = render(<MiniStageTrack stages={stages} />);
    const segs = container.querySelectorAll(".seg");
    expect(segs).toHaveLength(9);
    expect(segs[0]).toHaveClass("done");
    expect(segs[1]).toHaveClass("current");
    expect(segs[2].className.trim()).toBe("seg");
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", expect.stringContaining("Stage 2 of 9"));
  });
  it("SeverityChip carries the severity class", () => {
    render(<SeverityChip severity="bad">Overdue</SeverityChip>);
    expect(screen.getByText("Overdue")).toHaveClass("sev-bad");
  });
  it("SegmentedSwitch is a radiogroup with arrow-key movement", () => {
    function Host() { const [v, setV] = useState<"a" | "b">("a"); return <SegmentedSwitch label="Filter" value={v} onChange={setV} options={[{ id: "a", label: "All" }, { id: "b", label: "Unread", count: 3 }]} />; }
    render(<Host />);
    const all = screen.getByRole("radio", { name: /All/ });
    expect(all).toHaveAttribute("aria-checked", "true");
    all.focus();
    fireEvent.keyDown(all, { key: "ArrowRight" });
    expect(screen.getByRole("radio", { name: /Unread/ })).toHaveAttribute("aria-checked", "true");
  });
  it("StatStrip renders clickable capsules with deltas", () => {
    let clicked = 0;
    render(<StatStrip label="Position" stats={[{ id: "open", label: "Open cases", value: 12, delta: { value: 3, label: "vs last 30 days" }, onClick: () => { clicked++; } }, { id: "late", label: "Overdue", value: 2, tone: "bad" }]} />);
    fireEvent.click(screen.getByRole("button", { name: /Open cases/ }));
    expect(clicked).toBe(1);
    expect(screen.getByText(/3 vs last 30 days/)).toBeInTheDocument();
  });
  it("EmptyState explains what, why and next", () => {
    render(<EmptyState glyph="students" title="No students assigned yet" reason="Cases appear here once assigned." action={<button>Ask</button>} />);
    expect(screen.getByText("No students assigned yet")).toBeInTheDocument();
    expect(screen.getByText("Cases appear here once assigned.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask" })).toBeInTheDocument();
  });
});
