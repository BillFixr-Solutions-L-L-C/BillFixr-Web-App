-- The success fee is 20% of the reduction (docs/FEES.md, decided 2026-11-02),
-- and the live app_settings row has said 20 for some time. Two places still
-- said 30: this column's default and the admin page's fallback.
--
-- Neither affected a real charge, because the row exists and carries 20. They
-- were waiting for a case where it does not: a fresh environment, or a row
-- deleted and re-created. Then the fee silently becomes half again as much as
-- the one we published, on a product whose whole promise is that a bill said
-- something nobody checked.
alter table public.app_settings
  alter column success_fee_percentage set default 20.00;

-- Deliberately not an UPDATE: the live value is already 20, and an admin may
-- legitimately have set something else at /admin/payments/percentage. A
-- default is what applies when nobody has decided; it is not a correction of
-- somebody who has.
