import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewsletterForm from "./NewsletterForm";

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("NewsletterForm", () => {
  it("posts the entered email and shows the subscribed message on success", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<NewsletterForm />);

    await user.type(screen.getByPlaceholderText("Email Address"), "reader@example.com");
    await user.click(screen.getByRole("button", { name: /Enter/ }));

    await waitFor(() => expect(screen.getByText(/You're subscribed/)).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/newsletter/subscribe",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "reader@example.com" }) }),
    );
  });

  it("shows an error message and keeps the form when the request fails", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "bad" }), { status: 500 }));
    const user = userEvent.setup();
    render(<NewsletterForm />);

    await user.type(screen.getByPlaceholderText("Email Address"), "reader@example.com");
    await user.click(screen.getByRole("button", { name: /Enter/ }));

    await waitFor(() => expect(screen.getByText(/Something went wrong/)).toBeInTheDocument());
    expect(screen.getByPlaceholderText("Email Address")).toBeInTheDocument();
  });
});
