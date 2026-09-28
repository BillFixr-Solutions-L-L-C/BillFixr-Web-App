import { describe, expect, it } from "vitest";
import { describeMissing, missingRequiredInformation } from "./requiredInformation";

const COMPLETE = {
  clientName: "Jane",
  address: "1 Main St",
  clientHospitalNumber: "45962",
  hospitalName: "General",
  billingManagerEmail: "b@h.com",
  hospitalAddress: "2 Care Rd",
  supportEmail: "s@h.com",
  billingPhone: "555-0100",
};

describe("missingRequiredInformation", () => {
  it("is satisfied only when every field is present", () => {
    expect(missingRequiredInformation(COMPLETE)).toEqual([]);
  });

  it("requires each of the eight fields", () => {
    for (const key of Object.keys(COMPLETE) as (keyof typeof COMPLETE)[]) {
      expect(missingRequiredInformation({ ...COMPLETE, [key]: "" })).toHaveLength(1);
    }
  });

  it("treats null, missing and whitespace-only alike", () => {
    expect(missingRequiredInformation({ ...COMPLETE, hospitalName: null })).toEqual(["Hospital Name"]);
    expect(missingRequiredInformation({ ...COMPLETE, hospitalName: "   " })).toEqual(["Hospital Name"]);
    expect(missingRequiredInformation({})).toHaveLength(8);
  });
});

describe("describeMissing", () => {
  it("names them while the list is short", () => {
    expect(describeMissing([])).toBe("");
    expect(describeMissing(["Hospital Name"])).toBe("Add Hospital Name before scanning this bill.");
    expect(describeMissing(["Hospital Name", "Support Email"])).toBe(
      "Add Hospital Name and Support Email before scanning this bill.",
    );
  });

  it("collapses a long list into a count rather than reeling off eight", () => {
    expect(describeMissing(["a", "b", "c", "d"])).toBe(
      "Fill in all 4 remaining required fields before scanning this bill.",
    );
  });
});
