import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PasswordInput from "./PasswordInput";

describe("PasswordInput", () => {
  it("starts masked", () => {
    render(<PasswordInput placeholder="Password" value="secret" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Show password" })).toBeInTheDocument();
  });

  it("reveals the value on click and re-masks on a second click", async () => {
    const user = userEvent.setup();
    render(<PasswordInput placeholder="Password" value="secret" onChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByPlaceholderText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByPlaceholderText("Password")).toHaveAttribute("type", "password");
  });

  it("does not submit the enclosing form when the toggle is clicked", async () => {
    const handleSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={handleSubmit}>
        <PasswordInput placeholder="Password" value="secret" onChange={vi.fn()} />
      </form>,
    );

    await user.click(screen.getByRole("button", { name: "Show password" }));

    expect(handleSubmit).not.toHaveBeenCalled();
  });
});
