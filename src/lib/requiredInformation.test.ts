import { describe, expect, it } from "vitest";
import { describeMissing, missingRequiredInformation } from "./requiredInformation";

describe("missingRequiredInformation", () => {
  const complete = { clientName: "Jane", hospitalName: "General", billingManagerEmail: "b@h.com" };

  it("is satisfied when all three are present", () => {
    expect(missingRequiredInformation(complete)).toEqual([]);
  });

  it("treats null, missing and whitespace-only alike", () => {
    expect(missingRequiredInformation({ ...complete, hospitalName: null })).toEqual(["Hospital Name"]);
    expect(missingRequiredInformation({ ...complete, hospitalName: "   " })).toEqual(["Hospital Name"]);
    expect(missingRequiredInformation({})).toEqual(["Client Name", "Hospital Name", "Billing Manager Email"]);
  });

  it("does not require the optional fields", () => {
    expect(missingRequiredInformation({ ...complete, supportEmail: "" } as never)).toEqual([]);
  });
});

describe("describeMissing", () => {
  it("reads naturally for one, two and three", () => {
    expect(describeMissing([])).toBe("");
    expect(describeMissing(["Hospital Name"])).toBe("Add Hospital Name before scanning this bill.");
    expect(describeMissing(["Hospital Name", "Billing Manager Email"])).toBe(
      "Add Hospital Name and Billing Manager Email before scanning this bill.",
    );
    expect(describeMissing(["Client Name", "Hospital Name", "Billing Manager Email"])).toBe(
      "Add Client Name, Hospital Name and Billing Manager Email before scanning this bill.",
    );
  });
});
