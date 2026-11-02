import { describe, expect, it } from "vitest";
import { CASE_STEPS, caseProgress, endedEarly } from "./caseProgress";
import { COMPLETED_STATUSES } from "./caseStatus";

// Exactly the statuses cases.status allows, from the check constraint in
// 20260826000000_initial_schema.sql. Kept as a literal list so a status
// added to the database without being taught here fails this file rather
// than putting a case at the wrong stage on an admin screen.
const ALL = [
  "uploaded",
  "scanning",
  "analyzed",
  "closed_no_errors",
  "letter_sent",
  "awaiting_response",
  "response_received",
  "resolved",
  "payment_pending",
  "paid",
  "closed",
];

describe("caseProgress", () => {
  it("places every status the database allows", () => {
    for (const status of ALL) {
      const { step, detail } = caseProgress(status);
      expect(step, status).not.toBeNull();
      expect(step, status).toBeGreaterThanOrEqual(0);
      expect(step, status).toBeLessThan(CASE_STEPS.length);
      expect(detail, status).not.toMatch(/Unrecognised/);
    }
  });

  it("agrees with caseStatus about which cases are finished", () => {
    // Two places decide "is this case over". They must not disagree.
    for (const status of ALL) {
      const expected = (COMPLETED_STATUSES as readonly string[]).includes(status);
      expect(caseProgress(status).done, status).toBe(expected);
    }
  });

  it("puts every finished case on the last step", () => {
    for (const status of COMPLETED_STATUSES) {
      expect(caseProgress(status).step, status).toBe(CASE_STEPS.length - 1);
    }
  });

  it("never moves backwards along the real sequence", () => {
    const sequence = [
      "uploaded",
      "scanning",
      "analyzed",
      "letter_sent",
      "awaiting_response",
      "response_received",
      "payment_pending",
      "paid",
    ];
    const steps = sequence.map((s) => caseProgress(s).step as number);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i], `${sequence[i]} after ${sequence[i - 1]}`).toBeGreaterThanOrEqual(steps[i - 1]);
    }
  });

  it("does not claim a scan happened while a case is still scanning", () => {
    // Seven production cases sit at "scanning" with nothing processing
    // them. The stage must not read as though the scan is done.
    expect(caseProgress("scanning").done).toBe(false);
    expect(caseProgress("scanning").detail).toMatch(/nothing advances this/i);
  });

  it("says why a no-errors case is finished, since it skipped the middle", () => {
    const { step, done, detail } = caseProgress("closed_no_errors");
    expect(step).toBe(CASE_STEPS.length - 1);
    expect(done).toBe(true);
    expect(detail).toMatch(/no fee/i);
    expect(endedEarly("closed_no_errors")).toBe(true);
    expect(endedEarly("paid")).toBe(false);
  });

  it("reports an unknown status as unknown rather than guessing a stage", () => {
    const { step, done, detail } = caseProgress("something_new");
    expect(step).toBeNull();
    expect(done).toBe(false);
    expect(detail).toContain("something_new");
  });
});
