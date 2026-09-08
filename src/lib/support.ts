// Sent automatically after a real user message on the live-chat widget —
// a static acknowledgment, not an AI reply. Real AI/agent responses are a
// separate, later workstream (see BACKEND-PLAN.md Step 7's contract stub
// notes). Shared between the client's optimistic UI update and the server
// route that actually persists it, so the two never drift apart.
export const CANNED_AGENT_REPLY =
  "Thanks for your message — a member of our support team will follow up here shortly.";
