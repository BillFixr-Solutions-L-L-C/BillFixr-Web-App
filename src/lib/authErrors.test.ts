import { describe, expect, it } from "vitest";
import { friendlyAuthError } from "./authErrors";

describe("friendlyAuthError", () => {
  it("rewrites Supabase's password-complexity message", () => {
    expect(
      friendlyAuthError(
        "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.",
      ),
    ).toBe("Password must include a lowercase letter, an uppercase letter, and a number.");
  });

  it("passes through unrecognized messages unchanged", () => {
    expect(friendlyAuthError("Invalid login credentials")).toBe("Invalid login credentials");
  });
});
