import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppealLetterCard from "./AppealLetterCard";

const LETTER = { caseId: "case-1", text: "Dear Billing,", providerEmail: null, sentAt: null };
const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe("AppealLetterCard", () => {
  it("starts collapsed with a Generate button and reveals the drafted letter", async () => {
    const user = userEvent.setup();
    render(<AppealLetterCard letter={LETTER} />);

    expect(screen.queryByLabelText("Appeal letter")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Generate Appeal Letter" }));

    expect(screen.getByLabelText("Appeal letter")).toHaveValue("Dear Billing,");
    expect(screen.getByRole("button", { name: /Download as PDF/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Send Letter/ })).toBeInTheDocument();
  });

  it("disables Generate when no letter has been drafted yet", () => {
    render(<AppealLetterCard letter={{ ...LETTER, text: null }} />);
    expect(screen.getByRole("button", { name: "Generate Appeal Letter" })).toBeDisabled();
  });

  it("saves an edited letter when the editor loses focus", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<AppealLetterCard letter={LETTER} />);
    await user.click(screen.getByRole("button", { name: "Generate Appeal Letter" }));

    const editor = screen.getByLabelText("Appeal letter");
    await user.type(editor, " again");
    fireEvent.blur(editor);

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/dashboard/cases/case-1/appeal-letter",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ text: "Dear Billing, again" }) }),
      ),
    );
    expect(await screen.findByText("Saved.")).toBeInTheDocument();
  });

  it("does not save when nothing changed", async () => {
    global.fetch = vi.fn();
    const user = userEvent.setup();
    render(<AppealLetterCard letter={LETTER} />);
    await user.click(screen.getByRole("button", { name: "Generate Appeal Letter" }));
    fireEvent.blur(screen.getByLabelText("Appeal letter"));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("applies bold to the selected text from the toolbar", async () => {
    const user = userEvent.setup();
    render(<AppealLetterCard letter={LETTER} />);
    await user.click(screen.getByRole("button", { name: "Generate Appeal Letter" }));

    const editor = screen.getByLabelText("Appeal letter") as HTMLTextAreaElement;
    editor.setSelectionRange(0, 4);
    await user.click(screen.getByRole("button", { name: "Bold" }));

    expect(editor).toHaveValue("**Dear** Billing,");
  });

  it("sends the letter to the entered provider email and then locks the card", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<AppealLetterCard letter={LETTER} />);
    await user.click(screen.getByRole("button", { name: "Generate Appeal Letter" }));
    await user.click(screen.getByRole("button", { name: /Send Letter/ }));

    await user.type(screen.getByLabelText("Provider email"), "billing@hospital.com");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/dashboard/cases/case-1/send-letter",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ providerEmail: "billing@hospital.com", text: "Dear Billing," }),
        }),
      ),
    );
    expect(await screen.findByText(/Sent to billing@hospital.com/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Letter Sent/ })).toBeDisabled();
    expect(screen.getByLabelText("Appeal letter")).toHaveAttribute("readonly");
  });

  it("shows the server's error and keeps the modal open when sending fails", async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: "The commitment fee must be paid before sending." }), { status: 402 }),
    );
    const user = userEvent.setup();
    render(<AppealLetterCard letter={LETTER} />);
    await user.click(screen.getByRole("button", { name: "Generate Appeal Letter" }));
    await user.click(screen.getByRole("button", { name: /Send Letter/ }));
    await user.type(screen.getByLabelText("Provider email"), "billing@hospital.com");
    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("The commitment fee must be paid before sending.")).toBeInTheDocument();
    expect(screen.getByLabelText("Provider email")).toBeInTheDocument();
  });

  it("opens already-sent letters read-only with the recipient shown", () => {
    render(
      <AppealLetterCard
        letter={{ ...LETTER, providerEmail: "billing@hospital.com", sentAt: "2026-09-28T10:00:00Z" }}
      />,
    );
    expect(screen.getByLabelText("Appeal letter")).toHaveAttribute("readonly");
    expect(screen.getByText(/Sent to billing@hospital.com/)).toBeInTheDocument();
  });
});
