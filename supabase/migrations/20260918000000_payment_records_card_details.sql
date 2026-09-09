-- Security/honesty audit finding (BACKEND-PLAN.md Step 12): admin's
-- PaymentsTable fabricated a "Channel: Card" and a fake card-last-4
-- derived from the row's own id, since payment_records never captured
-- Stripe's real payment-method details at all. Add real columns and
-- populate them from the webhook going forward.
--
-- Nullable: success-fee payments under Stripe's $0.50 minimum are marked
-- paid without ever creating a real charge (Step 7), so they legitimately
-- have no card behind them; older rows predating this migration are also
-- null until repaid.
alter table public.payment_records
  add column card_brand text,
  add column card_last4 text;
