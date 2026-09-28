// Everything on the information step is required before a bill may be
// scanned — the only exception is Email, which is taken from the account
// and isn't editable.
//
// One definition shared by the form and by the payment route, so the
// button and the server can never disagree about whether a bill is ready
// to scan.

export type RequiredInformation = {
  clientName: string | null;
  address: string | null;
  clientHospitalNumber: string | null;
  hospitalName: string | null;
  billingManagerEmail: string | null;
  hospitalAddress: string | null;
  supportEmail: string | null;
  billingPhone: string | null;
};

export const REQUIRED_LABELS: Record<keyof RequiredInformation, string> = {
  clientName: "Client Name",
  address: "Address",
  clientHospitalNumber: "Client Hospital Number",
  hospitalName: "Hospital Name",
  billingManagerEmail: "Billing Manager Email",
  hospitalAddress: "Hospital Address",
  supportEmail: "Support Email",
  billingPhone: "Billing Phone Number",
};

export function missingRequiredInformation(values: Partial<RequiredInformation>): string[] {
  return (Object.keys(REQUIRED_LABELS) as (keyof RequiredInformation)[])
    .filter((key) => !values[key]?.trim())
    .map((key) => REQUIRED_LABELS[key]);
}

// Naming a couple of fields is helpful; reeling off eight is not, so a
// long list collapses into a count.
export function describeMissing(missing: string[]): string {
  if (missing.length === 0) return "";
  if (missing.length > 3) {
    return `Fill in all ${missing.length} remaining required fields before scanning this bill.`;
  }
  const list =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(", ")} and ${missing[missing.length - 1]}`;
  return `Add ${list} before scanning this bill.`;
}
