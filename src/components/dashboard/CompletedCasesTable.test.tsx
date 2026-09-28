import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CompletedCasesTable from "./CompletedCasesTable";

const ROW = {
  id: "case-1",
  filename: "crown-med.pdf",
  provider: "Crown Med Hospital Center",
  uploadedAt: "2026-07-14T00:00:00Z",
  appealLetterSent: true,
  savings: 2345,
};

describe("CompletedCasesTable", () => {
  it("shows an empty state when there are no completed cases", () => {
    render(<CompletedCasesTable rows={[]} />);
    expect(screen.getByText(/No completed cases yet/)).toBeInTheDocument();
  });

  it("renders the columns from the design and links to the case", () => {
    render(<CompletedCasesTable rows={[ROW]} />);
    for (const header of ["Bill", "Provider", "Upload Date", "Appeal Letter", "Status", "Proposed Savings"]) {
      expect(screen.getByText(header)).toBeInTheDocument();
    }
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("$2,345")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /crown-med.pdf/ })).toHaveAttribute(
      "href",
      "/dashboard/completed/case-1",
    );
  });

  it("falls back to a dash when savings or the letter are missing", () => {
    render(<CompletedCasesTable rows={[{ ...ROW, savings: null, appealLetterSent: false, uploadedAt: null }]} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });
});
