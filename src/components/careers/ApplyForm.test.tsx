import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ApplyForm from "./ApplyForm";

const upload = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ upload: (...args: unknown[]) => upload(...args) }) } }),
}));

const originalFetch = global.fetch;

function makeCvFile() {
  return new File(["cv content"], "resume.pdf", { type: "application/pdf" });
}

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("Full Name"), "Jamie Rivera");
  await user.type(screen.getByPlaceholderText("Email"), "jamie@example.com");
  await user.type(screen.getByPlaceholderText("Phone number"), "555-0100");
}

// jsdom doesn't reliably track constraint-validation validity for a
// required <input type="file"> (or reliably run it before a real click
// submits the form), so these tests submit via a direct `submit` event
// instead of clicking the button — bypassing the browser-level `required`
// gate to exercise this component's own JS validation/submit logic.
function submitForm(container: HTMLElement) {
  fireEvent.submit(container.querySelector("form")!);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("ApplyForm", () => {
  it("shows an error and never uploads when no CV is attached", async () => {
    const user = userEvent.setup();
    const { container } = render(<ApplyForm jobId="job-1" />);

    await fillRequiredFields(user);
    submitForm(container);

    await waitFor(() => expect(screen.getByText("Please attach your CV/resume.")).toBeInTheDocument());
    expect(upload).not.toHaveBeenCalled();
  });

  it("shows the storage error and never calls the apply route when the upload fails", async () => {
    upload.mockResolvedValue({ error: { message: "storage quota exceeded" } });
    global.fetch = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<ApplyForm jobId="job-1" />);

    await fillRequiredFields(user);
    await user.upload(document.querySelector('input[type="file"]')!, makeCvFile());
    submitForm(container);

    await waitFor(() => expect(screen.getByText("storage quota exceeded")).toBeInTheDocument());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows the server error when the apply route rejects the submission", async () => {
    upload.mockResolvedValue({ error: null });
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "invalid request" }), { status: 400 }));
    const user = userEvent.setup();
    const { container } = render(<ApplyForm jobId="job-1" />);

    await fillRequiredFields(user);
    await user.upload(document.querySelector('input[type="file"]')!, makeCvFile());
    submitForm(container);

    await waitFor(() => expect(screen.getByText("invalid request")).toBeInTheDocument());
  });

  it("uploads the CV then posts the application, showing the submitted state", async () => {
    upload.mockResolvedValue({ error: null });
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    const { container } = render(<ApplyForm jobId="job-1" />);

    await fillRequiredFields(user);
    await user.upload(document.querySelector('input[type="file"]')!, makeCvFile());
    submitForm(container);

    await waitFor(() => expect(screen.getByText("Application submitted")).toBeInTheDocument());
    expect(upload).toHaveBeenCalledWith(expect.stringMatching(/^job-1\/\d+-resume\.pdf$/), expect.any(File));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/careers/apply",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"jobId":"job-1"'),
      }),
    );
  });
});
