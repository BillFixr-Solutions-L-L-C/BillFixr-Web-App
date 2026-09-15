-- Same class of gap as the last two migrations, found by auditing every
-- remaining "for all/update using (is_admin())" write policy in the
-- schema: is_admin() alone gates these, with zero regard for which of
-- the 9 roles the caller actually holds. Every route below already
-- checks the correct domain at the application layer -- this migration
-- is what makes that check load-bearing at the database level too,
-- closing the "bypass the route, call supabase.from(...) directly from
-- devtools with your own session" vector for each one. Every
-- session-scoped write path in the app was checked against each policy
-- below before writing this migration (see BACKEND-PLAN.md Step 24);
-- none of them rely on broader access than what's granted here, so no
-- legitimate flow changes behavior. Reads are left exactly as broad as
-- they already were (is_admin()) -- matching the read/write split used
-- everywhere else in this project, and the scope of the last two fixes.

-- role_domain_access / roles: the permission system's own source
-- tables. Nothing in the app writes to either at runtime today (both are
-- migration-managed) -- but that also means an admin with system: none
-- could otherwise grant any role (including their own) full access to
-- every domain, directly. The roles policy's own original comment
-- ("any admin can manage roles for now -- can be tightened once a first
-- Super Admin exists to delegate from") flagged this as a deliberate,
-- temporary simplification; that condition has been true since Step 19.
drop policy "role_domain_access_write_admin" on public.role_domain_access;
create policy "role_domain_access_insert_admin" on public.role_domain_access
  for insert with check (public.get_domain_access('system') = 'full');
create policy "role_domain_access_update_admin" on public.role_domain_access
  for update using (public.is_admin()) with check (public.get_domain_access('system') = 'full');
create policy "role_domain_access_delete_admin" on public.role_domain_access
  for delete using (public.get_domain_access('system') = 'full');

drop policy "roles_write_admin" on public.roles;
create policy "roles_insert_admin" on public.roles
  for insert with check (public.get_domain_access('system') = 'full');
create policy "roles_update_admin" on public.roles
  for update using (public.is_admin()) with check (public.get_domain_access('system') = 'full');
create policy "roles_delete_admin" on public.roles
  for delete using (public.get_domain_access('system') = 'full');

-- cases: without this, any admin could set manual_review_status/
-- override_reason/approval_chain directly, bypassing the Manual Override
-- panel's negotiation:full route-level gate entirely.
drop policy "cases_admin_write" on public.cases;
create policy "cases_insert_admin" on public.cases
  for insert with check (public.get_domain_access('negotiation') = 'full');
create policy "cases_update_admin" on public.cases
  for update using (public.is_admin()) with check (public.get_domain_access('negotiation') = 'full');
create policy "cases_delete_admin" on public.cases
  for delete using (public.get_domain_access('negotiation') = 'full');

-- payment_records: undermines every server-side amount computation in
-- the payments design -- any admin could directly mark a record "paid"
-- or fabricate a refunded_amount. Every real write already goes through
-- the service role (create-intent, the Stripe webhook,
-- deleteAccountCascade) -- nothing legitimate uses the session-scoped
-- path today, so tightening it costs nothing.
drop policy "payment_records_admin_write" on public.payment_records;
create policy "payment_records_insert_admin" on public.payment_records
  for insert with check (public.get_domain_access('finance') = 'full');
create policy "payment_records_update_admin" on public.payment_records
  for update using (public.is_admin()) with check (public.get_domain_access('finance') = 'full');
create policy "payment_records_delete_admin" on public.payment_records
  for delete using (public.get_domain_access('finance') = 'full');

-- job_postings: job_postings_select_public already grants admin reads
-- independently, so no select-side policy needed here.
drop policy "job_postings_admin_write" on public.job_postings;
create policy "job_postings_insert_admin" on public.job_postings
  for insert with check (public.get_domain_access('hr') = 'full');
create policy "job_postings_update_admin" on public.job_postings
  for update using (public.is_admin()) with check (public.get_domain_access('hr') = 'full');
create policy "job_postings_delete_admin" on public.job_postings
  for delete using (public.get_domain_access('hr') = 'full');

-- The remaining tables already had update-only (not for-all) admin
-- policies, each with its own independent select policy already in
-- place -- just tighten the with_check directly, same shape as
-- profiles/chat_messages in the last two migrations.
drop policy "app_settings_update_admin" on public.app_settings;
create policy "app_settings_update_admin" on public.app_settings
  for update using (public.is_admin()) with check (public.get_domain_access('finance') = 'full');

drop policy "testimonials_update_admin" on public.testimonials;
create policy "testimonials_update_admin" on public.testimonials
  for update using (public.is_admin()) with check (public.get_domain_access('client_data') = 'full');

drop policy "support_tickets_update_admin" on public.support_tickets;
create policy "support_tickets_update_admin" on public.support_tickets
  for update using (public.is_admin()) with check (public.get_domain_access('client_data') = 'full');

drop policy "job_applications_update_admin" on public.job_applications;
create policy "job_applications_update_admin" on public.job_applications
  for update using (public.is_admin()) with check (public.get_domain_access('hr') = 'full');

drop policy "bills_update_admin_only" on public.bills;
create policy "bills_update_admin_only" on public.bills
  for update using (public.is_admin()) with check (public.get_domain_access('client_data') = 'full');

-- Deliberately NOT touched in this pass (see BACKEND-PLAN.md Step 24):
-- communication_logs and follow_ups (internal-only tables, no
-- established domain mapping, no money/permission/customer-facing
-- content at stake), and the avatars/bills storage bucket read policies
-- (read-only exposure -- any admin can view any user's file -- lower
-- severity than the write-side escalation gaps closed above).
