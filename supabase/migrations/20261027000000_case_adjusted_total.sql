-- The Active Case "Original bill vs Adjusted bill" screen (Figma
-- 817:4651) shows two figures side by side: OVER BILLED and ADJUSTED
-- CHARGES. The first is cases.savings_found — the overcharge we
-- identified. The second is the corrected balance the provider came back
-- with, and nothing stored it, so the screen could not be built honestly.
--
-- Nullable: it only exists once a provider has actually responded with a
-- new bill. A null means "no adjusted bill yet", which the screen shows
-- rather than inventing a number.
--
-- Written by staff alongside the New Bill document they upload, so it
-- stays admin-only like every other analysis figure (see
-- cases_update_admin; customers have no UPDATE on cases).

alter table public.cases
  add column if not exists adjusted_total numeric(12, 2);

comment on column public.cases.adjusted_total is
  'Corrected bill total after the provider responded. Null until an adjusted bill exists. Paired with savings_found (the overcharge) on the Active Case comparison screen.';
