export const COMPLETED_STATUSES = ["resolved", "paid", "closed", "closed_no_errors"] as const;
export const PENDING_REVIEW_STATUSES = ["uploaded", "scanning", "analyzed"] as const;

export function isCaseCompleted(status: string): boolean {
  return (COMPLETED_STATUSES as readonly string[]).includes(status);
}

export function isPendingReview(status: string): boolean {
  return (PENDING_REVIEW_STATUSES as readonly string[]).includes(status);
}
