// The "Header Information" card on Analysis Complete (Figma): the details
// the AI extracts from the bill, editable by the customer afterwards.

export type HeaderKey =
  | "memberName"
  | "memberId"
  | "group"
  | "claimNumber"
  | "providerName"
  | "accountNumber"
  | "serviceDate"
  | "statementDate";

export type HeaderField = { key: HeaderKey; label: string; value: string; kind: "text" | "date" };

// Order matches the existing card layout.
export const HEADER_FIELD_DEFS: { key: HeaderKey; label: string; kind: "text" | "date" }[] = [
  { key: "memberName", label: "Member name", kind: "text" },
  { key: "memberId", label: "Member ID", kind: "text" },
  { key: "group", label: "Group", kind: "text" },
  { key: "claimNumber", label: "Claim number", kind: "text" },
  { key: "providerName", label: "Provider name", kind: "text" },
  { key: "accountNumber", label: "Account number", kind: "text" },
  { key: "serviceDate", label: "Date of service", kind: "date" },
  { key: "statementDate", label: "Statement date", kind: "date" },
];

// What the AI mapping (aiAnalysisMapping.ts) stores when it finds nothing.
// Clearing a field restores the same string, so hand-cleared and AI-empty
// fields render identically.
export const EMPTY_VALUE: Record<HeaderKey, string> = {
  memberName: "Not found",
  memberId: "No member ID found",
  group: "No group found",
  claimNumber: "No claim found",
  providerName: "Not found",
  accountNumber: "Not found",
  serviceDate: "Not found",
  statementDate: "Not found",
};

export function isEmptyValue(value: string): boolean {
  return /^(no .+ found|not found)$/i.test(value.trim());
}
