import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WatermarkOverlay from "./WatermarkOverlay";

describe("WatermarkOverlay", () => {
  it("repeats the mark and stays out of the way of clicks and screen readers", () => {
    const { container } = render(<WatermarkOverlay />);
    expect(screen.getAllByText("BillFixr").length).toBeGreaterThan(1);
    const overlay = container.firstElementChild!;
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(overlay.className).toContain("pointer-events-none");
  });

  it("accepts a custom label", () => {
    render(<WatermarkOverlay label="In Progress" />);
    expect(screen.getAllByText("In Progress").length).toBeGreaterThan(1);
  });
});
