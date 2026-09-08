import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TestimonialForm from "./TestimonialForm";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} alt={(props.alt as string) ?? ""} />,
}));

const insert = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: () => ({ insert: (...args: unknown[]) => insert(...args) }) }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TestimonialForm", () => {
  it("shows a validation error and never inserts when the message is only whitespace", async () => {
    const user = userEvent.setup();
    render(<TestimonialForm userId="user-1" name="Jane" email="jane@example.com" />);

    // A whitespace-only value satisfies the textarea's native `required`
    // constraint (which would otherwise block the submit event before it
    // ever reaches this component's own JS validation), letting this test
    // actually exercise the app-level trim() check below it.
    await user.type(screen.getByPlaceholderText(/Tell us about your experience/), "   ");
    await user.click(screen.getByRole("button", { name: "Send Message" }));

    expect(screen.getByText("Please share a few words about your experience.")).toBeInTheDocument();
    expect(insert).not.toHaveBeenCalled();
  });

  it("shows the server error and stays on the form when the insert fails", async () => {
    insert.mockResolvedValue({ error: { message: "connection refused" } });
    const user = userEvent.setup();
    render(<TestimonialForm userId="user-1" name="Jane" email="jane@example.com" />);

    await user.type(screen.getByPlaceholderText(/Tell us about your experience/), "Great service!");
    await user.click(screen.getByRole("button", { name: "Send Message" }));

    await waitFor(() => expect(screen.getByText("connection refused")).toBeInTheDocument());
    expect(screen.queryByText("Thanks for sharing!")).not.toBeInTheDocument();
  });

  it("submits the rating and trimmed message, then shows the thank-you screen", async () => {
    insert.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<TestimonialForm userId="user-1" name="Jane" email="jane@example.com" />);

    await user.click(screen.getByRole("button", { name: "Rate 3 stars" }));
    await user.type(screen.getByPlaceholderText(/Tell us about your experience/), "  Great service!  ");
    await user.click(screen.getByRole("button", { name: "Send Message" }));

    await waitFor(() => expect(screen.getByText("Thanks for sharing!")).toBeInTheDocument());
    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      name: "Jane",
      rating: 3,
      message: "Great service!",
    });
  });

  it("defaults to a 5-star rating", async () => {
    insert.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    render(<TestimonialForm userId="user-1" name="Jane" email="jane@example.com" />);

    await user.type(screen.getByPlaceholderText(/Tell us about your experience/), "Great service!");
    await user.click(screen.getByRole("button", { name: "Send Message" }));

    await waitFor(() => expect(insert).toHaveBeenCalledWith(expect.objectContaining({ rating: 5 })));
  });
});
