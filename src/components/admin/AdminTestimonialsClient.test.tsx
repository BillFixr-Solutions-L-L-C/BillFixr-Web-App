import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import AdminTestimonialsClient from "./AdminTestimonialsClient";

const TESTIMONIALS = [
  { id: "t-1", name: "Alice Pending", email: "alice@example.com", message: "Great!", rating: 5, status: "pending" as const, createdAt: "2026-01-01" },
  { id: "t-2", name: "Bob Approved", email: "bob@example.com", message: "Good.", rating: 4, status: "approved" as const, createdAt: "2026-01-02" },
  { id: "t-3", name: "Carol Rejected", email: "carol@example.com", message: "Meh.", rating: 2, status: "rejected" as const, createdAt: "2026-01-03" },
];

describe("AdminTestimonialsClient", () => {
  it("filters by search text across name and email", async () => {
    const user = userEvent.setup();
    render(<AdminTestimonialsClient initialTestimonials={TESTIMONIALS} />);

    await user.type(screen.getByPlaceholderText("Search by name or email"), "bob@example.com");

    expect(screen.getByText("Bob Approved")).toBeInTheDocument();
    expect(screen.queryByText("Alice Pending")).not.toBeInTheDocument();
    expect(screen.queryByText("Carol Rejected")).not.toBeInTheDocument();
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    render(<AdminTestimonialsClient initialTestimonials={TESTIMONIALS} />);

    await user.selectOptions(screen.getByDisplayValue("All statuses"), "Pending");

    expect(screen.getByText("Alice Pending")).toBeInTheDocument();
    expect(screen.queryByText("Bob Approved")).not.toBeInTheDocument();
    expect(screen.queryByText("Carol Rejected")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<AdminTestimonialsClient initialTestimonials={TESTIMONIALS} />);

    await user.type(screen.getByPlaceholderText("Search by name or email"), "nobody-matches");

    expect(screen.getByText("No testimonials match your search.")).toBeInTheDocument();
  });
});
