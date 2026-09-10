import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AdminCareersClient from "./AdminCareersClient";

const APPLICANTS = [
  { id: "a-1", fullName: "Alice New", email: "alice@example.com", phone: null, role: "Engineer", createdAt: "2026-01-01", status: "received" as const, cvFilename: "", cvPreviewUrl: null, cvDownloadUrl: null },
  { id: "a-2", fullName: "Bob Reviewed", email: "bob@example.com", phone: null, role: "Designer", createdAt: "2026-01-02", status: "reviewed" as const, cvFilename: "", cvPreviewUrl: null, cvDownloadUrl: null },
];

describe("AdminCareersClient applicants tab", () => {
  it("filters by search text across name, email, and role", async () => {
    const user = userEvent.setup();
    render(<AdminCareersClient initialPostings={[]} initialApplicants={APPLICANTS} />);

    await user.type(screen.getByPlaceholderText("Search by name, email, or role"), "Designer");

    expect(screen.getByText("Bob Reviewed")).toBeInTheDocument();
    expect(screen.queryByText("Alice New")).not.toBeInTheDocument();
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    render(<AdminCareersClient initialPostings={[]} initialApplicants={APPLICANTS} />);

    await user.selectOptions(screen.getByDisplayValue("All statuses"), "New");

    expect(screen.getByText("Alice New")).toBeInTheDocument();
    expect(screen.queryByText("Bob Reviewed")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<AdminCareersClient initialPostings={[]} initialApplicants={APPLICANTS} />);

    await user.type(screen.getByPlaceholderText("Search by name, email, or role"), "nobody-matches");

    expect(screen.getByText("No applicants match your search.")).toBeInTheDocument();
  });
});
