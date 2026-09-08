-- Found while implementing Step 7's create-intent route: commitment-fee
-- payment_records rows are written before a case exists (a case is only
-- created once the webhook confirms payment), so case_id can't be used to
-- look up "does this bill already have a commitment-fee record" the way
-- the plan assumed. Nullable — success_fee records don't have a bill_id,
-- they're keyed on case_id, which the table already had.
alter table public.payment_records
  add column bill_id uuid references public.bills (id);

create index payment_records_bill_id_idx on public.payment_records (bill_id) where bill_id is not null;
