import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PaperReplyPanel from "./PaperReplyPanel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recording a reply that did not come by email", () => {
  it("will not send until there is something to send", () => {
    // An empty submission used to become an invented sentence that the
    // analysis then acted on.
    render(<PaperReplyPanel caseId="case-1" canSubmit />);

    expect(screen.getByRole("button", { name: "Record the reply" })).toBeDisabled();
  });

  it("sends typed words on their own, for a reply given over the phone", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    render(<PaperReplyPanel caseId="case-1" canSubmit />);

    await user.type(screen.getByLabelText(/What they said/), "they agreed to $112.49");
    await user.click(screen.getByRole("button", { name: "Record the reply" }));

    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/cases/case-1/negotiation/reply");
    expect((init.body as FormData).get("text")).toBe("they agreed to $112.49");
    expect(await screen.findByText(/Reply recorded/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("sends an attached scan", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    render(<PaperReplyPanel caseId="case-1" canSubmit />);

    await user.upload(
      screen.getByLabelText(/Scan or photo/),
      new File([new Uint8Array(4)], "letter.pdf", { type: "application/pdf" }),
    );
    await user.click(screen.getByRole("button", { name: "Record the reply" }));

    const [, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init.body as FormData).get("file")).toBeTruthy();
  });

  it("shows the engine saying it could not read the document", async () => {
    // The one answer that tells an admin to send a better scan, rather
    // than a generic failure.
    const user = userEvent.setup();
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "Could not read the uploaded document: page 1 is blank" }), {
          status: 502,
        }),
    ) as typeof fetch;
    render(<PaperReplyPanel caseId="case-1" canSubmit />);

    await user.type(screen.getByLabelText(/What they said/), "see attached");
    await user.click(screen.getByRole("button", { name: "Record the reply" }));

    expect(await screen.findByText(/page 1 is blank/)).toBeInTheDocument();
    expect(screen.queryByText(/Reply recorded/)).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is disabled without full access to the negotiation domain", async () => {
    const user = userEvent.setup();
    render(<PaperReplyPanel caseId="case-1" canSubmit={false} />);

    await user.type(screen.getByLabelText(/What they said/), "something");

    expect(screen.getByRole("button", { name: "Record the reply" })).toBeDisabled();
    expect(screen.getByText(/do not have full access/i)).toBeInTheDocument();
  });
});
