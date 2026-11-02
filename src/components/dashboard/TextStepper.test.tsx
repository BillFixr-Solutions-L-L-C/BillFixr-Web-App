import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import TextStepper from "./TextStepper";
import { CASE_STEPS, caseProgress } from "@/lib/caseProgress";

// The stepper is the shared piece: the customer sees it on their
// dashboard, an admin sees it on Case Detail. These check what it
// actually paints, since "which stage is this case at" is the whole
// point of putting it on the admin screen.

function toneOf(label: string): "active" | "inactive" {
  const el = screen.getByText(label);
  return el.className.includes("text-primary-700") ? "active" : "inactive";
}

describe("TextStepper", () => {
  it("shows the five stages in order", () => {
    render(<TextStepper activeStep={0} />);
    for (const step of CASE_STEPS) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
  });

  it("marks everything up to the active stage, and nothing after it", () => {
    render(<TextStepper activeStep={2} />);
    expect(toneOf("Upload")).toBe("active");
    expect(toneOf("Scan")).toBe("active");
    expect(toneOf("Negotiation")).toBe("active");
    expect(toneOf("Response")).toBe("inactive");
    expect(toneOf("Complete")).toBe("inactive");
  });

  it("does not light Complete for a case that is still waiting on a provider", () => {
    // awaiting_response is the status most production cases would sit at
    // once letters go out; showing it as Complete would be wrong on an
    // admin screen in a way nobody would catch by eye.
    const { step } = caseProgress("awaiting_response");
    render(<TextStepper activeStep={step as number} />);
    expect(toneOf("Complete")).toBe("inactive");
    expect(toneOf("Negotiation")).toBe("active");
  });

  it("lights every stage for a finished case", () => {
    const { step } = caseProgress("paid");
    render(<TextStepper activeStep={step as number} />);
    for (const label of CASE_STEPS) {
      expect(toneOf(label), label).toBe("active");
    }
  });

  it("lights only the first stage for a freshly uploaded bill", () => {
    const { step } = caseProgress("uploaded");
    render(<TextStepper activeStep={step as number} />);
    expect(toneOf("Upload")).toBe("active");
    expect(toneOf("Scan")).toBe("inactive");
  });
});
