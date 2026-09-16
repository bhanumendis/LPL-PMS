/**
 * Lyceum Placements — Placement Management System
 * Copyright (c) 2026 Bhanu Mendis. All rights reserved.
 * Author: Bhanu Mendis, Group IT, Lyceum Global Holdings
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AreaChart, DonutWithLegend, StageTrack } from "./charts";
import { pipelineProgress } from "./logic";
import { blankCase } from "@/test/fixtures";

describe("interactive charts", () => {
  it("focusing a point shows the tooltip and the range switch calls back", () => {
    const onRange = vi.fn();
    render(<AreaChart title="Twelve-month volume" labels={["Jan", "Feb", "Mar"]} series={[{ name: "Enquiries", values: [3, 5, 2] }]} ranges={[{ id: "6", label: "6 mo" }, { id: "12", label: "12 mo" }]} range="12" onRange={onRange} />);
    const dot = screen.getByLabelText("Jan: 3 enquiries");
    fireEvent.focus(dot);
    const tip = screen.getByRole("status");
    expect(tip).toHaveTextContent("Jan");
    expect(tip).toHaveTextContent("3");
    fireEvent.click(screen.getByRole("radio", { name: "6 mo" }));
    expect(onRange).toHaveBeenCalledWith("6");
  });
  it("hovering a legend entry highlights the donut slice", () => {
    const { container } = render(<DonutWithLegend title="Destination mix" data={[{ label: "Australia", n: 4 }, { label: "United Kingdom", n: 2 }]} />);
    fireEvent.mouseEnter(screen.getByText("United Kingdom"));
    const segs = container.querySelectorAll(".donut-seg");
    expect((segs[0] as SVGElement).style.opacity).toBe("0.35");
    expect((segs[1] as SVGElement).style.opacity).toBe("1");
    expect(container.querySelector(".ring-num")?.textContent).toBe("2");
  });
  it("stage track segments are selectable when a handler is given", () => {
    const onSelect = vi.fn();
    render(<StageTrack prog={pipelineProgress(blankCase())} onSelect={onSelect} selected="P2" />);
    const pressed = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    fireEvent.click(screen.getAllByRole("button")[4]);
    expect(onSelect).toHaveBeenCalledWith("P5");
  });
});
