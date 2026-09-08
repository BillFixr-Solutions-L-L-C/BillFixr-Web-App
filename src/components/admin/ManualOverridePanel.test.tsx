import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ManualOverridePanel from "./ManualOverridePanel";

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("ManualOverridePanel", () => {
  it("shows no decision badge when nothing has been decided yet", () => {
    render(
      <ManualOverridePanel
        caseId="case-1"
        initialNotes=""
        initialOverrideReason=""
        initialApprovalChain=""
        initialDecision={null}
      />,
    );
    expect(screen.queryByText("Approved")).not.toBeInTheDocument();
    expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
    expect(screen.queryByText("Escalated")).not.toBeInTheDocument();
  });

  it("shows the persisted decision badge on load", () => {
    render(
      <ManualOverridePanel
        caseId="case-1"
        initialNotes=""
        initialOverrideReason=""
        initialApprovalChain=""
        initialDecision="approved"
      />,
    );
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("disables Re-Run AI Analysis", () => {
    render(
      <ManualOverridePanel
        caseId="case-1"
        initialNotes=""
        initialOverrideReason=""
        initialApprovalChain=""
        initialDecision={null}
      />,
    );
    expect(screen.getByRole("button", { name: "Re-Run AI Analysis" })).toBeDisabled();
  });

  it("posts the current field values and the decision when Manual Approve is clicked", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    const { container } = render(
      <ManualOverridePanel
        caseId="case-1"
        initialNotes=""
        initialOverrideReason=""
        initialApprovalChain=""
        initialDecision={null}
      />,
    );

    await user.type(container.querySelector("textarea")!, "Looks fine");
    await user.click(screen.getByRole("button", { name: "Manual Approve" }));

    await waitFor(() => expect(screen.getByText("Approved")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/cases/case-1/override",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"decision":"approved"'),
      }),
    );
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.notes).toBe("Looks fine");
  });

  it("shows the server error and does not update the badge when the save fails", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
    const user = userEvent.setup();
    render(
      <ManualOverridePanel
        caseId="case-1"
        initialNotes=""
        initialOverrideReason=""
        initialApprovalChain=""
        initialDecision={null}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Reject" }));

    await waitFor(() => expect(screen.getByText("forbidden")).toBeInTheDocument());
    expect(screen.queryByText("Rejected")).not.toBeInTheDocument();
  });
});
